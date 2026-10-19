"""Build the static Netlify drop for UHI Factory: site/ + a snapshot of the live service (state, events, outputs).
python -I your-robot/tools/build_deploy.py   (service on :5447 if you want a fresh snapshot; otherwise it reads service/data)
Writes deploy/site/ and deploy/uhi-factory-netlify-latest.zip (one zip, always overwritten).
"""
import os, json, shutil, urllib.request, datetime, zipfile, glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site"); DEP = os.path.join(ROOT, "deploy"); OUT = os.path.join(DEP, "site"); DATA = os.path.join(ROOT, "service", "data")
os.makedirs(OUT, exist_ok=True)
for n in os.listdir(OUT):  # clear contents, not the folder (a local preview server may hold it open)
    q = os.path.join(OUT, n); shutil.rmtree(q) if os.path.isdir(q) else os.remove(q)
shutil.copytree(SITE, OUT, dirs_exist_ok=True)
os.makedirs(os.path.join(OUT, "data", "outputs"), exist_ok=True)

def live(path):
    try:
        with urllib.request.urlopen("http://127.0.0.1:5447" + path, timeout=10) as r: return json.load(r)
    except Exception: return None

state = live("/api/state"); events = live("/api/events?limit=600")
src = "live service"
if state is None or events is None:
    src = "service/data on disk"
    evs = [json.loads(l) for l in open(os.path.join(DATA, "events.jsonl"), encoding="utf-8") if l.strip()]
    events = evs[-600:]
    # minimal state from the outputs on disk (the server would compute more; this keeps the page honest, not empty)
    robots = {}
    for f in sorted(glob.glob(os.path.join(DATA, "outputs", "*.json"))):
        o = json.load(open(f, encoding="utf-8")); r = robots.setdefault(o["robot"], {"id": o["robot"], "name": o["name"], "role": o["role"], "industry": "", "every": 0, "writer": bool(o.get("text")), "gradeRule": "", "status": "idle", "shifts": 0, "tasks": 0, "credits": 0, "usd": 0, "lastRun": 0, "nextRun": 0, "lastSummary": "", "lastOutput": None, "grades": [], "history": [], "errors": 0})
        r["shifts"] += 1; r["tasks"] += len(o.get("items", [])); r["credits"] += o.get("credits", 0); r["usd"] += o.get("usd", 0); r["lastRun"] = o["t"]; r["lastSummary"] = o["summary"]; r["lastOutput"] = o["id"]; r["history"].append({"t": o["t"], "tasks": len(o.get("items", [])), "credits": o.get("credits", 0)})
        if o.get("grade"): r["grades"].append({"t": o["t"], "score": o["grade"].get("score")})
    state = {"totals": {"version": open(os.path.join(ROOT, "version.txt")).read().strip(), "started": 0, "now": int(datetime.datetime.now().timestamp() * 1000), "model": "", "creditUsd": 0.01, "robots": len(robots), "awake": len(robots), "shifts": sum(r["shifts"] for r in robots.values()), "tasks": sum(r["tasks"] for r in robots.values()), "credits": round(sum(r["credits"] for r in robots.values()), 2), "usd": round(sum(r["usd"] for r in robots.values()), 4), "actionsHour": 0, "actionsDay": 0, "outputsDay": 0, "grades": [g["score"] for r in robots.values() for g in r["grades"] if g["score"] is not None], "events": len(evs)}, "robots": list(robots.values())}
json.dump(state, open(os.path.join(OUT, "data", "state.json"), "w", encoding="utf-8"))
json.dump(events, open(os.path.join(OUT, "data", "events.json"), "w", encoding="utf-8"))
ids = []
for r in state["robots"]:
    if r.get("lastOutput"):
        p = os.path.join(DATA, "outputs", r["lastOutput"] + ".json")
        if os.path.exists(p): shutil.copy(p, os.path.join(OUT, "data", "outputs", r["lastOutput"] + ".json")); ids.append(r["lastOutput"])
# the last 40 outputs too, for the shelf links
for f in sorted(glob.glob(os.path.join(DATA, "outputs", "*.json")))[-40:]:
    shutil.copy(f, os.path.join(OUT, "data", "outputs", os.path.basename(f))); ids.append(os.path.basename(f)[:-5])
json.dump(sorted(set(ids)), open(os.path.join(OUT, "data", "outputs", "index.json"), "w"))
at = datetime.datetime.now(datetime.timezone.utc).isoformat()
json.dump({"at": at, "source": src, "note": "Static copy of the floor. The live service runs on the developer's machine; this snapshot is what it looked like at `at`."}, open(os.path.join(OUT, "data", "snapshot.json"), "w"))
open(os.path.join(OUT, "_headers"), "w").write("/*\n  X-Frame-Options: SAMEORIGIN\n  Cache-Control: public, max-age=300\n/assets/*\n  Cache-Control: public, max-age=604800\n")
open(os.path.join(OUT, "robots.txt"), "w").write("User-agent: *\nAllow: /\n")
zp = os.path.join(DEP, "uhi-factory-netlify-latest.zip")
with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
    for dp, _, fs in os.walk(OUT):
        for f in fs: full = os.path.join(dp, f); z.write(full, os.path.relpath(full, OUT))
print("snapshot from", src, "at", at, "| robots", len(state["robots"]), "events", len(events), "outputs", len(set(ids)))
print("zip", zp, round(os.path.getsize(zp) / 1e6, 2), "MB")

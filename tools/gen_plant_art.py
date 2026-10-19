"""Generate THE PLANT's art kit with the OpenAI image API (gpt-image-1, transparent PNG), 3 at a time.
Run:  python -I your-robot/tools/gen_plant_art.py            (skips files that already exist)
Out:  your-robot/art-src/plant/<name>.png  +  your-robot/site/assets/plant/<name>.webp (trimmed, max 512px)
Cost: medium quality 1024x1024 ≈ 4-6 cents each; the kit is ~23 images.
"""
import json, os, sys, base64, urllib.request, concurrent.futures, io
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = open(os.path.join(os.path.dirname(ROOT), ".openai-key"), encoding="utf-8").read().strip()
SRC = os.path.join(ROOT, "art-src", "plant"); OUT = os.path.join(ROOT, "site", "assets", "plant")
os.makedirs(SRC, exist_ok=True); os.makedirs(OUT, exist_ok=True)

MAT = ("Material language: brushed chrome and dark bevelled steel with cool white highlights and a faint cyan (#64BBD8) accent light, "
       "photographic product render, soft studio light from the upper left, isometric view (30 degree dimetric, seen from the north-west), "
       "no text, no letters, no logos, no people, no background scenery, clean silhouette, centered, transparent background.")
TILE = "Isometric floor tile, a flat 2:1 diamond (rhombus) seen from above at the isometric angle, "

ASSETS = {
  # floor + walls
  "tile-floor":   TILE + "black polished concrete with a faint hairline cyan safety stripe along one edge, the whole image is only the diamond tile. " + MAT,
  "tile-dock":    TILE + "dark steel loading-dock plate with raised chrome rivets and chevron grip texture, the whole image is only the diamond tile. " + MAT,
  "wall-north":   "Isometric factory wall segment running along the back-right edge of a room, dark steel panels with chrome trim, a large flat matte-black wall screen in the middle (empty, no content) with a thin wireframe globe etched faintly on the frame, catwalk railing along the top. " + MAT,
  "wall-west":    "Isometric factory wall segment running along the back-left edge of a room, dark steel panels with chrome trim and a few cyan status lamps, catwalk railing along the top. " + MAT,
  "door-roller":  "Isometric industrial roller door, half open, chrome slats and dark steel frame, set into a short wall piece, a small cyan lamp above it. " + MAT,
  # stations
  "station-desk":   "Isometric trading-desk workstation for a small robot: chrome desk with dark top, one wide flat matte-black monitor (empty screen), a chrome stool, small cable tray. " + MAT,
  "station-scanner":"Isometric inspection bench for a small robot: chrome bench with a glass scanner dome, a flat matte-black readout screen (empty), a small cyan status lamp. " + MAT,
  "station-bench":  "Isometric plain workbench for a line worker robot: brushed steel bench, a small flat matte-black panel (empty), nothing else. " + MAT,
  "station-chair":  "Isometric small chrome stool with a dark cushion, for a resting robot. " + MAT,
  # the line
  "belt-straight":  "Isometric straight conveyor belt segment, one tile long, dark rubber belt with chrome side rails and rollers, running from lower-left to upper-right. " + MAT,
  "belt-curve":     "Isometric conveyor belt curve segment, a smooth quarter turn, dark rubber belt with chrome side rails, swooping like a ribbon. " + MAT,
  "belt-end":       "Isometric conveyor belt end piece with a chrome drum roller and a small chute lip. " + MAT,
  "gate-booth":     "Isometric quality-inspection booth: chrome frame arch over a belt gap, a stamp arm raised above, a small flat matte-black readout (empty), two unlit round lamps on the post. " + MAT,
  "chute":          "Isometric chrome delivery chute set into a dark wall piece, an opening with a soft cyan glow inside and a small counter panel (empty) above. " + MAT,
  # crates
  "crate-fee":      "Isometric small dark steel crate with chrome edges, closed, a small cyan dot lamp on the lid. " + MAT,
  "crate-output":   "Isometric small glowing crate, chrome edges, frosted glass sides lit from within with cyan-white light. " + MAT,
  # robot body sheet (one facing; the other side is mirrored in code)
  "bot-idle":   "A small cute robot standing: a glossy white sphere head and body (one sphere) with two short black dash-shaped eyes, slim brushed-chrome legs and feet, no arms, standing still, facing the lower-left (south-west) at the isometric angle. Full body, nothing cropped. " + MAT,
  "bot-walk-a": "A small cute robot mid-stride: glossy white sphere body with two short black dash eyes, slim chrome legs, left leg forward, walking toward the lower-left (south-west) at the isometric angle. Full body, nothing cropped. " + MAT,
  "bot-walk-b": "A small cute robot mid-stride: glossy white sphere body with two short black dash eyes, slim chrome legs, right leg forward, walking toward the lower-left (south-west) at the isometric angle. Full body, nothing cropped. " + MAT,
  "bot-work":   "A small cute robot working: glossy white sphere body with two short black dash eyes leaning slightly forward, slim chrome legs, two thin chrome arms extended forward as if typing, facing the upper-right (north-east) at the isometric angle. Full body, nothing cropped. " + MAT,
  "bot-carry":  "A small cute robot carrying a small glowing crate in front of it with two thin chrome arms: glossy white sphere body with two short black dash eyes, slim chrome legs, facing the lower-right (south-east) at the isometric angle. Full body, nothing cropped. " + MAT,
  # small sprites
  "lamp-pass":   "A bright lens-flare sparkle: a four-point star flare with a soft white core and cyan-white rays, like a chrome logo glint, on nothing. " + MAT,
  "lamp-low":    "A small round industrial lamp glowing warm amber in a chrome housing, isometric. " + MAT,
  "sign-forecast": "A small rectangular matte-grey industrial sign plate on a chrome post, blank, isometric, no text. " + MAT,
  "lamp-hand":   "A small chrome handheld lantern with a cyan-white glow, isometric. " + MAT,
}

def gen(name, prompt):
    dst = os.path.join(SRC, name + ".png")
    if os.path.exists(dst): return name, "exists"
    body = {"model": "gpt-image-1", "prompt": prompt, "size": "1024x1024", "quality": "medium", "n": 1, "output_format": "png", "background": "transparent"}
    req = urllib.request.Request("https://api.openai.com/v1/images/generations", data=json.dumps(body).encode(), headers={"content-type": "application/json", "authorization": "Bearer " + KEY})
    for attempt in range(3):
        try:
            r = json.load(urllib.request.urlopen(req, timeout=240)); d = r["data"][0]
            png = base64.b64decode(d["b64_json"]) if d.get("b64_json") else urllib.request.urlopen(d["url"], timeout=60).read()
            open(dst, "wb").write(png); return name, f"ok {r.get('usage', {}).get('output_tokens')}"
        except Exception as e:
            err = str(e)[:120]
    return name, "FAIL " + err

def finish(name):
    src = os.path.join(SRC, name + ".png")
    if not os.path.exists(src): return
    im = Image.open(src).convert("RGBA")
    bbox = im.getbbox()
    if bbox: im = im.crop(bbox)
    im.thumbnail((512, 512), Image.LANCZOS)
    im.save(os.path.join(OUT, name + ".webp"), "WEBP", quality=88)
    return im.size

if __name__ == "__main__":
    only = sys.argv[1:]  # optional names
    todo = [(k, v) for k, v in ASSETS.items() if not only or k in only]
    print(f"generating {len(todo)} assets, 3 at a time")
    with concurrent.futures.ThreadPoolExecutor(3) as ex:
        for name, status in ex.map(lambda kv: gen(*kv), todo):
            print(name, status, finish(name), flush=True)
    manifest = {}
    for name in ASSETS:
        p = os.path.join(OUT, name + ".webp")
        if os.path.exists(p):
            w, h = Image.open(p).size; manifest[name] = {"w": w, "h": h}
    json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
    print("manifest", len(manifest))

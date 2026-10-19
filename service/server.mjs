// YOUR ROBOT service: runs the staff robots on their schedules, keeps the event log, streams it, serves the site.
// Local: `node your-robot/service/server.mjs` → http://localhost:5447/   Flags: --once (run every robot now, then keep serving)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { STAFF, gradeOutput, MODEL_NAME } from './robots.mjs';
import { hasLLM, CREDIT_USD } from './llm.mjs';

export const VERSION = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'version.txt'), 'utf8').trim();
const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR || path.join(here, 'data');
const SITE = path.resolve(here, '..', 'site');
const PORT = +(process.env.PORT || 5447);
const HOST = process.env.HOST || '127.0.0.1';
const ONCE = process.argv.includes('--once');
const STARTED = Date.now();
fs.mkdirSync(path.join(DATA, 'outputs'), { recursive: true });

/* ---------- event log ---------- */
const LOG = path.join(DATA, 'events.jsonl');
const events = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
const clients = new Set();
let seq = events.length ? events[events.length - 1].seq || events.length : 0;
function emit(type, body) {
  const ev = { seq: ++seq, t: Date.now(), type, ...body };
  events.push(ev);
  fs.appendFileSync(LOG, JSON.stringify(ev) + '\n');
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const c of clients) c.write(line);
  return ev;
}

/* ---------- robot state ---------- */
const state = {};
for (const r of STAFF) state[r.id] = { id: r.id, name: r.name, role: r.role, industry: r.industry, every: r.every, writer: r.writer, gradeRule: r.grade, status: 'idle', shifts: 0, tasks: 0, credits: 0, usd: 0, lastRun: 0, nextRun: 0, lastSummary: '', lastOutput: null, grades: [], history: [], errors: 0 };
// rebuild counters from the log so a restart keeps the history
for (const ev of events) {
  const s = state[ev.robot]; if (!s) continue;
  if (ev.type === 'shift.output') { s.shifts++; s.tasks += ev.tasks || 0; s.credits += ev.credits || 0; s.usd += ev.usd || 0; s.lastRun = ev.t; s.lastSummary = ev.summary; s.lastOutput = ev.outputId; s.history.push({ t: ev.t, tasks: ev.tasks || 0, credits: ev.credits || 0, ms: ev.ms || 0 }); }
  if (ev.type === 'shift.grade') s.grades.push({ t: ev.t, score: ev.score });
  if (ev.type === 'shift.error') s.errors++;
}
for (const s of Object.values(state)) { s.history = s.history.slice(-48); s.grades = s.grades.slice(-24); s.nextRun = s.lastRun ? s.lastRun + s.every : Date.now() + 3000; }

/* ---------- shifts ---------- */
const running = new Set();
async function shift(robot) {
  const s = state[robot.id];
  if (running.has(robot.id)) return;
  running.add(robot.id);
  const t0 = Date.now();
  s.status = 'reading';
  emit('shift.start', { robot: robot.id, state: 'reading' });
  try {
    const out = await robot.run();
    s.status = 'working';
    const tasks = (out.items || []).length + (out.text ? 1 : 0);
    const credits = out.llm?.credits || 0, usd = out.llm?.cost || 0;
    const outputId = `${robot.id}-${t0}`;
    const record = { id: outputId, robot: robot.id, name: robot.name, role: robot.role, t: t0, ms: Date.now() - t0, summary: out.summary, items: out.items || [], links: out.links || [], data: out.data || {}, text: out.text || null, model: out.llm ? out.llm.model : null, tokens: out.llm ? out.llm.usage : null, credits, usd, outcomeCheck: out.outcomeCheck || null };
    fs.writeFileSync(path.join(DATA, 'outputs', outputId + '.json'), JSON.stringify(record, null, 1));
    for (const [i, it] of (out.items || []).entries()) emit('shift.task', { robot: robot.id, i, label: it.label, value: it.value, link: it.link });
    s.shifts++; s.tasks += tasks; s.credits += credits; s.usd += usd; s.lastRun = t0; s.lastSummary = out.summary; s.lastOutput = outputId;
    s.history.push({ t: t0, tasks, credits, ms: record.ms }); s.history = s.history.slice(-48);
    emit('shift.output', { robot: robot.id, outputId, summary: out.summary, tasks, credits, usd, ms: record.ms, links: (out.links || []).slice(0, 3), hasText: !!out.text });
    if (out.text) {
      s.status = 'waiting';
      emit('robot.state', { robot: robot.id, state: 'waiting' });
      const g = await gradeOutput(robot, out);
      const gcred = g.llm?.credits || 0;
      s.grades.push({ t: Date.now(), score: g.score }); s.grades = s.grades.slice(-24);
      record.grade = { score: g.score, note: g.note }; fs.writeFileSync(path.join(DATA, 'outputs', outputId + '.json'), JSON.stringify(record, null, 1));
      emit('shift.grade', { robot: robot.id, outputId, score: g.score, note: g.note, credits: gcred, usd: g.llm?.cost || 0 });
      state.grader.shifts++; state.grader.credits += gcred; state.grader.usd += g.llm?.cost || 0; state.grader.lastRun = Date.now(); state.grader.lastSummary = `Graded ${robot.name}: ${g.score ?? '—'}`;
      state.grader.history.push({ t: Date.now(), tasks: 1, credits: gcred, ms: g.llm?.ms || 0 }); state.grader.history = state.grader.history.slice(-48);
    }
    s.status = 'graded';
  } catch (e) {
    s.errors++; s.status = 'idle';
    emit('shift.error', { robot: robot.id, error: String(e.message || e).slice(0, 200) });
  } finally {
    s.nextRun = Date.now() + robot.every;
    running.delete(robot.id);
    setTimeout(() => { if (s.status === 'graded' || s.status === 'working') { s.status = 'idle'; emit('robot.state', { robot: robot.id, state: 'idle' }); } }, 90_000);
  }
}

// the Grader and the Night Watchman are staff too
state.grader = { id: 'grader', name: 'Grader', role: 'VERIFIER / GATE', industry: 'The agency', every: 0, writer: true, gradeRule: 'rubric, fixed', status: 'idle', shifts: 0, tasks: 0, credits: 0, usd: 0, lastRun: 0, nextRun: 0, lastSummary: '', lastOutput: null, grades: [], history: [], errors: 0 };
state.watch = { id: 'watch', name: 'Night watchman', role: 'WATCHMAN / ROUTER', industry: 'The agency', every: 10 * 60_000, writer: false, gradeRule: 'hard check: heartbeats', status: 'idle', shifts: 0, tasks: 0, credits: 0, usd: 0, lastRun: 0, nextRun: 0, lastSummary: '', lastOutput: null, grades: [], history: [], errors: 0 };
for (const ev of events) { if (ev.type === 'shift.grade') { state.grader.shifts++; state.grader.credits += ev.credits || 0; state.grader.usd += ev.usd || 0; state.grader.lastRun = ev.t; } if (ev.type === 'watch.report') { state.watch.shifts++; state.watch.lastRun = ev.t; state.watch.lastSummary = ev.summary; } }

function watchReport() {
  const robots = Object.values(state);
  const awake = robots.filter((r) => r.status !== 'asleep').length;
  const since = Date.now() - 60 * 60_000;
  const shiftsHour = events.filter((e) => e.type === 'shift.output' && e.t > since).length;
  const creditsHour = events.filter((e) => (e.type === 'shift.output' || e.type === 'shift.grade') && e.t > since).reduce((a, e) => a + (e.credits || 0), 0);
  const summary = `${awake}/${robots.length} awake · ${shiftsHour} shifts and ${creditsHour.toFixed(1)} credits in the last hour · ${hasLLM() ? MODEL_NAME : 'no model key'}`;
  state.watch.shifts++; state.watch.lastRun = Date.now(); state.watch.lastSummary = summary; state.watch.nextRun = Date.now() + state.watch.every;
  state.watch.history.push({ t: Date.now(), tasks: robots.length, credits: 0, ms: 0 }); state.watch.history = state.watch.history.slice(-48);
  emit('watch.report', { robot: 'watch', summary, awake, total: robots.length, shiftsHour, creditsHour });
}

function totals() {
  const robots = Object.values(state);
  const hour = Date.now() - 3_600_000, day = Date.now() - 86_400_000;
  const ev = (f) => events.filter(f);
  const credits = robots.reduce((a, r) => a + r.credits, 0), usd = robots.reduce((a, r) => a + r.usd, 0);
  return {
    version: VERSION, started: STARTED, now: Date.now(), model: hasLLM() ? MODEL_NAME : null, creditUsd: CREDIT_USD,
    robots: robots.length, awake: robots.filter((r) => r.status !== 'asleep').length,
    shifts: robots.reduce((a, r) => a + r.shifts, 0), tasks: robots.reduce((a, r) => a + r.tasks, 0),
    credits: +credits.toFixed(2), usd: +usd.toFixed(4),
    actionsHour: ev((e) => e.t > hour && e.type.startsWith('shift.')).length, actionsDay: ev((e) => e.t > day && e.type.startsWith('shift.')).length,
    outputsDay: ev((e) => e.t > day && e.type === 'shift.output').length,
    grades: robots.flatMap((r) => r.grades.map((g) => g.score)).filter((x) => x != null),
    logo: fs.existsSync(path.join(SITE, 'assets', 'uhi-logo.png')), events: events.length, fundedBy: 'the agency (slice 0: no coins, no fees; wages paid from our own budget)',
  };
}

/* ---------- http ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
function send(res, code, body, type = 'application/json') { res.writeHead(code, { 'content-type': type, 'access-control-allow-origin': '*', 'cache-control': 'no-store' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); }
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/state') return send(res, 200, { totals: totals(), robots: Object.values(state).map((r) => ({ ...r, history: r.history.slice(-48) })) });
  if (u.pathname === '/api/events') { const since = +(u.searchParams.get('since') || 0); const limit = +(u.searchParams.get('limit') || 400); const out = events.filter((e) => e.seq > since); return send(res, 200, out.slice(-limit)); }
  if (u.pathname === '/api/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'access-control-allow-origin': '*' });
    res.write(`: hello ${VERSION}\n\n`); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (u.pathname.startsWith('/api/outputs/')) {
    const id = u.pathname.split('/').pop().replace(/[^a-z0-9-]/gi, ''); const p = path.join(DATA, 'outputs', id + '.json');
    return fs.existsSync(p) ? send(res, 200, fs.readFileSync(p)) : send(res, 404, { error: 'no such output' });
  }
  if (u.pathname === '/api/outputs') { const list = fs.readdirSync(path.join(DATA, 'outputs')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort(); return send(res, 200, list.slice(-200)); }
  if (u.pathname === '/data/snapshot.json') return send(res, 200, { live: true }); // the page probes this to tell a static copy from the live service
  if (u.pathname === '/api/health') return send(res, 200, { ok: true, version: VERSION, uptime: Date.now() - STARTED, llm: hasLLM() });
  // static site
  let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(SITE, p));
  if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'not found', 'text/plain');
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res);
});

/* ---------- scheduler ---------- */
function tick() {
  const now = Date.now();
  for (const r of STAFF) if (now >= state[r.id].nextRun && !running.has(r.id)) shift(r);
  if (now >= state.watch.nextRun) watchReport();
}
server.listen(PORT, HOST, () => {
  console.log(`YOUR ROBOT service v${VERSION} on http://localhost:${PORT}/  (${hasLLM() ? 'model ' + MODEL_NAME : 'NO model key: data-only shifts'}) events=${events.length}`);
  if (ONCE) for (const r of STAFF) state[r.id].nextRun = 0;
  state.watch.nextRun = Date.now() + 5000;
  setInterval(tick, 5000); tick();
  setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25_000);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); process.exit(0); });

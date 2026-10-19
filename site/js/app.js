// UHI FACTORY slice 0: the floor (figures, verbs, graph, motion), workforce cards, ledger, launch preview, stream, welcome-back (visitor mode).
// Every real number comes from /api/state or the event log. Forecast robots only make motion.
import { createGraph } from './graph.js';
import { createPlant } from './plant.js';
import { createSound } from './sound.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ago = (t) => { if (!t) return '—'; const s = (Date.now() - t) / 1000; return s < 60 ? `${Math.round(s)}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
const inMs = (t) => { const s = (t - Date.now()) / 1000; return s <= 0 ? 'now' : s < 60 ? `in ${Math.round(s)}s` : s < 3600 ? `in ${Math.round(s / 60)}m` : `in ${(s / 3600).toFixed(1)}h`; };
const hhmm = (t) => new Date(t).toISOString().slice(11, 16);
const pad2 = (n) => String(n).padStart(2, '0');
const FACES = ['face-1', 'face-2', 'face-3', 'face-4', 'face-5', 'face-6', 'glyph'];

// Live service when it is there; otherwise the snapshot files the deploy build writes into data/ (Netlify has no Node).
// The deploy build writes data/snapshot.json; its presence means "static copy", so no request ever goes to a missing API.
let STATIC = false; let snapshotAt = null;
try { const sn = await fetch('data/snapshot.json'); if (sn.ok) { const j = await sn.json(); if (j.at) { STATIC = true; snapshotAt = j.at; } } } catch {}
async function api(path, fallback) { const r = await fetch(STATIC ? fallback : path); if (!r.ok) throw new Error('no data for ' + path); return r.json(); }
const catalog = await (await fetch('data/catalog.json')).json();
let state = await api('/api/state', 'data/state.json');
let events = await api('/api/events?limit=400', 'data/events.json');
const ROBOTS = () => state.robots;
const lastSeq = () => (events.length ? events[events.length - 1].seq : 0);

/* ---------- figures ---------- */
const figures = [{ n: 0, kind: 'economy', title: 'The economy', sub: 'all districts' }];
for (const r of ROBOTS()) figures.push({ n: figures.length, kind: 'robot', id: r.id, title: r.name, sub: r.role });
for (const ind of catalog.industries) figures.push({ n: figures.length, kind: 'district', id: ind.id, title: ind.name.replace(/\s*\(.*\)/, ''), sub: `${ind.jobs.filter((j) => j.tier !== 'D').length} jobs · forecast` });
let current = 0;
const INSTR = {
  economy: 'work orders arrive at the rim, robots spend compute on them, outputs leave for the agency — tap a district to zoom, tap empty space to zoom out',
  robot: (r) => `${r.writer ? 'reads real inputs, writes a note, waits for the grader' : 'reads real inputs, lists what it found'} — every ${Math.round(r.every / 60000)} min, graded by ${r.gradeRule}`,
  district: (f) => `the ${f.title.toLowerCase()} district of the forecast floor — modelled motion only, hiring opens in slice 1`,
};
function renderFigs() {
  $('#figs').innerHTML = figures.map((f) => `<button type="button" class="pill sm ${f.n === current ? 'on' : ''}" data-fig="${f.n}">${f.kind === 'robot' ? '● ' : ''}${pad2(f.n)} ${esc(f.title)}</button>`).join('');
  for (const b of document.querySelectorAll('[data-fig]')) b.addEventListener('click', () => show(+b.dataset.fig));
  const on = $('#figs .on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}
function show(n, fromGraph = false) {
  current = (n + figures.length) % figures.length; const f = figures[current];
  $('#figTitle').textContent = `Fig. ${pad2(f.n)} — ${f.title}`;
  const r = f.kind === 'robot' ? ROBOTS().find((x) => x.id === f.id) : null;
  $('#figKind').textContent = f.kind === 'economy' ? 'ECONOMY · 30 DISTRICTS' : f.kind === 'robot' ? `REAL WORKER · ${(r?.industry || '').toUpperCase()}` : 'DISTRICT · FORECAST';
  $('#figInstr').textContent = f.kind === 'economy' ? INSTR.economy : f.kind === 'robot' ? INSTR.robot(r) : INSTR.district(f);
  renderVerbs(f, r);
  if (!fromGraph) { if (f.kind === 'economy') graph.zoomOut(); else if (f.kind === 'robot') graph.focusRobot(f.id); else graph.zoomTo(f.id); if (view === 'plant') { if (f.kind === 'economy') plant.overview(); else if (f.kind === 'robot') { const r2 = ROBOTS().find((x) => x.id === f.id); const h = r2 && plant.hallFor(r2.industry); plant.enter(h ? h.id : 'agency'); } else { const h = plant.hallFor(f.title); if (h) plant.enter(h.id); } } }
  renderFigs();
}
function renderVerbs(f, r) {
  const v = $('#verbs'); let html = '';
  if (f.kind === 'economy') html = `<button class="pill sm" type="button" data-act="replay">Replay the last hour</button><button class="pill sm" type="button" data-act="friday">Jump to payroll</button><button class="pill sm" type="button" data-act="next">Next figure →</button>`;
  else if (f.kind === 'robot') html = `<button class="pill sm" type="button" data-act="open" ${r?.lastOutput ? '' : 'disabled'}>Open last output</button><button class="pill sm" type="button" data-act="sources" ${r?.lastOutput ? '' : 'disabled'}>Show sources</button><button class="pill sm" type="button" disabled>Next shift ${r?.every ? inMs(r.nextRun) : '—'}</button><button class="pill sm" type="button" data-act="economy">← Economy</button>`;
  else html = `<button class="pill sm" type="button" data-act="catalog">See its ${f.sub.split(' ')[0]} jobs</button><button class="pill sm" type="button" data-act="hire">Hire a worker here</button><button class="pill sm" type="button" data-act="economy">← Economy</button>`;
  v.innerHTML = html;
  for (const b of v.querySelectorAll('[data-act]')) b.addEventListener('click', () => act(b.dataset.act, f, r));
}
function act(a, f, r) {
  if (a === 'economy') show(0);
  else if (a === 'next') show(current + 1);
  else if (a === 'open') openOutput(r.id);
  else if (a === 'sources') openOutput(r.id, true);
  else if (a === 'catalog') location.href = 'catalog.html#ind' + f.id;
  else if (a === 'hire') { const sel = $('#lJob'); const opt = [...sel.options].find((o) => o.dataset.ind === String(f.id)); if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change')); } $('#launch').scrollIntoView({ behavior: 'smooth' }); }
  else if (a === 'friday') $('#ready').scrollIntoView({ behavior: 'smooth', block: 'center' });
  else if (a === 'replay') { const since = Date.now() - 3600e3; const evs = events.filter((e) => e.t > since && e.type.startsWith('shift.')); evs.forEach((e, i) => setTimeout(() => { graph.event(e); plant.event(e); }, i * 90)); $('#figInstr').textContent = `replaying ${evs.length} real events from the last hour at 10× speed`; }
}
document.addEventListener('keydown', (e) => { if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return; if (e.key === 'ArrowRight') show(current + 1); if (e.key === 'ArrowLeft') show(current - 1); if (e.key === 'Escape') $('#modal').classList.remove('on'); });

/* ---------- graph ---------- */
const canvas = $('#graph'), tip = $('#tip');
const graph = createGraph(canvas, {
  industries: catalog.industries, staff: ROBOTS(),
  onPick(nd, viaFigure) {
    const crumb = $('#crumb');
    if (!nd) { crumb.innerHTML = '<b>ECONOMY</b> · 30 districts'; if (!viaFigure && current !== 0) show(0, true); return; }
    if (nd.kind === 'district') { crumb.innerHTML = `<b>${esc(nd.label.toUpperCase())}</b> · ${nd.robots.filter((r) => r.real).length} real · ${nd.robots.filter((r) => !r.real).length} forecast`; if (!viaFigure) { const f = figures.find((x) => x.kind === 'district' && x.id === nd.ind.id); if (f && current !== f.n) show(f.n, true); } }
    else if (nd.kind === 'robot' && nd.real) { const f = figures.find((x) => x.kind === 'robot' && x.id === nd.staff.id); if (f) show(f.n, true); openOutput(nd.staff.id); }
  },
  onHover(nd, x, y) {
    if (!nd) { tip.hidden = true; return; }
    tip.hidden = false; tip.style.left = x + 'px'; tip.style.top = y + 'px';
    tip.innerHTML = nd.kind === 'district' ? `${esc(nd.label)} · ${nd.robots.length} robots` : nd.kind === 'hub' ? 'THE AGENCY · wages, revenue, the pool (slice 0: empty)' : nd.real ? `${esc(nd.label)} <span class="chip">REAL</span> ${esc(nd.state)}` : `${esc(nd.label)} <span class="chip">FORECAST</span> ${esc(nd.state)}`;
  },
});
/* ---------- THE PLANT (P0: the markets hall) ---------- */
const plantCanvas = $('#plant');
const sound = createSound();
const plant = createPlant(plantCanvas, {
  robots: ROBOTS(), industries: catalog.industries,
  onCaption(text) { const c = $('#caption'); if (!text) { c.hidden = true; return; } const [head, ...rest] = text.split(' · '); c.innerHTML = `<b>${esc(head)}</b>${rest.length ? ' · ' + esc(rest.join(' · ')) : ''}`; c.hidden = false; },
  onView(v) { const crumb = $('#crumb'); if (v.mode === 'overview') { crumb.innerHTML = '<b>THE PLANT</b> · 30 halls + the agency · tap a hall to enter'; $('#stageFoot').textContent = 'every move is a verb from the shift log · forecast benches only move'; } else { crumb.innerHTML = `<b>${esc(v.hall.name.toUpperCase())}</b> · ${v.hall.real.length} real · ${v.hall.benches.length} forecast · drag to pan, wheel or pinch to zoom · <a href="#" id="toOverview">all halls</a>`; $('#toOverview').addEventListener('click', (e) => { e.preventDefault(); plant.overview(); }); $('#stageFoot').textContent = v.hall.agency ? 'outputs arrive from every hall; the income gate stays ACCRUED until there is verified revenue' : 'drag to pan · wheel or pinch to zoom · tap a robot for its output'; } },
  onPick(b) { if (b.real && ROBOTS().find((r) => r.id === b.id)?.lastOutput) openOutput(b.id); },
  onHover(b, x, y) { if (!b) { tip.hidden = true; return; } tip.hidden = false; tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.innerHTML = b.real ? `${esc(b.name)} <span class="chip">REAL</span> ${b.dark ? 'asleep' : esc(b.pose)}` : `Line worker <span class="chip">FORECAST</span> ${b.dark ? 'asleep' : esc(b.pose)}`; },
});
let view = 'graph';
function setView(v) {
  view = v; const g = $('#graph'), p = $('#plant');
  g.hidden = v !== 'graph'; p.hidden = v !== 'plant';
  $('#viewGraph').classList.toggle('on', v === 'graph'); $('#viewPlant').classList.toggle('on', v === 'plant');
  if (v === 'plant') { plant.resize(); if (plant.view.mode === 'overview') plant.overview(); else plant.enter(plant.view.hall.id); }
  else { graph.zoomOut(); $('#stageFoot').textContent = `${graph.forecastCount + ROBOTS().length} nodes`; }
  try { localStorage.setItem('yr.view', v); } catch {}
}
$('#viewGraph').addEventListener('click', () => setView('graph')); $('#viewPlant').addEventListener('click', () => setView('plant'));
$('#attract').addEventListener('click', () => { if (view !== 'plant') setView('plant'); const on = !plant.attract; plant.setAttract(on); $('#attract').classList.toggle('on', on); });
$('#sound').addEventListener('click', () => { const on = sound.toggle(); $('#sound').classList.toggle('on', on); $('#sound').textContent = on ? 'Sound on' : 'Sound'; });
setInterval(() => { if (!plant.attract) $('#attract').classList.remove('on'); }, 1000);
const realCount = ROBOTS().length;
$('#countLine').innerHTML = `<b>${realCount}</b> workers are real · <b>${graph.forecastCount}</b> are forecast (modelled, never counted)`;
$('#stageFoot').textContent = `${graph.forecastCount + realCount} nodes`;
$('#crumb').innerHTML = '<b>ECONOMY</b> · 30 districts';
$('#sWorkers').textContent = pad2(realCount);
const motion = $('#motion'); motion.addEventListener('input', () => { graph.setMotion(motion.value / 100); plant.setMotion(motion.value / 100); }); graph.setMotion(motion.value / 100); plant.setMotion(motion.value / 100);

/* ---------- workforce ---------- */
function sparkInto(el, series) {
  const c = el.getContext('2d'); const W = el.width = (el.clientWidth || 70) * 2, H = el.height = 48; c.clearRect(0, 0, W, H);
  if (!series.length) { c.strokeStyle = 'rgba(125,129,135,.5)'; c.beginPath(); c.moveTo(0, H - 4); c.lineTo(W, H - 4); c.stroke(); return; }
  const m = Math.max(1, ...series); c.strokeStyle = '#64BBD8'; c.lineWidth = 2.5; c.beginPath();
  series.forEach((v, i) => { const x = (i / Math.max(1, series.length - 1)) * (W - 4) + 2, y = H - 4 - (v / m) * (H - 10); i ? c.lineTo(x, y) : c.moveTo(x, y); });
  c.stroke();
}
const JOBLINE = { desk: 'Ranks the most active markets by buyers vs sellers, writes the desk note.', audit: 'Checks every new listing: supply controls, liquidity lock, issuer history.', sat: 'ISS position and the next launches, with status.', news: 'Reads the 15-minute GDELT export, briefs the AI-and-jobs beat.', lab: 'Digests new arXiv papers on humanoids, automation and basic income.', grader: 'Scores every written note on a fixed rubric.', watch: 'Heartbeats, wake and sleep by fee balance, the morning report.' };
function workerCard(r, i) {
  const grade = r.grades.length ? r.grades[r.grades.length - 1].score : null;
  const stateChip = r.status === 'idle' || r.status === 'asleep' ? 'chip' : r.status === 'waiting' ? 'chip warn' : 'chip ok';
  return `<div class="worker" data-robot="${r.id}">
    <img src="assets/${FACES[i % FACES.length]}.webp" alt="">
    <div class="nm">Grok ${esc(r.name)} <small>${esc(r.role)}</small></div>
    <div class="job">${esc(JOBLINE[r.id] || r.industry)}</div>
    <div class="row"><div class="st"><span>shifts <b>${r.shifts}</b></span><span>tasks <b>${r.tasks}</b></span><span>wages <b>${r.credits.toFixed(2)}</b> cr</span>${grade != null ? `<span>grade <b>${grade}</b></span>` : ''}</div><span class="${stateChip}">${esc(r.status)}</span></div>
    <div class="last">${r.lastRun ? `${ago(r.lastRun)} · ` : ''}${esc(r.lastSummary || 'no shift yet')}${r.every ? ` · next ${inMs(r.nextRun)}` : ''}</div>
    <div class="row" style="border:0;padding-top:4px"><canvas class="spark" data-spark="${r.id}"></canvas><button class="pill sm" type="button" data-open="${r.id}" ${r.lastOutput ? '' : 'disabled'}>Open output</button></div>
  </div>`;
}
function renderWorkforce() {
  $('#wfGrid').innerHTML = ROBOTS().map(workerCard).join('');
  for (const r of ROBOTS()) { const el = $(`#wfGrid [data-spark="${r.id}"]`); if (el) sparkInto(el, r.history.map((h) => h.tasks)); }
  for (const b of document.querySelectorAll('#wfGrid [data-open]')) b.addEventListener('click', () => openOutput(b.dataset.open));
  $('#wfModel').textContent = (state.totals.model || 'no model').toUpperCase();
  $('#fModel').textContent = state.totals.model || 'no model';
}

/* ---------- ledger ---------- */
function renderLedger() {
  const T = state.totals; const lw = document.getElementById('loopWages'); if (lw) lw.textContent = `${T.credits} cr · $${T.usd.toFixed(4)}`; const byRobot = ROBOTS().filter((r) => r.usd > 0).sort((a, b) => b.usd - a.usd);
  $('#ledgerList').innerHTML = [
    `<li><span>model</span><span class="mono">${esc(T.model || 'none')}</span></li>`,
    `<li><span>credits burned</span><span class="mono">${T.credits} cr · $${T.usd.toFixed(4)}</span></li>`,
    `<li><span>shifts · tasks</span><span class="mono">${T.shifts} · ${T.tasks}</span></li>`,
    ...byRobot.slice(0, 4).map((r) => `<li><span>${esc(r.name)}</span><span class="mono">$${r.usd.toFixed(4)}</span></li>`),
    `<li><span>receipts</span><span class="mono"><a href="${STATIC ? 'data/events.json' : '/api/events?limit=200'}" target="_blank" rel="noopener">event log</a> · <a href="${STATIC ? 'data/outputs/index.json' : '/api/outputs'}" target="_blank" rel="noopener">outputs</a></span></li>`,
  ].join('');
}

/* ---------- launch preview (practice only) ---------- */
function setupLaunch() {
  const sel = $('#lJob'); const jobs = [];
  for (const ind of catalog.industries) for (const j of ind.jobs) if (j.tier === 'A') jobs.push({ ind, j });
  sel.innerHTML = jobs.map(({ ind, j }, i) => `<option value="${i}" data-ind="${ind.id}">${esc(j.title)} — ${esc(ind.name.replace(/\s*\(.*\)/, ''))}</option>`).join('');
  const name = $('#lName'), ticker = $('#lTicker');
  const draw = () => {
    const { ind, j } = jobs[+sel.value] || jobs[0];
    const nm = name.value.trim() || `Grok ${j.title}`; const tk = ticker.value.trim() || (j.output || 'per the catalog');
    $('#lPreview').innerHTML = `<div class="nm"><img src="assets/${FACES[(+sel.value || 0) % FACES.length]}.webp" alt="">${esc(nm)} <span class="chip acc">REQUEST</span></div>
      <p>${esc(j.does)}</p>
      <div class="shift">industry · ${esc(ind.name.replace(/\s*\(.*\)/, ''))}<br>inputs · ${esc(j.inputs || 'per the catalog')}<br>output · ${esc(tk)}<br>graded by · ${esc(j.grade || 'the Grader')}<br>wages · compute at 1 credit = $0.01, paid by the developer until it earns; sleeps at zero</div>
      <div class="note">Requests go to a public queue in slice 1. The developer builds the ones that can earn their keep.</div>`;
  };
  sel.addEventListener('change', draw); name.addEventListener('input', draw); ticker.addEventListener('input', draw); draw();
}

/* ---------- strip ---------- */
function renderStrip() {
  const T = state.totals, now = Date.now();
  const perHour = Array.from({ length: 24 }, (_, i) => { const a = now - (24 - i) * 3600e3, b = a + 3600e3; return events.filter((e) => e.type.startsWith('shift.') && e.t >= a && e.t < b).length; });
  $('#actions').innerHTML = `${T.actionsHour}<small>actions / hour · ${T.actionsDay} today</small>`;
  $('#bars').innerHTML = perHour.map((v) => `<i style="height:${Math.max(4, v / Math.max(1, ...perHour) * 100)}%"></i>`).join('');
  $('#streamSub').textContent = `${T.events} events logged · ${T.credits} credits ($${T.usd.toFixed(3)}) on ${T.model || 'no model'} · up ${ago(T.started).replace(' ago', '')}`;
  const d = new Date(); const add = (5 - d.getUTCDay() + 7) % 7 || 7; const friday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + add, 16, 0);
  const funded = ROBOTS().filter((r) => r.status !== 'asleep').length / ROBOTS().length * 100;
  $('#ready').textContent = '0.0%';
  $('#readySub').textContent = `pool $0 · no revenue yet · payroll ${inMs(friday)} (Fri 16:00 UTC) · accrual mode`;
  const linked = T.outputsDay ? Math.round(events.filter((e) => e.type === 'shift.output' && e.t > now - 86400e3 && e.links?.length).length / T.outputsDay * 100) : 0;
  $('#meters').innerHTML = [['pool fill', 0], ['robots awake', Math.round(funded)], ['outputs linked', linked]].map(([k, v]) => `<span>${k}</span><div class="bar"><i style="width:${v}%"></i></div><span>${v}%</span>`).join('');
}
function traceLine(e) {
  const r = ROBOTS().find((x) => x.id === e.robot); const name = r ? r.role.split(' / ')[0].toLowerCase() : e.robot;
  const body = e.type === 'shift.start' ? 'shift started' : e.type === 'shift.task' ? `${e.label}: ${e.value}` : e.type === 'shift.output' ? `${e.summary} · ${e.tasks} tasks · ${(e.credits || 0).toFixed(2)} cr` : e.type === 'shift.grade' ? `graded ${e.score ?? '—'}: ${e.note}` : e.type === 'shift.error' ? `error: ${e.error}` : e.type === 'watch.report' ? e.summary : e.type === 'robot.state' ? `→ ${e.state}` : e.type;
  const ok = e.type === 'shift.output' || e.type === 'watch.report' ? '<span class="ok">OK</span>' : e.type === 'shift.grade' ? `<span class="ok">${e.score != null && e.score >= 60 ? 'PASS' : 'LOW'}</span>` : '';
  return `<div><span class="t">${hhmm(e.t)}</span><span class="r">${esc(name)}</span><span class="${e.type === 'shift.error' ? 'err' : ''}">${esc(body)}</span>${ok}</div>`;
}
function renderTrace() { const el = $('#trace'); el.innerHTML = events.slice(-40).map(traceLine).join(''); el.scrollTop = el.scrollHeight; }

/* ---------- welcome back ---------- */
function welcome() {
  let last = 0; try { last = +localStorage.getItem('yr.lastVisit') || 0; } catch {}
  const el = $('#wb');
  if (!last) el.innerHTML = `<h3>Welcome · first visit</h3><span class="mode">visitor mode · no account yet</span><div class="nums"><span><b>${realCount}</b>real workers on shift</span><span><b>${graph.forecastCount}</b>forecast workers (modelled)</span><span><b>${state.totals.shifts}</b>shifts so far</span></div><div class="best">This is the income screen. Come back later and it tells you what your robots did, and earned, while you did nothing.</div>`;
  else {
    const since = events.filter((e) => e.t > last);
    const outs = since.filter((e) => e.type === 'shift.output'), grades = since.filter((e) => e.type === 'shift.grade');
    const credits = since.reduce((a, e) => a + (e.credits || 0), 0);
    const best = grades.filter((g) => g.score != null).sort((a, b) => b.score - a.score)[0];
    const bestOut = best ? outs.find((o) => o.outputId === best.outputId) : outs[outs.length - 1];
    el.innerHTML = `<h3>While you were gone</h3><span class="since">since ${new Date(last).toUTCString().slice(5, 22)} UTC · ${ago(last).replace(' ago', '')}</span>
      <div class="nums"><span><b>${outs.length}</b>shifts</span><span><b>${since.filter((e) => e.type === 'shift.task').length}</b>tasks</span><span><b>${grades.length}</b>grades</span><span><b>${credits.toFixed(2)}</b>credits spent ($${(credits * state.totals.creditUsd).toFixed(3)})</span><span><b>$0</b>distributed · nothing yet</span></div>
      <div class="best">${bestOut ? `best: ${esc(bestOut.summary)}${best ? ` · graded ${best.score}` : ''} ${bestOut.links?.[0] ? `· <a href="${esc(bestOut.links[0])}" target="_blank" rel="noopener">proof</a>` : ''}` : 'nothing finished while you were gone'}</div><span class="mode">visitor mode · no account yet</span>`;
  }
  try { localStorage.setItem('yr.lastVisit', String(Date.now())); } catch {}
}

/* ---------- output modal ---------- */
async function openOutput(robotId, sourcesOnly = false) {
  const r = ROBOTS().find((x) => x.id === robotId); if (!r || !r.lastOutput) return;
  const o = await api('/api/outputs/' + r.lastOutput, 'data/outputs/' + r.lastOutput + '.json');
  $('#modalBody').innerHTML = `<button type="button" class="pill sm x" id="mx">Close</button><h3>Grok ${esc(o.name)} <span class="chip">${esc(o.role)}</span></h3>
    <div class="meta">${new Date(o.t).toUTCString().slice(5, 25)} UTC · ${o.ms} ms · ${o.items.length} items · ${o.model ? `${esc(o.model)} · ${o.tokens?.prompt_tokens ?? 0}+${o.tokens?.completion_tokens ?? 0} tokens · ${o.credits} credits ($${(o.usd || 0).toFixed(4)})` : 'no model: data only'} · graded by ${esc(r.gradeRule)}</div>
    <div><b>${esc(o.summary)}</b></div>
    ${o.text && !sourcesOnly ? `<div class="text">${esc(o.text)}</div>` : ''}
    <ul>${o.items.map((i) => `<li><b>${esc(i.label)}</b>${esc(i.value)} ${i.link ? `· <a href="${esc(i.link)}" target="_blank" rel="noopener">source</a>` : ''}</li>`).join('')}</ul>
    ${o.grade && !sourcesOnly ? `<div class="grade">Grader: <b>${o.grade.score ?? '—'}</b> · ${esc(o.grade.note)}</div>` : ''}`;
  $('#modal').classList.add('on'); $('#mx').addEventListener('click', () => $('#modal').classList.remove('on'));
}
$('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) $('#modal').classList.remove('on'); });

/* ---------- live ---------- */
async function refreshState() { if (STATIC) return; try { state = await (await fetch('/api/state')).json(); renderWorkforce(); renderLedger(); renderStrip(); for (const r of ROBOTS()) { graph.setStaffState(r.id, r.status); plant.setStaffState(r.id, r.status); } plant.setTotals({ awake: state.totals.awake, robots: state.totals.robots, shifts: state.totals.shifts, credits: state.totals.credits, model: state.totals.model }); if (figures[current].kind === 'robot') renderVerbs(figures[current], ROBOTS().find((x) => x.id === figures[current].id)); } catch {} }
function connect() {
  const live = $('#live');
  if (STATIC) { live.textContent = `SNAPSHOT · ${snapshotAt ? new Date(snapshotAt).toUTCString().slice(5, 22) + ' UTC' : 'static'}`; live.classList.add('off'); live.title = 'A static copy of the floor. The live service runs on the developer machine.'; return; }
  const es = new EventSource('/api/stream');
  es.onopen = () => { live.textContent = 'LIVE'; live.classList.remove('off'); };
  es.onerror = () => { live.textContent = 'RECONNECTING'; live.classList.add('off'); };
  es.onmessage = (m) => { try { const ev = JSON.parse(m.data); if (ev.seq <= lastSeq()) return; events.push(ev); if (events.length > 2000) events.splice(0, events.length - 2000); graph.event(ev); plant.event(ev); sound.event(ev); const el = $('#trace'); el.insertAdjacentHTML('beforeend', traceLine(ev)); while (el.children.length > 60) el.firstChild.remove(); el.scrollTop = el.scrollHeight; if (ev.type !== 'shift.task') refreshState(); } catch {} };
}
// the owner's chrome UHI logo: shown only once the file exists (no 404 in the console meanwhile)
renderFigs(); show(0); welcome(); renderWorkforce(); renderLedger(); setupLaunch(); renderStrip(); renderTrace(); connect();
setInterval(refreshState, 30_000);
setInterval(() => { $('#fps').textContent = `${view === 'plant' ? plant.fps : graph.fps} FPS`; }, 1000);
plant.setTotals({ awake: state.totals.awake, robots: state.totals.robots, shifts: state.totals.shifts, credits: state.totals.credits, model: state.totals.model });
{ let v = 'plant'; try { v = localStorage.getItem('yr.view') || 'plant'; } catch {} const q = new URLSearchParams(location.search).get('view'); if (q) v = q; if (v === 'plant') { setView('plant'); const qs = new URLSearchParams(location.search); const hq = qs.get('hall'); if (hq) plant.ready.then(() => plant.enter(hq)); if (qs.get('attract')) plant.ready.then(() => { plant.setAttract(true); $('#attract').classList.add('on'); }); } }
window.__YR = { graph, plant, sound, setView, show, get STATIC() { return STATIC; }, get state() { return state; }, get events() { return events; } };

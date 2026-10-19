// plant.html: the floor full-screen, attract on until the person touches it. Same event stream and snapshot fallback as the home page.
import { createPlant } from './plant.js';
import { createSound } from './sound.js';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let STATIC = false, snapshotAt = null;
try { const sn = await fetch('data/snapshot.json'); if (sn.ok) { const j = await sn.json(); if (j.at) { STATIC = true; snapshotAt = j.at; } } } catch {}
const api = async (path, fallback) => { const r = await fetch(STATIC ? fallback : path); if (!r.ok) throw new Error('no data'); return r.json(); };
const catalog = await (await fetch('data/catalog.json')).json();
let state = await api('/api/state', 'data/state.json');
const events = await api('/api/events?limit=400', 'data/events.json');
const ROBOTS = () => state.robots;

const sound = createSound();
const tip = $('#tip');
const plant = createPlant($('#plant'), {
  robots: ROBOTS(), industries: catalog.industries,
  onCaption(text) { const c = $('#caption'); if (!text) { c.hidden = true; return; } const [head, ...rest] = text.split(' · '); c.innerHTML = `<b>${esc(head)}</b>${rest.length ? ' · ' + esc(rest.join(' · ')) : ''}`; c.hidden = false; },
  onView(v) { $('#hint').textContent = v.mode === 'overview' ? 'tap a hall to enter · drag to pan · pinch or wheel to zoom · tap a robot for its work' : `${v.hall.name} · ${v.hall.real.length} real · ${v.hall.benches.length} forecast · drag to pan · pinch or wheel to zoom · tap a robot for its work`; },
  onPick(b) { if (b.real) openOutput(b.id); },
  onHover(b, x, y) { if (!b) { tip.hidden = true; return; } tip.hidden = false; tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.innerHTML = b.real ? `${esc(b.name)} <span class="chip">REAL</span> ${b.dark ? 'asleep' : esc(b.pose)}` : `Line worker <span class="chip">FORECAST</span> ${b.dark ? 'asleep' : esc(b.pose)}`; },
});
const totals = () => plant.setTotals({ awake: state.totals.awake, robots: state.totals.robots, shifts: state.totals.shifts, credits: state.totals.credits, model: state.totals.model });
totals();
$('#stageFoot').textContent = `${plant.realCount} real robots · ${plant.forecastCount} forecast (modelled, never counted) · every move is a verb from the shift log`;
plant.ready.then(() => { plant.setAttract(true); });
setInterval(() => $('#attract').classList.toggle('on', plant.attract), 500);
$('#attract').addEventListener('click', () => plant.setAttract(!plant.attract));
$('#overview').addEventListener('click', () => { plant.setAttract(false); plant.overview(); });
$('#sound').addEventListener('click', () => { const on = sound.toggle(); $('#sound').classList.toggle('on', on); $('#sound').textContent = on ? 'Sound on' : 'Sound'; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#modal').classList.remove('on'); plant.overview(); } });

async function openOutput(robotId) {
  const r = ROBOTS().find((x) => x.id === robotId); if (!r || !r.lastOutput) return;
  const o = await api('/api/outputs/' + r.lastOutput, 'data/outputs/' + r.lastOutput + '.json');
  $('#modalBody').innerHTML = `<button type="button" class="pill sm x" id="mx">Close</button><h3>Grok ${esc(o.name)} <span class="chip">${esc(o.role)}</span></h3>
    <div class="meta">${new Date(o.t).toUTCString().slice(5, 25)} UTC · ${o.ms} ms · ${o.items.length} items · ${o.model ? `${esc(o.model)} · ${o.credits} credits ($${(o.usd || 0).toFixed(4)})` : 'data only'}</div>
    <div><b>${esc(o.summary)}</b></div>${o.text ? `<div class="text">${esc(o.text)}</div>` : ''}
    <ul>${o.items.map((i) => `<li><b>${esc(i.label)}</b>${esc(i.value)} ${i.link ? `· <a href="${esc(i.link)}" target="_blank" rel="noopener">source</a>` : ''}</li>`).join('')}</ul>
    ${o.grade ? `<div class="grade">Grader: <b>${o.grade.score ?? '—'}</b> · ${esc(o.grade.note)}</div>` : ''}`;
  $('#modal').classList.add('on'); $('#mx').addEventListener('click', () => $('#modal').classList.remove('on'));
}
$('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) $('#modal').classList.remove('on'); });

const live = $('#live');
if (STATIC) { live.textContent = `SNAPSHOT · ${snapshotAt ? new Date(snapshotAt).toUTCString().slice(5, 22) + ' UTC' : 'static'}`; live.style.color = 'var(--mute)'; }
else {
  const es = new EventSource('/api/stream'); let seq = events.length ? events[events.length - 1].seq : 0;
  es.onopen = () => { live.textContent = 'LIVE'; live.style.color = 'var(--ok)'; };
  es.onerror = () => { live.textContent = 'RECONNECTING'; live.style.color = '#ef6a5a'; };
  es.onmessage = (m) => { try { const ev = JSON.parse(m.data); if (ev.seq <= seq) return; seq = ev.seq; plant.event(ev); sound.event(ev); if (ev.type !== 'shift.task') fetch('/api/state').then((r) => r.json()).then((s) => { state = s; totals(); for (const r of ROBOTS()) plant.setStaffState(r.id, r.status); }).catch(() => {}); } catch {} };
}
window.__YR = { plant, sound, get STATIC() { return STATIC; } };

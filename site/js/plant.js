// THE PLANT, P1: 30 halls (one per industry) + the agency room, an overview you tap into, pan/zoom, driven by the shift log.
// Every movement is a verb from the log (THE-PLANT-PLAN §2). Forecast workers only make motion, under FORECAST signs.
// Crates are work orders and outputs, never money. Art: generated sprites in assets/plant/ (manifest.json). Text over art is data.
export function createPlant(canvas, { robots, industries = [], base = 'assets/plant/', onPick, onHover, onView, onCaption }) {
  const ctx = canvas.getContext('2d', { alpha: true });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const TW = 64, TH = 32, GW = 24, GH = 14;
  let W = 0, H = 0, fitScale = 1, scale = 1, ox = 0, oy = 0, motion = .6;
  const cam = { zoom: 1, px: 0, py: 0 };
  const rnd = mulberry(7);
  const totals = { awake: 0, shifts: 0, credits: 0, model: '', delivered: 0, robots: 0 };
  const WORLD_H = { 'wall-north': 86, 'wall-west': 86, 'door-roller': 78, 'station-desk': 50, 'station-scanner': 50, 'station-bench': 40, 'station-chair': 30, 'belt-straight': 26, 'belt-curve': 26, 'belt-end': 28, 'gate-booth': 70, 'chute': 62, 'crate-fee': 20, 'crate-output': 20, 'bot-idle': 42, 'bot-walk-a': 42, 'bot-walk-b': 42, 'bot-work': 42, 'bot-carry': 42, 'lamp-pass': 30, 'lamp-low': 16, 'sign-forecast': 34, 'lamp-hand': 16 };
  const FONT = (px) => `${Math.max(9, px)}px Geist Mono, ui-monospace, monospace`;

  /* ---------- sprites ---------- */
  const sprites = new Map();
  const ready = fetch(base + 'manifest.json').then((r) => r.ok ? r.json() : {}).catch(() => ({})).then((m) => Promise.all(Object.keys(m).map((k) => new Promise((res) => { const im = new Image(); im.onload = () => { sprites.set(k, im); res(); }; im.onerror = () => res(); im.src = base + k + '.webp'; })))).then(() => { for (const h of halls) h.static = null; });

  /* ---------- halls ---------- */
  const DESK = /market|finance|stock|macro|software|writing|media|marketing|sales|education|legal|government|civic|recruit|retail|travel|fashion|sport|journal|support|operation/i;
  const SCAN = /security|science|research|health|manufactur|robotic|energy|climate|agricult|space|transport|logistic|real estate|housing/i;
  const BELT_Y = 6, BELT_X0 = 3, BELT_X1 = 20, GATE_X = 15;
  const strip = (n) => n.replace(/\s*\(.*\)/, '');
  const halls = [];
  const byInd = new Map();
  function makeHall(id, name, { industry = null, agency = false } = {}) {
    const h = { id, name, short: name.split(/,| and | & |\/|: /)[0].trim().toUpperCase().slice(0, 14), industry, agency, stations: [], benches: [], chairs: [], bots: [], crates: [], lamps: [], labels: [], blocked: new Set(), static: null, activity: 0, real: [] };
    for (let x = BELT_X0; x <= BELT_X1; x++) h.blocked.add(`${x},${BELT_Y}`);
    if (!agency) {
      const jobsA = industry ? industry.jobs.filter((j) => j.tier !== 'D').length : 6;
      const kind = DESK.test(name) ? 'station-desk' : SCAN.test(name) ? 'station-scanner' : 'station-bench';
      const n = Math.max(6, Math.min(20, jobsA * 2)); const spots = []; for (const gx of [10, 12, 14, 16, 18]) for (const gy of [2, 4, 10, 12]) spots.push([gx, gy]);
      for (let i = 0; i < n; i++) { const [gx, gy] = spots[i]; const b = { kind: i % 3 === 0 ? kind : 'station-bench', gx, gy, face: 'ne' }; h.stations.push(b); h.benches.push(b); }
      h.realSlots = [{ kind, gx: 6, gy: 3, face: 'ne' }, { kind, gx: 6, gy: 9, face: 'ne' }, { kind, gx: 8, gy: 12, face: 'ne' }];
    } else {
      h.realSlots = [{ kind: 'station-desk', gx: 6, gy: 3, face: 'ne' }, { kind: 'station-desk', gx: 6, gy: 9, face: 'ne' }];
    }
    for (let i = 0; i < 6; i++) { const c = { kind: 'station-chair', gx: 1 + (i % 3), gy: 11 + Math.floor(i / 3) }; h.stations.push(c); h.chairs.push(c); }
    for (const s of h.stations) h.blocked.add(`${s.gx},${s.gy}`);
    halls.push(h); return h;
  }
  industries.forEach((ind) => { const h = makeHall('ind' + ind.id, strip(ind.name), { industry: ind }); byInd.set(strip(ind.name).toLowerCase(), h); });
  const agency = makeHall('agency', 'The agency', { agency: true });
  const walkable = (h, x, y) => x >= 0 && y >= 0 && x < GW && y < GH && !h.blocked.has(`${x},${y}`);
  const nearestFloor = (h, s) => { for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1]]) if (walkable(h, s.gx + dx, s.gy + dy)) return [s.gx + dx, s.gy + dy]; return [s.gx, s.gy + 1]; };

  /* ---------- bots ---------- */
  const staffBots = {};
  function makeBot(h, o) { const b = { pose: 'idle', face: 'sw', queue: [], busy: null, screen: '', dark: false, hall: h, ...o }; h.bots.push(b); return b; }
  for (const r of robots) {
    const want = strip(String(r.industry || '')).toLowerCase();
    const h = r.id === 'grader' || r.id === 'watch' ? agency : (byInd.get(want) || agency);
    if (r.id === 'watch') { staffBots.watch = makeBot(agency, { id: 'watch', name: r.name, real: true, station: null, home: [0, 0], gx: 0, gy: 0, face: 'se', catwalk: true }); agency.real.push('watch'); continue; }
    const slot = h.realSlots.shift() || { kind: 'station-bench', gx: 8, gy: 12, face: 'ne' };
    const st = { ...slot, id: r.id }; h.stations.push(st); h.blocked.add(`${st.gx},${st.gy}`); h.real.push(r.id);
    const [hx, hy] = nearestFloor(h, st);
    staffBots[r.id] = makeBot(h, { id: r.id, name: r.name, real: true, station: st, home: [hx, hy], gx: hx, gy: hy, face: 'ne', pose: r.status === 'idle' || r.status === 'asleep' ? 'idle' : 'work', dark: r.status === 'asleep' });
  }
  for (const h of halls) for (const b of h.benches) { const [hx, hy] = nearestFloor(h, b); makeBot(h, { id: `${h.id}-${h.bots.length}`, name: 'Line worker', real: false, station: b, home: [hx, hy], gx: hx, gy: hy, face: 'ne', pose: rnd() < .4 ? 'idle' : 'work', next: rnd() * 30, dark: rnd() < .3 }); }
  for (const h of halls) for (const b of h.bots) if (b.dark) b.pose = 'idle';

  /* ---------- paths and queues ---------- */
  function path(h, ax, ay, bx, by) {
    ax = Math.round(ax); ay = Math.round(ay); bx = Math.round(bx); by = Math.round(by); if (ax === bx && ay === by) return [];
    const key = (x, y) => `${x},${y}`; const prev = new Map([[key(ax, ay), null]]); const q = [[ax, ay]];
    while (q.length) { const [x, y] = q.shift(); if (x === bx && y === by) break; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!(walkable(h, nx, ny) || (nx === bx && ny === by)) || prev.has(key(nx, ny))) continue; prev.set(key(nx, ny), [x, y]); q.push([nx, ny]); } }
    if (!prev.has(key(bx, by))) return [[bx, by]];
    const out = []; let cur = [bx, by]; while (cur && !(cur[0] === ax && cur[1] === ay)) { out.unshift(cur); cur = prev.get(key(cur[0], cur[1])); } return out;
  }
  const walk = (bot, to, then) => bot.queue.push({ type: 'walk', p: path(bot.hall, bot.gx, bot.gy, to[0], to[1]), then });
  const act = (bot, type, ms, extra = {}) => bot.queue.push({ type, ms, ...extra });
  const lamp = (h, key, gx, gy, ms, lift = 40) => h.lamps.push({ key, gx, gy, t: ms, max: ms, lift });
  const label = (h, text, gx, gy, ms = 3000) => { h.labels.push({ text: String(text).slice(0, 48), gx, gy, t: ms }); if (h.labels.length > 10) h.labels.shift(); };

  /* ---------- events ---------- */
  const pendingGrade = new Map();
  function event(ev) {
    if (ev.type === 'watch.report') { const w = staffBots.watch; if (!w) return; w.queue.length = 0; walk(w, [GW - 1, 0]); walk(w, [0, 0]); label(agency, ev.summary, 10, 0, 5000); agency.activity = 1; agency.lastCaption = `Night watchman: ${ev.summary}`; agency.lastEventAt = performance.now(); return; }
    const bot = staffBots[ev.robot]; if (!bot) return; const h = bot.hall, s = bot.station; h.activity = 1;
    h.lastCaption = ev.type === 'shift.start' ? `${bot.name} clocked in` : ev.type === 'shift.task' ? `${bot.name}: ${ev.label || 'working'}` : ev.type === 'shift.output' ? `${bot.name} finished: ${ev.summary || ''}` : ev.type === 'shift.grade' ? `Graded ${ev.score ?? '—'}: ${ev.note || ''}` : ev.type === 'shift.error' ? `${bot.name} hit an error` : h.lastCaption; h.lastEventAt = performance.now();
    switch (ev.type) {
      case 'shift.start': bot.queue.length = 0; bot.dark = false; bot.screen = 'reading…'; walk(bot, bot.home, () => { bot.face = s.face; bot.pose = 'work'; }); h.crates.push({ key: 'crate-fee', gx: 0, gy: BELT_Y, path: path(h, 0, BELT_Y, bot.home[0], bot.home[1]), speed: 2.2, toStation: true }); break;
      case 'shift.task': act(bot, 'work', 600, { screen: ev.label }); break;
      case 'shift.output': act(bot, 'pickup', 300); walk(bot, [bot.home[0], bot.gy < BELT_Y ? BELT_Y - 1 : BELT_Y + 1], () => { const c = { key: 'crate-output', gx: bot.home[0], gy: BELT_Y, belt: true, x: Math.max(BELT_X0, Math.min(BELT_X1, bot.home[0])), speed: 1.6, summary: ev.summary, waitAtGate: !!ev.hasText, owner: bot.id }; h.crates.push(c); if (ev.hasText) pendingGrade.set(bot.id, c); label(h, ev.summary, bot.home[0], BELT_Y, 4000); bot.screen = 'done'; }); walk(bot, bot.home, () => { bot.face = s.face; bot.pose = 'work'; }); break;
      case 'shift.grade': { const c = pendingGrade.get(ev.robot); const good = ev.score != null && ev.score >= 60; const g = staffBots.grader; if (g) act(g, 'work', 1200, { screen: `${ev.score ?? '—'}` }); if (c) { c.grade = good ? 'pass' : 'low'; c.waitAtGate = false; pendingGrade.delete(ev.robot); } lamp(h, good ? 'lamp-pass' : 'lamp-low', GATE_X, BELT_Y, 1500, 70); label(h, `${good ? 'PASS' : 'LOW'} ${ev.score ?? ''} · ${ev.note || ''}`, GATE_X, BELT_Y - 1, 4000); break; }
      case 'shift.error': lamp(h, 'lamp-low', s.gx, s.gy, 1500, 55); bot.screen = 'error'; act(bot, 'shrug', 1000); break;
      case 'robot.state': if (ev.state === 'idle') { const ch = h.chairs[Math.floor(rnd() * h.chairs.length)]; walk(bot, [ch.gx, ch.gy + 1], () => { bot.pose = 'idle'; bot.face = 'sw'; bot.screen = ''; }); } else if (ev.state === 'asleep') { bot.dark = true; bot.pose = 'idle'; } break;
    }
  }
  function setStaffState(id, status) { const b = staffBots[id]; if (!b) return; b.dark = status === 'asleep'; }

  /* ---------- update ---------- */
  function step(bot, dt) {
    if (bot.busy) { const j = bot.busy;
      if (j.type === 'walk') { if (!j.p.length) { bot.busy = null; j.then?.(); return; } const [tx, ty] = j.p[0]; const dx = tx - bot.gx, dy = ty - bot.gy; const d = Math.hypot(dx, dy); const sp = 1.6 * dt; if (d <= sp) { bot.gx = tx; bot.gy = ty; j.p.shift(); } else { bot.gx += dx / d * sp; bot.gy += dy / d * sp; } bot.face = dx > 0 ? 'se' : dx < 0 ? 'nw' : dy > 0 ? 'sw' : 'ne'; bot.pose = ((performance.now() / 180) | 0) % 2 ? 'walk-a' : 'walk-b'; }
      else { j.ms -= dt * 1000; if (j.type === 'work') { bot.pose = 'work'; if (j.screen) bot.screen = j.screen; } else if (j.type === 'pickup') bot.pose = 'carry'; else if (j.type === 'shrug') bot.pose = 'idle'; if (j.ms <= 0) { bot.busy = null; if (j.type === 'pickup') bot.pose = 'carry'; else if (!bot.queue.length) bot.pose = bot.station ? 'work' : 'idle'; } }
      return; }
    if (bot.queue.length) bot.busy = bot.queue.shift();
  }
  function forecastTick(h, dt) {
    if (motion <= 0) return;
    for (const b of h.bots) {
      if (b.real || b.busy || b.queue.length) continue;
      b.next -= dt * motion; if (b.next > 0) continue; b.next = 8 + rnd() * 24;
      const roll = rnd();
      if (b.dark) { if (roll < .3) { b.dark = false; b.pose = 'work'; } continue; }
      if (roll < .5) act(b, 'work', 900 + rnd() * 900);
      else if (roll < .72) { const c = h.chairs[Math.floor(rnd() * h.chairs.length)]; walk(b, [c.gx, c.gy + 1], () => { b.pose = 'idle'; }); act(b, 'shrug', 2000 + rnd() * 3000); walk(b, b.home, () => { b.face = 'ne'; b.pose = 'work'; }); }
      else if (roll < .9) h.crates.push({ key: 'crate-output', gx: b.home[0], gy: BELT_Y, belt: true, x: Math.max(BELT_X0, Math.min(BELT_X1, b.home[0])), speed: 1.6, fore: true, grade: 'pass' });
      else { b.dark = true; b.pose = 'idle'; }
    }
  }
  function updateCrates(h, dt) {
    for (let i = h.crates.length - 1; i >= 0; i--) {
      const c = h.crates[i];
      if (c.toStation) { if (!c.path.length) { h.crates.splice(i, 1); continue; } const [tx, ty] = c.path[0]; const dx = tx - c.gx, dy = ty - c.gy, d = Math.hypot(dx, dy), sp = c.speed * dt; if (d <= sp) { c.gx = tx; c.gy = ty; c.path.shift(); } else { c.gx += dx / d * sp; c.gy += dy / d * sp; } continue; }
      if (c.belt) {
        if (c.grade === 'low') { c.x -= c.speed * dt; if (c.x <= BELT_X0 + .2) h.crates.splice(i, 1); c.gx = c.x; continue; }
        if (c.waitAtGate && c.x >= GATE_X - .6) { c.x = GATE_X - .6; c.gx = c.x; continue; }
        c.x += c.speed * dt; c.gx = c.x;
        if (c.x >= BELT_X1 + .8) { h.crates.splice(i, 1); if (!c.fore) { totals.delivered++; if (!h.agency) agency.crates.push({ key: 'crate-output', gx: 0, gy: BELT_Y, belt: true, x: BELT_X0, speed: 1.4, summary: c.summary, inbound: true }); } }
      }
    }
  }
  function tickAll(dt) { for (const h of halls) { for (const b of h.bots) step(b, dt); forecastTick(h, dt); updateCrates(h, dt); for (const l of h.lamps) l.t -= dt * 1000; h.lamps = h.lamps.filter((l) => l.t > 0); for (const l of h.labels) l.t -= dt * 1000; h.labels = h.labels.filter((l) => l.t > 0); h.activity = Math.max(0, h.activity - dt * .3); } }

  /* ---------- view ---------- */
  let view = { mode: 'overview', hall: null };
  function toS(gx, gy) { return [ox + cam.px + (gx - gy) * (TW / 2) * scale, oy + cam.py + (gx + gy) * (TH / 2) * scale]; }
  function fitHall() {
    const corners = [[-1, -1], [GW + 1, -1], [GW + 1, GH], [-1, GH]].map(([x, y]) => [(x - y) * TW / 2, (x + y) * TH / 2]);
    const minX = Math.min(...corners.map((c) => c[0])), maxX = Math.max(...corners.map((c) => c[0])), minY = Math.min(...corners.map((c) => c[1])) - 70, maxY = Math.max(...corners.map((c) => c[1])) + 8;
    fitScale = Math.min((W - 8) / (maxX - minX), (H - 8) / (maxY - minY)) * (H > W * 1.2 ? 1.7 : 1.06); scale = fitScale * cam.zoom; // portrait phones: fill the height, the person pans
    ox = W / 2 - (minX + maxX) / 2 * scale; oy = H / 2 - (minY + maxY) / 2 * scale;
  }
  function enter(id) { const h = halls.find((x) => x.id === id); if (!h) return; view = { mode: 'hall', hall: h }; cam.zoom = 1; cam.px = 0; cam.py = 0; fitHall(); h.static = null; onView?.(view); }
  function overview() { view = { mode: 'overview', hall: null }; cam.zoom = 1; cam.px = 0; cam.py = 0; onView?.(view); }

  /* ---------- drawing ---------- */
  function sprite(c2, key, gx, gy, { h = null, w = null, flip = false, alpha = 1, lift = 0, dx = 0 } = {}) {
    const im = sprites.get(key); if (!im) return false;
    const wh = (w ? w * (im.height / im.width) : (h || WORLD_H[key] || 40)) * scale; const ww = wh * (im.width / im.height);
    const [sx, sy] = toS(gx, gy); const x = sx + dx * scale - ww / 2, y = sy + TH / 2 * scale - wh - lift * scale;
    c2.globalAlpha = alpha; if (flip) { c2.save(); c2.translate(x + ww, y); c2.scale(-1, 1); c2.drawImage(im, 0, 0, ww, wh); c2.restore(); } else c2.drawImage(im, x, y, ww, wh); c2.globalAlpha = 1; return true;
  }
  function tile(c2, key, gx, gy) { const im = sprites.get(key); const [sx, sy] = toS(gx, gy); const w = TW * scale, h = TH * scale; if (im) c2.drawImage(im, sx - w / 2, sy, w, h); else { c2.fillStyle = (gx + gy) % 2 ? '#101214' : '#0d0f11'; c2.beginPath(); c2.moveTo(sx, sy); c2.lineTo(sx + w / 2, sy + h / 2); c2.lineTo(sx, sy + h); c2.lineTo(sx - w / 2, sy + h / 2); c2.closePath(); c2.fill(); } }
  function buildStatic(h) {
    const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; const c2 = c.getContext('2d'); c2.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) tile(c2, gx === 0 ? 'tile-dock' : 'tile-floor', gx, gy);
    for (let gx = GW - 1; gx >= 0; gx--) sprite(c2, 'wall-north', gx, -1, { w: TW * 1.06, flip: true });
    for (let gy = GH - 1; gy >= 0; gy--) sprite(c2, gy === BELT_Y ? 'door-roller' : 'wall-west', -1, gy, { w: TW * 1.06 });
    for (let x = BELT_X0; x <= BELT_X1; x++) sprite(c2, x === BELT_X0 ? 'belt-curve' : x === BELT_X1 ? 'belt-end' : 'belt-straight', x, BELT_Y, { h: x === BELT_X1 ? 28 : 26 });
    sprite(c2, 'chute', GW, BELT_Y, { h: 62 });
    if (h.agency) sprite(c2, 'chute', GW, BELT_Y - 4, { h: 62 });
    for (const s of [...h.stations].sort((a, b) => a.gx + a.gy - (b.gx + b.gy))) sprite(c2, s.kind, s.gx, s.gy, { h: WORLD_H[s.kind] });
    if (!h.agency) { sprite(c2, 'sign-forecast', 14, 1, { h: 34 }); sprite(c2, 'sign-forecast', 14, 13, { h: 34 }); }
    h.static = { c, zoom: cam.zoom, px: cam.px, py: cam.py, W, H };
  }
  function drawBot(b) {
    const key = 'bot-' + (b.pose || 'idle'); const flip = b.face === 'se' || b.face === 'ne';
    if (!sprite(ctx, key, b.gx, b.gy, { flip, alpha: b.real ? (b.dark ? .45 : 1) : (b.dark ? .25 : .55) })) { const [sx, sy] = toS(b.gx, b.gy); ctx.fillStyle = b.real ? '#fff' : '#7D8187'; ctx.beginPath(); ctx.arc(sx, sy, 6 * scale, 0, Math.PI * 2); ctx.fill(); }
    if (b.catwalk && b.busy) sprite(ctx, 'lamp-hand', b.gx, b.gy, { dx: 14, lift: 24 });
  }
  function drawHall(h, now) {
    if (!h.static || h.static.zoom !== cam.zoom || h.static.px !== cam.px || h.static.py !== cam.py || h.static.W !== W || h.static.H !== H) buildStatic(h);
    ctx.drawImage(h.static.c, 0, 0, W, H);
    const dyn = [];
    for (const b of h.bots) dyn.push({ z: b.gx + b.gy + .01, draw: () => drawBot(b) });
    for (const c of h.crates) dyn.push({ z: c.gx + c.gy + .02, draw: () => sprite(ctx, c.key, c.gx, c.gy, { lift: c.belt ? 10 : 2, alpha: c.fore ? .5 : 1 }) });
    dyn.push({ z: GATE_X + BELT_Y + .5, draw: () => sprite(ctx, 'gate-booth', GATE_X, BELT_Y, { h: 70 }) });
    for (const l of h.lamps) dyn.push({ z: l.gx + l.gy + 1, draw: () => sprite(ctx, l.key, l.gx, l.gy, { lift: l.lift, alpha: Math.min(1, l.t / 300), h: WORLD_H[l.key] * (l.key === 'lamp-pass' ? 1 + .4 * Math.sin(now / 90) : 1) }) });
    dyn.sort((a, b) => a.z - b.z); for (const d of dyn) d.draw();
    ctx.font = FONT(10 * scale); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const b of h.bots) if (b.real && b.station && b.screen) { const [sx, sy] = toS(b.station.gx, b.station.gy); ctx.fillStyle = '#9fe3f2'; ctx.fillText(b.screen.slice(0, 26), sx, sy - 22 * scale); }
    for (const b of h.bots) if (b.real) { const [sx, sy] = toS(b.gx, b.gy); ctx.fillStyle = b.dark ? '#7D8187' : '#ffffff'; ctx.fillText(b.name, sx, sy - 44 * scale); ctx.fillStyle = '#64BBD8'; ctx.font = FONT(8.5 * scale); ctx.fillText(b.dark ? 'ASLEEP' : 'REAL', sx, sy - 56 * scale); ctx.font = FONT(10 * scale); }
    for (const l of h.labels) { const [sx, sy] = toS(l.gx, l.gy); ctx.globalAlpha = Math.min(1, l.t / 600); ctx.fillStyle = '#D5D9E2'; ctx.fillText(l.text, sx, sy - 70 * scale); ctx.globalAlpha = 1; }
    ctx.fillStyle = '#7D8187'; ctx.font = FONT(8.5 * scale);
    if (!h.agency) for (const [gx, gy] of [[14, 1], [14, 13]]) { const [sx, sy] = toS(gx, gy); ctx.fillText('FORECAST', sx, sy - 26 * scale); }
    { const [sx, sy] = toS(12, -1); ctx.fillStyle = '#D5D9E2'; ctx.font = FONT(10 * scale); ctx.fillText(`${h.name.toUpperCase()} · ${h.real.length} real · ${h.benches.length} forecast · ${totals.awake}/${totals.robots || '—'} awake`, sx, sy - 40 * scale); ctx.fillStyle = '#7D8187'; ctx.fillText(h.agency ? `outputs in ${totals.delivered} · income gate: ACCRUED · ${totals.model || ''}` : `${totals.shifts} shifts · ${totals.credits} cr wages · ${totals.model || ''}`, sx, sy - 28 * scale); }
    if (h.agency) { const [sx, sy] = toS(GW, BELT_Y); ctx.fillStyle = '#D5D9E2'; ctx.fillText('SHELF', sx, sy - 64 * scale); const [tx, ty] = toS(GW, BELT_Y - 4); ctx.fillStyle = '#F4B942'; ctx.fillText('INCOME · ACCRUED', tx, ty - 64 * scale); }
  }
  const cards = [];
  function drawOverview() {
    cards.length = 0;
    const n = halls.length, cols = W > 900 ? 6 : W > 560 ? 4 : 3, rows = Math.ceil(n / cols);
    const pad = 8, cw = (W - pad * (cols + 1)) / cols, ch = Math.min(cw * .78, (H - pad * (rows + 1)) / rows);
    const minScale = Math.min(cw / (8 * TW), ch / (10 * TH)) * .9;
    halls.forEach((h, i) => {
      const cx = pad + (i % cols) * (cw + pad), cy = pad + Math.floor(i / cols) * (ch + pad);
      cards.push({ hall: h, x: cx, y: cy, w: cw, hh: ch });
      ctx.fillStyle = h.agency ? 'rgba(100,187,216,.08)' : 'rgba(255,255,255,.035)'; ctx.strokeStyle = h.activity > 0 ? `rgba(100,187,216,${.3 + h.activity * .6})` : 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 10); ctx.fill(); ctx.stroke();
      const s0 = scale, ox0 = ox, oy0 = oy, px0 = cam.px, py0 = cam.py; scale = minScale; ox = cx + cw / 2; oy = cy + ch * .3; cam.px = 0; cam.py = 0;
      for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 6; gx++) tile(ctx, 'tile-floor', gx, gy);
      const awake = h.bots.filter((b) => !b.dark).length;
      h.bots.slice(0, 12).forEach((b, k) => { const [sx, sy] = toS(k % 6, Math.floor(k / 6) * 2 + .5); ctx.fillStyle = b.real ? '#ffffff' : b.dark ? 'rgba(125,129,135,.4)' : '#8a9097'; ctx.beginPath(); ctx.arc(sx, sy + 2, b.real ? 3 : 2, 0, Math.PI * 2); ctx.fill(); });
      scale = s0; ox = ox0; oy = oy0; cam.px = px0; cam.py = py0;
      ctx.font = FONT(ch > 90 ? 10 : 9); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#D5D9E2'; ctx.fillText((cw > 150 ? h.name : h.short).slice(0, cw > 150 ? 22 : 12), cx + 8, cy + ch - 18);
      ctx.fillStyle = '#7D8187'; ctx.font = FONT(ch > 90 ? 9 : 8); ctx.fillText(h.agency ? 'grader · watchman · income gate' : `${h.real.length} real · ${awake}/${h.bots.length} awake${h.real.length ? '' : ' · forecast'}`, cx + 8, cy + ch - 6);
      if (h.activity > .2) { ctx.fillStyle = `rgba(100,187,216,${h.activity})`; ctx.beginPath(); ctx.arc(cx + cw - 12, cy + 12, 3, 0, Math.PI * 2); ctx.fill(); }
    });
    ctx.textAlign = 'center';
  }

  /* ---------- frame ---------- */
  let last = performance.now(), frames = 0, fpsT = last, fps = 60, hover = null;
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now; frames++; if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now; }
    tickAll(dt);
    if (attract.on) attractTick(dt, now);
    ctx.clearRect(0, 0, W, H);
    if (view.mode === 'overview') drawOverview(); else drawHall(view.hall, now);
    if (hover && view.mode === 'hall') { const [sx, sy] = toS(hover.gx, hover.gy); ctx.strokeStyle = '#64BBD8'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(sx, sy + TH / 2 * scale, TW / 2 * scale * .6, TH / 2 * scale * .6, 0, 0, Math.PI * 2); ctx.stroke(); }
    requestAnimationFrame(frame);
  }

  /* ---------- attract camera: overview → a hall with recent activity → slow pan and zoom → the next; captions from the log ---------- */
  const attract = { on: false, phase: 'overview', t: 0, order: [], i: 0, dir: 1 };
  function attractTick(dt, now) {
    attract.t += dt;
    if (view.mode === 'overview') {
      if (attract.t > 5) { // pick the hall with the freshest real event, else the next in a round-robin that prefers halls with real robots
        const fresh = halls.filter((h) => h.lastEventAt && now - h.lastEventAt < 60000).sort((a, b) => b.lastEventAt - a.lastEventAt)[0];
        let next = fresh && fresh !== attract.last ? fresh : null;
        if (!next) { const ring = halls.filter((h) => h.real.length).concat(halls.filter((h) => !h.real.length)); attract.i = (attract.i + 1) % ring.length; next = ring[attract.i]; }
        attract.last = next; attract.t = 0; attract.dir = Math.random() < .5 ? 1 : -1; enter(next.id); cam.zoom = 1.35; scale = fitScale * cam.zoom; cam.px = attract.dir * -W * .18; cam.py = H * .06; view.hall.static = null;
        onCaption?.(next.lastCaption ? `${next.name} · ${next.lastCaption}` : `${next.name} · ${next.real.length ? next.real.length + ' real robot' + (next.real.length > 1 ? 's' : '') + ' on shift' : 'forecast floor'}`);
      }
      return;
    }
    // in a hall: drift sideways, breathe the zoom, cut back after 11 s
    cam.px += attract.dir * 14 * dt; cam.py -= 2 * dt;
    const z = 1.35 + .12 * Math.sin(attract.t * .5); const k = z / cam.zoom; cam.zoom = z; scale = fitScale * cam.zoom; cam.px *= k; cam.py *= k;
    view.hall.static = null;
    if (view.hall.lastEventAt && now - view.hall.lastEventAt < 1500 && view.hall.lastCaption) onCaption?.(`${view.hall.name} · ${view.hall.lastCaption}`);
    if (attract.t > 11) { attract.t = 0; overview(); onCaption?.('THE PLANT · 30 halls and the agency · every move is a verb from the shift log'); }
  }
  function setAttract(on) { attract.on = on; attract.t = 0; if (on) { overview(); onCaption?.('THE PLANT · 30 halls and the agency · every move is a verb from the shift log'); } else onCaption?.(null); }

  /* ---------- input: tap, drag-pan, wheel/pinch zoom ---------- */
  function pickBot(sx, sy) { if (view.mode !== 'hall') return null; let best = null, bd = 1e9; for (const b of view.hall.bots) { const [bx, by] = toS(b.gx, b.gy); const d = Math.hypot(bx - sx, by - 10 * scale - sy); if (d < 22 * scale && d < bd) { bd = d; best = b; } } return best; }
  const pointers = new Map(); let downAt = null, dragging = false, pinch0 = null;
  canvas.addEventListener('pointerdown', (e) => { if (attract.on) setAttract(false); pointers.set(e.pointerId, [e.clientX, e.clientY]); downAt = [e.clientX, e.clientY, cam.px, cam.py]; dragging = false; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: cam.zoom }; } canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2 && pinch0 && view.mode === 'hall') { const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); setZoom(pinch0.zoom * d / pinch0.d, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); return; }
    if (downAt && pointers.size === 1 && view.mode === 'hall') { const dx = e.clientX - downAt[0], dy = e.clientY - downAt[1]; if (Math.hypot(dx, dy) > 8) dragging = true; if (dragging) { cam.px = downAt[2] + dx; cam.py = downAt[3] + dy; } return; }
    const b = pickBot(e.clientX - r.left, e.clientY - r.top); if (b !== hover) { hover = b; onHover?.(b, e.clientX - r.left, e.clientY - r.top); }
  });
  const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = null; if (!downAt) return; const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8; downAt = null; if (moved || dragging) { dragging = false; return; } const r = canvas.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top; if (view.mode === 'overview') { const c = cards.find((k) => sx >= k.x && sx <= k.x + k.w && sy >= k.y && sy <= k.y + k.hh); if (c) enter(c.hall.id); return; } const b = pickBot(sx, sy); if (b) onPick?.(b); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => { hover = null; onHover?.(null); });
  function setZoom(z, atX, atY) { const nz = Math.max(.6, Math.min(3.2, z)); const k = nz / cam.zoom; const wx = (atX - ox - cam.px) / scale, wy = (atY - oy - cam.py) / scale; cam.zoom = nz; scale = fitScale * cam.zoom; cam.px = atX - ox - wx * scale; cam.py = atY - oy - wy * scale; }
  canvas.addEventListener('wheel', (e) => { if (attract.on) setAttract(false); if (view.mode !== 'hall') return; e.preventDefault(); const r = canvas.getBoundingClientRect(); setZoom(cam.zoom * (e.deltaY > 0 ? .9 : 1.1), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  function resize() { const r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); fitHall(); for (const h of halls) h.static = null; }
  window.addEventListener('resize', resize); resize(); requestAnimationFrame(frame);

  return { event, setStaffState, resize, ready, enter, overview, halls, setAttract, get attract() { return attract.on; }, setMotion: (v) => { motion = Math.max(0, Math.min(1, v)); }, setTotals: (t) => Object.assign(totals, t), get fps() { return fps; }, get view() { return view; }, forecastCount: halls.reduce((a, h) => a + h.benches.length, 0), realCount: Object.keys(staffBots).length, hallFor: (industryName) => byInd.get(strip(industryName).toLowerCase()) || null };
}
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

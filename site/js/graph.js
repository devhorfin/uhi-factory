// The living economy graph, paper-and-ink edition. Canvas2D, DPR-aware, two zoom levels (economy ↔ district).
// Real robots pulse on real events from the service; forecast robots pulse on a modelled schedule and are drawn in grey.
// Nothing here invents a number: forecast nodes only make motion, never a figure that appears outside a FORECAST panel.
export function createGraph(canvas, { industries, staff, onPick, onHover }) {
  const ctx = canvas.getContext('2d', { alpha: true });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  const rnd = mulberry(20261019);
  const INK = '#FFFFFF', INK2 = '#7D8187', PAPER = '#0A0A0A';
  const theme = { accent: '#64BBD8', accentInk: '#64BBD8', motion: .6, wobble: .6 };

  /* ---------- layout ---------- */
  const hub = { id: 'hub', kind: 'hub', x: 0, y: 0, r: 15, label: 'THE AGENCY' };
  const nodes = [hub], edges = [], byId = new Map([[hub.id, hub]]);
  const R_IND = 300, R_MKT = 470, R_CMP = 150;
  const n = industries.length;
  industries.forEach((ind, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (rnd() - .5) * .08;
    const rr = R_IND + (rnd() - .5) * 44;
    const label = ind.name.replace(/\s*\(.*\)/, '');
    const short = label.split(/,| and | & |\/|: /)[0].trim().toUpperCase().slice(0, 14);
    const d = { id: 'ind' + ind.id, kind: 'district', ind, x: Math.cos(a) * rr, y: Math.sin(a) * rr, r: 9, label, short, a, robots: [] };
    const m = { id: 'mkt' + ind.id, kind: 'market', x: Math.cos(a) * R_MKT, y: Math.sin(a) * R_MKT, r: 3, label: 'market', district: d };
    const c = { id: 'cmp' + ind.id, kind: 'compute', x: Math.cos(a) * R_CMP, y: Math.sin(a) * R_CMP, r: 3, label: 'compute', district: d };
    nodes.push(d, m, c); byId.set(d.id, d); byId.set(m.id, m); byId.set(c.id, c);
    edges.push({ a: m, b: d, w: .5, j: rnd() }, { a: d, b: c, w: .35, j: rnd() }, { a: c, b: hub, w: .3, j: rnd() });
    const jobs = ind.jobs.filter((j) => j.tier !== 'D');
    const count = Math.max(4, jobs.length * 2);
    const spread = 22 + Math.sqrt(count) * 9;
    for (let k = 0; k < count; k++) {
      const ang = rnd() * Math.PI * 2, dist = 14 + Math.sqrt(rnd()) * spread;
      const job = jobs[k % jobs.length];
      const rnode = { id: `f${ind.id}-${k}`, kind: 'robot', real: false, job, district: d, x: d.x + Math.cos(ang) * dist, y: d.y + Math.sin(ang) * dist, r: 2.2, label: job.title, rate: .2 + rnd() * .8, next: rnd() * 12, state: rnd() < .35 ? 'asleep' : 'idle' };
      nodes.push(rnode); byId.set(rnode.id, rnode); d.robots.push(rnode);
      edges.push({ a: rnode, b: d, w: .12, fore: true, j: rnd() });
    }
  });
  const staffNodes = new Map();
  for (const s of staff) {
    const want = String(s.industry || '').replace(/\s*\(.*\)/, '').toLowerCase();
    const d = [...byId.values()].find((x) => x.kind === 'district' && x.label.toLowerCase() === want) || null;
    const ang = rnd() * Math.PI * 2;
    const base = d ? { x: d.x + Math.cos(ang) * 30, y: d.y + Math.sin(ang) * 30 } : { x: Math.cos(ang) * 60, y: Math.sin(ang) * 60 };
    const node = { id: 'r-' + s.id, kind: 'robot', real: true, staff: s, district: d, x: base.x, y: base.y, r: 6, label: s.name, prog: 0, state: s.status || 'idle' };
    nodes.push(node); byId.set(node.id, node); staffNodes.set(s.id, node);
    if (d) { d.robots.push(node); edges.push({ a: node, b: d, w: .5, j: rnd() }, { a: byId.get('mkt' + d.ind.id), b: node, w: .25, j: rnd() }); } else edges.push({ a: node, b: hub, w: .5, j: rnd() });
  }

  /* ---------- camera ---------- */
  const cam = { x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1 };
  let focus = null, highlight = null;
  function fitEconomy() { const s = Math.min(W, H) / (2 * (R_MKT + 40)); cam.tx = 0; cam.ty = 0; cam.tz = s; focus = null; }
  function fitDistrict(d) { const s = Math.min(W, H) / 190; cam.tx = d.x; cam.ty = d.y; cam.tz = s; focus = d; }
  function toScreen(x, y) { return [W / 2 + (x - cam.x) * cam.z, H / 2 + (y - cam.y) * cam.z]; }
  function toWorld(sx, sy) { return [(sx - W / 2) / cam.z + cam.x, (sy - H / 2) / cam.z + cam.y]; }

  /* ---------- pulses and sparks ---------- */
  const pulses = [], sparks = [];
  function pulse(a, b, { size = 1, fore = false, color = 'accent', speed = .8 } = {}) { if (!a || !b) return; pulses.push({ a, b, t: 0, speed, size, fore, color }); if (pulses.length > 900) pulses.splice(0, pulses.length - 900); }
  function spark(x, y, { color = 'accent', n = 6 } = {}) { for (let i = 0; i < n; i++) { const an = rnd() * Math.PI * 2, sp = .3 + rnd() * 1.2; sparks.push({ x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: 1, color }); } }
  const colorOf = (c, fore) => fore || c === 'fore' ? INK2 : c === 'ink' ? INK : c === 'warn' ? '#F4B942' : c === 'bad' ? '#ef6a5a' : c === 'blue' ? '#1F8A65' : theme.accent;

  function event(ev) {
    const node = staffNodes.get(ev.robot); if (!node) return;
    const d = node.district, mkt = d ? byId.get('mkt' + d.ind.id) : hub, cmp = d ? byId.get('cmp' + d.ind.id) : hub;
    switch (ev.type) {
      case 'shift.start': node.state = 'reading'; node.prog = .05; pulse(mkt, node, { size: 1.6, speed: 1.1, color: 'blue' }); break;
      case 'shift.task': node.prog = Math.min(.9, node.prog + .12); node.state = 'working'; spark(node.x, node.y, { n: 3 }); pulse(node, cmp, { size: .8, speed: 1.3, color: 'warn' }); break;
      case 'shift.output': node.prog = 1; node.state = ev.hasText ? 'waiting' : 'graded'; spark(node.x, node.y, { n: 14, color: 'ink' }); pulse(node, hub, { size: 2, speed: .7, color: 'ink' }); setTimeout(() => { node.prog = 0; }, 4000); break;
      case 'shift.grade': { const good = ev.score != null && ev.score >= 60; node.state = 'graded'; spark(hub.x, hub.y, { n: 10, color: good ? 'accent' : 'warn' }); pulse(hub, node, { size: 1.2, speed: 1, color: good ? 'accent' : 'warn' }); break; }
      case 'shift.error': node.state = 'idle'; spark(node.x, node.y, { n: 6, color: 'bad' }); break;
      case 'robot.state': node.state = ev.state; break;
      case 'watch.report': { const w = staffNodes.get('watch'); if (w) { spark(w.x, w.y, { n: 8 }); for (const s of staffNodes.values()) pulse(w, s, { size: .6, speed: 1.6, color: 'blue' }); } break; }
    }
  }
  function setStaffState(id, status) { const n = staffNodes.get(id); if (n) n.state = status; }

  /* ---------- forecast motion (modelled; makes motion only) ---------- */
  function forecastTick(dt) {
    const m = theme.motion; if (m <= 0) return;
    for (const nd of nodes) {
      if (nd.kind !== 'robot' || nd.real) continue;
      if (nd.state === 'asleep') { if (rnd() < dt * .004 * m) nd.state = 'idle'; continue; }
      nd.next -= dt * nd.rate * m;
      if (nd.next <= 0) {
        nd.next = 6 + rnd() * 18;
        const d = nd.district, mkt = byId.get('mkt' + d.ind.id), cmp = byId.get('cmp' + d.ind.id);
        const roll = rnd();
        if (roll < .45) { pulse(mkt, nd, { size: .6, fore: true, speed: 1 }); nd.state = 'reading'; }
        else if (roll < .8) { pulse(nd, cmp, { size: .5, fore: true, speed: 1.2 }); nd.state = 'working'; }
        else if (roll < .95) { pulse(nd, d, { size: .7, fore: true, speed: .9 }); nd.state = 'graded'; if (focus === d) spark(nd.x, nd.y, { n: 3, color: 'fore' }); }
        else nd.state = 'asleep';
        if (rnd() < .15) pulse(d, hub, { size: .5, fore: true, speed: .7 });
      }
    }
  }

  /* ---------- draw ---------- */
  let last = performance.now(), hover = null, frames = 0, fpsT = last, fps = 60;
  function resize() { const r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); if (focus) fitDistrict(focus); else fitEconomy(); cam.x = cam.tx; cam.y = cam.ty; cam.z = cam.tz; }
  function inkLine(ax, ay, bx, by, j) { const mx = (ax + bx) / 2 + (j - .5) * 10 * theme.wobble, my = (ay + by) / 2 + (j - .5) * 10 * theme.wobble; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke(); }
  function disc(sx, sy, r, fill, stroke, lw = 1.3) { ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }
  function shadow(sx, sy, r, a) { ctx.fillStyle = `rgba(100,187,216,${a * .6})`; ctx.beginPath(); ctx.ellipse(sx + r * .5, sy + r * .9, r * 1.5, r * .55, 0, 0, Math.PI * 2); ctx.fill(); }
  function frame(now) {
    const dt = Math.min(50, now - last) / 16.67; last = now;
    frames++; if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now; }
    cam.x += (cam.tx - cam.x) * .08 * dt; cam.y += (cam.ty - cam.y) * .08 * dt; cam.z += (cam.tz - cam.z) * .08 * dt;
    forecastTick(dt);
    const t = now / 1000, zoomed = !!focus, k = Math.sqrt(cam.z);
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    for (const e of edges) {
      if (zoomed && e.fore && e.b !== focus && e.a.district !== focus) continue;
      if (!zoomed && e.fore) continue;
      const [ax, ay] = toScreen(e.a.x, e.a.y), [bx, by] = toScreen(e.b.x, e.b.y);
      ctx.strokeStyle = `rgba(214,220,227,${e.fore ? .08 : .1 + e.w * .22})`;
      inkLine(ax, ay, bx, by, e.j);
    }
    if (!zoomed) {
      // the orbit: a brushed-silver ring through the districts, with a sweeping arc that completes once a minute (a shift clock, not decoration)
      const [cx, cy] = toScreen(0, 0); const rr = R_IND * cam.z;
      ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(214,220,227,.22)'; ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * .98, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(214,220,227,.1)'; ctx.beginPath(); ctx.ellipse(cx, cy, rr * 1.56, rr * .34, -.25, 0, Math.PI * 2); ctx.stroke();
      const sweep = ((now / 1000) % 60) / 60 * Math.PI * 2 - Math.PI / 2; const g = ctx.createLinearGradient(cx + Math.cos(sweep - .9) * rr, cy + Math.sin(sweep - .9) * rr, cx + Math.cos(sweep) * rr, cy + Math.sin(sweep) * rr);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.9)'); ctx.strokeStyle = g; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * .98, 0, sweep - .9, sweep); ctx.stroke(); ctx.restore();
      const ds = nodes.filter((d) => d.kind === 'district');
      ctx.strokeStyle = 'rgba(214,220,227,.05)';
      for (let i = 0; i < ds.length; i++) { const a = ds[i], [ax, ay] = toScreen(a.x, a.y); for (const q of [ds[(i + 1) % ds.length], ds[(i + 3) % ds.length]]) { const [qx, qy] = toScreen(q.x, q.y); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(W / 2 + (ax + qx - W) * .5 * .85, H / 2 + (ay + qy - H) * .5 * .85, qx, qy); ctx.stroke(); } }
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i]; p.t += .012 * p.speed * dt; if (p.t >= 1) { pulses.splice(i, 1); continue; }
      if (zoomed && p.fore && p.a.district !== focus && p.b !== focus) continue;
      if (!zoomed && p.fore && p.b !== hub) continue;
      const ease = p.t < .5 ? 2 * p.t * p.t : 1 - Math.pow(-2 * p.t + 2, 2) / 2;
      const col = colorOf(p.color, p.fore);
      for (let q = 3; q >= 0; q--) { const tt = Math.max(0, ease - q * .03); const x = p.a.x + (p.b.x - p.a.x) * tt, y = p.a.y + (p.b.y - p.a.y) * tt; const [sx, sy] = toScreen(x, y); const r = (p.fore ? 1.6 : 2.6) * p.size * k * (1 - q * .18); ctx.globalAlpha = (p.fore ? .5 : .95) * (1 - q * .22); disc(sx, sy, Math.max(.8, r), col, q === 0 && !p.fore ? INK : null, .8); }
      ctx.globalAlpha = 1;
    }
    for (const nd of nodes) {
      const [sx, sy] = toScreen(nd.x, nd.y);
      if (nd.kind === 'robot' && !nd.real) {
        if (zoomed && nd.district !== focus) continue;
        const r = (zoomed ? 2.6 : 1.4) * k * (nd.state === 'asleep' ? .7 : 1);
        ctx.globalAlpha = nd.state === 'asleep' ? .25 : .55 + .15 * Math.sin(t * 2 + nd.x); disc(sx, sy, Math.max(.7, r), INK2, null); ctx.globalAlpha = 1; continue;
      }
      if (nd.kind === 'market' || nd.kind === 'compute') { if (zoomed && nd.district !== focus) continue; disc(sx, sy, Math.max(1.5, 2.2 * k), PAPER, INK2, 1); continue; }
      if (nd.kind === 'district') {
        if (zoomed && nd !== focus) { disc(sx, sy, 4 * k, PAPER, INK2, 1); continue; }
        const r = nd.r * k * (1 + .04 * Math.sin(t * 1.5 + nd.x * .01));
        shadow(sx, sy, r, .22); disc(sx, sy, r, theme.accent, INK, 1.5);
        if (hover === nd || highlight === nd) disc(sx, sy, r + 4, null, INK, 1.2);
        continue;
      }
      if (nd.kind === 'hub') { const r = nd.r * k; shadow(sx, sy, r, .25); const cg = ctx.createRadialGradient(sx - r * .35, sy - r * .4, r * .1, sx, sy, r); cg.addColorStop(0, '#ffffff'); cg.addColorStop(.45, '#c9ced5'); cg.addColorStop(.75, '#6f757d'); cg.addColorStop(1, '#2a2e33'); disc(sx, sy, r, cg, 'rgba(255,255,255,.5)', 1); disc(sx, sy, r * .3, PAPER, null); continue; }
      if (nd.kind === 'robot' && nd.real) {
        if (zoomed && nd.district !== focus && nd.district) continue;
        const r = nd.r * k * (nd.state === 'asleep' ? .8 : 1) * (1 + .05 * Math.sin(t * 2.2 + nd.y * .01));
        shadow(sx, sy, r, .22);
        disc(sx, sy, r, nd.state === 'asleep' || nd.state === 'idle' ? PAPER : theme.accent, INK, 1.5);
        disc(sx, sy, r * .3, INK, null);
        if (nd.prog > 0) { ctx.strokeStyle = theme.accentInk; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, r + 4, -Math.PI / 2, -Math.PI / 2 + nd.prog * Math.PI * 2); ctx.stroke(); }
        if (highlight === nd) disc(sx, sy, r + 8, null, INK, 1.2);
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) { const sp = sparks[i]; sp.x += sp.vx * dt / cam.z; sp.y += sp.vy * dt / cam.z; sp.life -= .03 * dt; if (sp.life <= 0) { sparks.splice(i, 1); continue; } const [sx, sy] = toScreen(sp.x, sp.y); ctx.globalAlpha = sp.life; disc(sx, sy, Math.max(.6, 2.4 * sp.life * k), colorOf(sp.color), null); }
    ctx.globalAlpha = 1;
    ctx.font = `${Math.max(10, Math.min(12, 10 * k))}px Geist Mono, ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const nd of nodes) {
      const [sx, sy] = toScreen(nd.x, nd.y);
      if (nd.kind === 'district' && zoomed && nd === focus) { ctx.fillStyle = INK; ctx.fillText(nd.label.toUpperCase(), sx, sy + nd.r * k + 8); }
      else if (nd.kind === 'district' && !zoomed) { // short names placed radially outside the ring, so 30 labels never collide
        const lit = hover === nd || highlight === nd; const rad = nd.r * k + 14; const lx = sx + Math.cos(nd.a) * rad, ly = sy + Math.sin(nd.a) * rad;
        ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = Math.cos(nd.a) > .25 ? 'left' : Math.cos(nd.a) < -.25 ? 'right' : 'center'; ctx.fillStyle = lit ? INK : INK2; ctx.font = `${lit ? 600 : 400} ${Math.max(9, Math.min(11, 9.5 * k))}px Geist Mono, ui-monospace, monospace`;
        ctx.fillText(lit ? nd.label.toUpperCase() : nd.short, lx, ly + (Math.abs(Math.cos(nd.a)) <= .25 ? (Math.sin(nd.a) > 0 ? 7 : -7) : 0)); ctx.restore();
      }
      else if (nd.kind === 'robot' && nd.real && (!zoomed || nd.district === focus || !nd.district)) { ctx.fillStyle = INK; ctx.fillText(nd.label, sx, sy + nd.r * k + 8); ctx.fillStyle = nd.state === 'asleep' || nd.state === 'idle' ? INK2 : theme.accentInk; ctx.fillText(nd.state, sx, sy + nd.r * k + 20); }
      else if (nd.kind === 'hub') { ctx.fillStyle = INK; ctx.fillText(nd.label, sx, sy + nd.r * k + 8); }
      else if (zoomed && nd.kind === 'robot' && !nd.real && nd.district === focus && hover === nd) { ctx.fillStyle = INK2; ctx.fillText(nd.label + ' · FORECAST', sx, sy + 8); }
    }
    requestAnimationFrame(frame);
  }

  /* ---------- input ---------- */
  function pick(sx, sy) {
    const [wx, wy] = toWorld(sx, sy); let best = null, bd = 1e9;
    for (const nd of nodes) {
      if (nd.kind === 'market' || nd.kind === 'compute') continue;
      if (!focus && nd.kind === 'robot' && !nd.real) continue;
      if (focus && nd.kind === 'robot' && !nd.real && nd.district !== focus) continue;
      const d = Math.hypot(nd.x - wx, nd.y - wy); const reach = (nd.kind === 'district' ? 26 : nd.kind === 'robot' && nd.real ? 18 : 8) / Math.sqrt(cam.z) + 4;
      if (d < reach && d < bd) { bd = d; best = nd; }
    }
    return best;
  }
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) return;
    const r = canvas.getBoundingClientRect(); const nd = pick(e.clientX - r.left, e.clientY - r.top);
    if (!nd) { if (focus) { fitEconomy(); highlight = null; onPick?.(null); } return; }
    if (nd.kind === 'district') { fitDistrict(nd); highlight = nd; onPick?.(nd); }
    else if (nd.kind === 'hub') { fitEconomy(); highlight = null; onPick?.(null); }
    else onPick?.(nd);
  });
  canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); const nd = pick(e.clientX - r.left, e.clientY - r.top); if (nd !== hover) { hover = nd; onHover?.(nd, e.clientX - r.left, e.clientY - r.top); } });
  canvas.addEventListener('pointerleave', () => { hover = null; onHover?.(null); });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (e.deltaY > 0 && focus) { fitEconomy(); highlight = null; onPick?.(null); } }, { passive: false });
  window.addEventListener('resize', resize);
  resize(); requestAnimationFrame(frame);

  const forecastCount = nodes.filter((nd) => nd.kind === 'robot' && !nd.real).length;
  return {
    event, setStaffState, forecastCount, nodes,
    zoomOut: () => { fitEconomy(); highlight = null; onPick?.(null); },
    zoomTo: (id) => { const d = byId.get('ind' + id); if (d) { fitDistrict(d); highlight = d; onPick?.(d); } },
    focusRobot: (staffId) => { const nd = staffNodes.get(staffId); if (!nd) return; highlight = nd; if (nd.district) { fitDistrict(nd.district); onPick?.(nd.district, true); } else { fitEconomy(); onPick?.(null, true); } },
    setMotion: (v) => { theme.motion = Math.max(0, Math.min(1, v)); },
    setAccent: (hex, ink) => { theme.accent = hex; theme.accentInk = ink || hex; },
    get fps() { return fps; }, get focus() { return focus; },
  };
}

function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

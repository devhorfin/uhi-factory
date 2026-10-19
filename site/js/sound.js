// Procedural sound for the floor (the one place code-made art is right). Off until the person taps Sound; quiet by design.
export function createSound() {
  let ac = null, master = null, on = false;
  function ensure() { if (ac) return; ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = .18; master.connect(ac.destination); }
  function tone({ f = 440, t = .08, type = 'sine', g = 1, slide = 0, delay = 0 }) {
    if (!on || !ac) return; const o = ac.createOscillator(), v = ac.createGain(); const t0 = ac.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t0 + t);
    v.gain.setValueAtTime(0, t0); v.gain.linearRampToValueAtTime(g, t0 + .008); v.gain.exponentialRampToValueAtTime(.0001, t0 + t);
    o.connect(v); v.connect(master); o.start(t0); o.stop(t0 + t + .02);
  }
  function noise({ t = .06, g = .5, delay = 0 }) {
    if (!on || !ac) return; const n = ac.sampleRate * t; const buf = ac.createBuffer(1, n, ac.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf; const v = ac.createGain(); v.gain.value = g; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; src.connect(f); f.connect(v); v.connect(master); src.start(ac.currentTime + delay);
  }
  const map = {
    'shift.start': () => { tone({ f: 330, t: .12, type: 'triangle', g: .5 }); tone({ f: 495, t: .14, type: 'triangle', g: .4, delay: .1 }); },
    'shift.task': () => tone({ f: 1200 + Math.random() * 300, t: .03, type: 'square', g: .12 }),
    'shift.output': () => { noise({ t: .05, g: .35 }); tone({ f: 180, t: .16, type: 'sine', g: .6, slide: -80 }); },
    'shift.grade': (ev) => { if (ev.score != null && ev.score >= 60) { tone({ f: 660, t: .18, g: .35 }); tone({ f: 990, t: .22, g: .3, delay: .09 }); } else tone({ f: 140, t: .3, type: 'sawtooth', g: .25, slide: -40 }); },
    'shift.error': () => tone({ f: 110, t: .25, type: 'sawtooth', g: .3 }),
    'watch.report': () => { [262, 330, 392, 523].forEach((f, i) => tone({ f, t: .5, g: .25, delay: i * .06 })); },
  };
  return {
    get on() { return on; },
    toggle() { ensure(); on = !on; if (on && ac.state === 'suspended') ac.resume(); if (on) tone({ f: 523, t: .12, g: .3 }); return on; },
    event(ev) { const f = map[ev.type]; if (f) f(ev); },
  };
}

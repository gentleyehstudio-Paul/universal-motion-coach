// Tiny WebAudio synth so the game ships without audio files. To use recorded CC0
// sounds instead (Kenney, freesound), replace the bodies of play*() with
// <audio>/AudioBuffer playback — the call sites stay the same.
let ac = null;
let muted = false;
try { muted = localStorage.getItem('fit.muted') === '1'; } catch { /* private mode */ }

function ctx() {
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function tone(freq, dur, { type = 'square', vol = 0.05, slide = 0, delay = 0 } = {}) {
  if (muted) return;
  const a = ctx();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const audio = {
  unlock() { ctx(); },
  get muted() { return muted; },
  setMuted(m) { muted = m; try { localStorage.setItem('fit.muted', m ? '1' : '0'); } catch { /* ignore */ } },
  charge() { tone(220, 0.08, { type: 'triangle', vol: 0.03 }); },
  jump(units = 1) { tone(280 + units * 60, 0.14, { slide: 260 }); },
  land() { tone(180, 0.07, { type: 'triangle', vol: 0.07, slide: -60 }); },
  drop() { tone(880, 0.09, { type: 'sine', vol: 0.06 }); tone(1320, 0.12, { type: 'sine', vol: 0.05, delay: 0.07 }); },
  fall() { tone(420, 0.45, { type: 'sawtooth', vol: 0.04, slide: -330 }); },
  checkpoint() { tone(660, 0.08, { type: 'triangle', vol: 0.05 }); tone(990, 0.12, { type: 'triangle', vol: 0.05, delay: 0.08 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.05, delay: i * 0.11 })); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.06, delay: i * 0.16 })); },
  tick() { tone(1000, 0.03, { type: 'square', vol: 0.02 }); },
  ui() { tone(520, 0.05, { type: 'triangle', vol: 0.04 }); },
  onEvents(events) {
    for (const e of events) {
      if (e.k === 'charge') this.charge();
      else if (e.k === 'jump') this.jump(e.units);
      else if (e.k === 'land') this.land();
      else if (e.k === 'drop') this.drop();
      else if (e.k === 'fall') this.fall();
      else if (e.k === 'checkpoint') this.checkpoint();
      else if (e.k === 'win') this.win();
      else if (e.k === 'lose') this.lose();
    }
  },
};

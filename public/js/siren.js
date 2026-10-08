'use strict';
// Siren generated with the Web Audio API (no audio files needed).
//   emergency: rising/falling wail      (up to 5 minutes, or until stopped)
//   warning:   two-tone hi-lo           (up to 30 seconds)
//   advisory:  three short beeps        (up to 10 seconds)
// Browsers only allow sound after the user has tapped/clicked the page at least once,
// so the siren "unlocks" on the first tap and, if blocked, starts as soon as the user taps.
const Siren = (() => {
  const VOLUME = 0.5;
  const MAX_SECONDS = { advisory: 10, warning: 30, emergency: 300 };
  const VIBRATE = {
    advisory: [200, 100, 200],
    warning: [400, 200, 400, 200, 400],
    emergency: [600, 200, 600, 200, 600, 200, 600, 200, 600]
  };
  let ctx = null, osc = null, gain = null, timer = null;
  let level = null, nextTime = 0, endAt = 0;
  const listeners = [];
  const emit = () => listeners.forEach((fn) => { try { fn(level); } catch { /* ignore */ } });

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      ctx.onstatechange = emit;
    }
    return ctx;
  }

  // Try to start audio. Resolves true if sound is allowed. Never hangs (resume() can stay pending).
  async function unlock() {
    const c = getCtx();
    if (!c) return false;
    if (c.state !== 'running') {
      try { await Promise.race([c.resume(), new Promise((r) => setTimeout(r, 400))]); } catch { /* ignore */ }
    }
    return c.state === 'running';
  }

  // Schedules one cycle of the pattern starting at audio-time t. Returns the cycle length in seconds.
  function scheduleCycle(t) {
    const f = osc.frequency, g = gain.gain;
    if (level === 'emergency') {
      g.setValueAtTime(VOLUME, t);
      f.setValueAtTime(600, t);
      f.linearRampToValueAtTime(1200, t + 1.5);
      f.linearRampToValueAtTime(600, t + 3);
      return 3;
    }
    if (level === 'warning') {
      g.setValueAtTime(VOLUME, t);
      for (let i = 0; i < 4; i++) { f.setValueAtTime(700, t + i); f.setValueAtTime(950, t + i + 0.5); }
      return 4;
    }
    f.setValueAtTime(880, t);
    for (let i = 0; i < 3; i++) { g.setValueAtTime(VOLUME, t + i * 0.4); g.setValueAtTime(0, t + i * 0.4 + 0.2); }
    return 2;
  }

  function tick() {
    if (!osc) return;
    if (ctx.currentTime >= endAt) return stop();   // audio time only advances while sound is allowed
    while (nextTime < ctx.currentTime + 3 && nextTime < endAt) nextTime += scheduleCycle(nextTime);
  }

  async function play(lvl, opts = {}) {
    stop(true);
    const c = getCtx();
    if (!c) return false;
    level = MAX_SECONDS[lvl] ? lvl : 'emergency';
    osc = c.createOscillator();
    gain = c.createGain();
    osc.type = level === 'advisory' ? 'square' : 'sawtooth';
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    nextTime = c.currentTime + 0.05;
    endAt = c.currentTime + (opts.maxSeconds || MAX_SECONDS[level]);
    tick();
    timer = setInterval(tick, 500);
    try { if (navigator.vibrate) navigator.vibrate(VIBRATE[level]); } catch { /* needs a recent tap */ }
    emit();
    await unlock();
    return c.state === 'running';
  }

  function stop(silent) {
    if (timer) { clearInterval(timer); timer = null; }
    if (osc) {
      try { gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setValueAtTime(0, ctx.currentTime); osc.stop(ctx.currentTime + 0.05); } catch { /* already stopped */ }
      try { osc.disconnect(); gain.disconnect(); } catch { /* ignore */ }
      osc = null; gain = null;
    }
    const was = level;
    level = null;
    try { if (navigator.vibrate) navigator.vibrate(0); } catch { /* ignore */ }
    if (!silent && was) emit();
  }

  // The first tap anywhere unlocks sound for the rest of the visit.
  ['pointerdown', 'keydown', 'touchend'].forEach((ev) =>
    document.addEventListener(ev, () => { getCtx(); if (ctx && ctx.state !== 'running') unlock(); }, { passive: true }));

  return {
    play, stop, unlock,
    isPlaying: () => level !== null,
    isRunning: () => level !== null && !!ctx && ctx.state === 'running',
    onChange: (fn) => listeners.push(fn)
  };
})();

'use strict';

/* =============================================================
   audio.js — a tiny synthesiser built on the Web Audio API.
   Every sound is one oscillator with a quick fade in/out, panned
   left/right by screen position, plus a soft echo for "space".
   Notes come from a major pentatonic scale, so any combination
   of notes sounds pleasant together.
   ============================================================= */

const Sound = (() => {
  const SCALE = [0, 2, 4, 7, 9]; // C D E G A (semitones above C)
  const BASE = 261.63;           // middle C (C4) in Hz

  let ctx = null;
  let master = null;
  let echo = null;
  let enabled = false;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0.6;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);

    // echo: delay -> lowpass -> feedback -> back into delay
    echo = ctx.createDelay(1);
    echo.delayTime.value = 0.28;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.33;
    echo.connect(lp);
    lp.connect(feedback);
    feedback.connect(echo);
    lp.connect(master);
  }

  // Browsers only allow audio after a click/keypress, so this may stay
  // suspended until unlock() is called from a user gesture.
  function setEnabled(on) {
    enabled = on;
    if (on) {
      init();
      if (ctx && ctx.state !== 'running') return ctx.resume().catch(() => {});
    } else if (ctx && ctx.state === 'running') {
      ctx.suspend().catch(() => {});
    }
    return Promise.resolve();
  }

  function unlock() {
    if (enabled && ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  // Scale degree -> frequency. Degree 0 = C4, 5 = C5, -5 = C3 ...
  function freq(degree, octave = 0) {
    const n = SCALE.length;
    const o = floor(degree / n);
    const semis = SCALE[((degree % n) + n) % n] + 12 * (o + octave);
    return BASE * pow(2, semis / 12);
  }

  function tone({ f, type = 'sine', dur = 0.8, vol = 0.06, pan = 0, slide = 0, wet = 0.35, at = 0 }) {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + at;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(max(30, f * slide), t0 + dur * 0.6);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);

    let out = gain;
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      gain.connect(panner);
      out = panner;
    }
    out.connect(master);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      out.connect(send);
      send.connect(echo);
    }

    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  return {
    setEnabled,
    unlock,
    freq,
    tone,
    get enabled() { return enabled; },
  };
})();

// Music: three streamed theme loops with mood crossfades, plus a synthesised
// drum/drone "tension" layer for combat and caravan moods (no extra assets needed).

import { playSynth } from './synth.js';

const FADE_SECONDS = 2.5;
const LOOP_FADE_SECONDS = 1.6;
const SCHEDULE_AHEAD = 0.3;
const STEPS_PER_BAR = 16;

const TRACK_FILES = {
  town: 'town-theme',
  road: 'road-theme',
  island: 'island-theme',
};

/**
 * mood → mix. `track: 'keep'` leaves the current theme playing (ducked); `tension` selects a pulse pattern.
 * `level` is the theme gain, `lowpass` darkens it, `rate` is the playback speed.
 */
const MOODS = {
  menu: { track: 'town', level: 0.8, lowpass: 20000, rate: 1, tension: null },
  town: { track: 'town', level: 1, lowpass: 20000, rate: 1, tension: null },
  road: { track: 'road', level: 1, lowpass: 20000, rate: 1, tension: null },
  wild: { track: 'island', level: 0.8, lowpass: 20000, rate: 1, tension: null },
  night: { track: 'island', level: 0.55, lowpass: 1500, rate: 1, tension: null },
  caravan: { track: 'road', level: 0.6, lowpass: 5200, rate: 1, tension: 'caravan' },
  combat: { track: 'keep', level: 0.38, lowpass: 1200, rate: 1, tension: 'combat' },
  none: { track: null, level: 0, lowpass: 20000, rate: 1, tension: null },
};

/**
 * Tension patterns, 16 steps per bar. `low` / `tick` are per-step accents (0 = rest).
 * `drone` are oscillator frequencies of the sustained bed.
 */
const TENSION = {
  combat: {
    stepSeconds: 60 / 104 / 4,
    low: [1, 0, 0, 0.55, 0, 0, 0.8, 0, 1, 0, 0, 0.55, 0, 0, 0.8, 0.45],
    tick: [0, 0, 0.5, 0, 0.6, 0, 0, 0.4, 0, 0, 0.5, 0, 0.6, 0, 0, 0],
    drone: [55, 55.5, 82.6],
    droneLevel: 0.05,
    pitch: 1,
  },
  caravan: {
    stepSeconds: 60 / 76 / 4,
    low: [1, 0, 0, 0, 0, 0, 0.5, 0, 0.8, 0, 0, 0, 0, 0, 0, 0],
    tick: [0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0.35, 0],
    drone: [73.4, 73.8, 110.2],
    droneLevel: 0.032,
    pitch: 1.12,
  },
};

/** Chords (Hz) for the synthesised pad that replaces a theme whose file cannot be played. */
const FALLBACK_CHORDS = {
  town: [196, 247, 294, 440],
  road: [147, 220, 294, 330],
  island: [110, 165, 262, 392],
};

/** Smoothly move an AudioParam to a value without clicks, from wherever it is now. */
function rampTo(param, value, now, seconds) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}

/**
 * @param {AudioContext} ctx
 * @param {AudioNode} output music bus
 * @param {(file:string) => string} resolveUrl maps an asset base name to a URL
 * @returns {{setMood:(mood:string)=>void, update:(dt:number)=>void, pause:()=>void, resume:()=>void, getMood:()=>string}}
 */
export function createMusic(ctx, output, resolveUrl) {
  const tracks = new Map();
  let mood = 'none';
  let activeKey = null;
  let paused = false;

  const tensionGain = ctx.createGain();
  tensionGain.gain.value = 0;
  tensionGain.connect(output);
  let tensionName = null;
  let tensionStep = 0;
  let nextStepTime = 0;
  let drone = null;

  function buildFallbackPad(track, key) {
    const padGain = ctx.createGain();
    padGain.gain.value = 0.05;
    const tremolo = ctx.createOscillator();
    const tremoloDepth = ctx.createGain();
    tremolo.frequency.value = 0.11;
    tremoloDepth.gain.value = 0.02;
    tremolo.connect(tremoloDepth).connect(padGain.gain);
    tremolo.start();
    FALLBACK_CHORDS[key].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = index === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = (index - 1.5) * 4;
      osc.connect(padGain);
      osc.start();
    });
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 700;
    padGain.connect(soften).connect(track.filter);
    track.element = null;
    track.failed = true;
  }

  function createTrack(key) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    filter.Q.value = 0.3;
    const loopGain = ctx.createGain();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    filter.connect(loopGain).connect(gain).connect(output);
    const track = { key, element: null, filter, loopGain, gain, target: 0, silentFor: 0, nearEnd: false, failed: false };
    tracks.set(key, track);
    if (typeof Audio === 'undefined') {
      buildFallbackPad(track, key);
      return track;
    }
    try {
      const element = new Audio();
      element.preload = 'auto';
      element.loop = true;
      element.src = resolveUrl(TRACK_FILES[key]);
      element.addEventListener('error', () => {
        if (!track.failed) buildFallbackPad(track, key);
      });
      ctx.createMediaElementSource(element).connect(filter);
      track.element = element;
    } catch {
      buildFallbackPad(track, key);
    }
    return track;
  }

  function startElement(track) {
    if (!track.element || paused || !track.element.paused) return;
    const promise = track.element.play();
    if (promise) promise.catch(() => {});
  }

  function ensureDrone(pattern) {
    if (!drone) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 170;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      filter.connect(gain).connect(tensionGain);
      const oscillators = pattern.drone.map(() => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.connect(filter);
        osc.start();
        return osc;
      });
      drone = { oscillators, gain };
    }
    const now = ctx.currentTime;
    drone.oscillators.forEach((osc, index) => {
      osc.frequency.setTargetAtTime(pattern.drone[index], now, 0.4);
    });
    drone.gain.gain.setTargetAtTime(pattern.droneLevel, now, 0.8);
  }

  function setTension(name) {
    if (name === tensionName) return;
    const now = ctx.currentTime;
    if (name) {
      ensureDrone(TENSION[name]);
      if (!tensionName) {
        tensionStep = 0;
        nextStepTime = now + 0.25;
      }
      rampTo(tensionGain.gain, 1, now, 1.2);
    } else {
      rampTo(tensionGain.gain, 0, now, FADE_SECONDS);
    }
    tensionName = name;
  }

  function scheduleTension() {
    if (!tensionName) return;
    const pattern = TENSION[tensionName];
    const now = ctx.currentTime;
    if (nextStepTime < now) nextStepTime = now + 0.05;
    while (nextStepTime < now + SCHEDULE_AHEAD) {
      const low = pattern.low[tensionStep];
      const tick = pattern.tick[tensionStep];
      if (low > 0) playSynth(ctx, 'drum-low', tensionGain, nextStepTime, { gain: low, pitch: pattern.pitch });
      if (tick > 0) playSynth(ctx, 'drum-tick', tensionGain, nextStepTime, { gain: tick, pitch: pattern.pitch });
      tensionStep = (tensionStep + 1) % STEPS_PER_BAR;
      nextStepTime += pattern.stepSeconds;
    }
  }

  /**
   * Switch the musical mood with a crossfade.
   * @param {'menu'|'town'|'road'|'wild'|'combat'|'caravan'|'night'|'none'} nextMood
   */
  function setMood(nextMood) {
    const mix = MOODS[nextMood];
    if (!mix || nextMood === mood) return;
    mood = nextMood;
    const now = ctx.currentTime;
    if (mix.track === 'keep') {
      activeKey = activeKey || 'road';
    } else {
      activeKey = mix.track;
    }
    if (activeKey && !tracks.has(activeKey)) createTrack(activeKey);
    for (const track of tracks.values()) {
      const isActive = track.key === activeKey;
      track.target = isActive ? mix.level : 0;
      rampTo(track.gain.gain, track.target, now, FADE_SECONDS);
      if (!isActive) continue;
      track.silentFor = 0;
      track.filter.frequency.setTargetAtTime(mix.lowpass, now, 0.6);
      if (track.element) track.element.playbackRate = mix.rate;
      startElement(track);
    }
    setTension(mix.tension);
  }

  /** Per-frame upkeep: loop-point fades, pausing silent streams, drum scheduling. */
  function update(dt) {
    if (paused) return;
    const now = ctx.currentTime;
    for (const track of tracks.values()) {
      const element = track.element;
      if (!element) continue;
      if (track.target <= 0) {
        track.silentFor += dt;
        if (track.silentFor > FADE_SECONDS + 0.5 && !element.paused) element.pause();
        continue;
      }
      const remaining = element.duration - element.currentTime;
      const nearEnd = Number.isFinite(remaining) && remaining < LOOP_FADE_SECONDS;
      if (nearEnd !== track.nearEnd) {
        track.nearEnd = nearEnd;
        track.loopGain.gain.setTargetAtTime(nearEnd ? 0 : 1, now, nearEnd ? 0.45 : 0.25);
      }
    }
    scheduleTension();
  }

  /** Stop the streams (tab hidden); positions are kept. */
  function pause() {
    paused = true;
    for (const track of tracks.values()) {
      if (track.element) track.element.pause();
    }
  }

  /** Continue the streams that should be audible. */
  function resume() {
    paused = false;
    for (const track of tracks.values()) {
      if (track.target > 0) startElement(track);
    }
  }

  return { setMood, update, pause, resume, getMood: () => mood };
}

/** Moods understood by `setMood`. */
export const MUSIC_MOODS = Object.keys(MOODS);

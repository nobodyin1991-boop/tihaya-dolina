// Synthesised sound effects: soft filtered-noise bursts and short tonal blips with envelopes.
// Every recipe is a small function that adds layers to a voice builder. Amplitudes are real
// output levels (peaks around 0.03–0.12), tuned to sit well below the music.

const NOISE_SECONDS = 2;
const MIN_LEVEL = 0.0001;
const noiseBuffers = new WeakMap();

/**
 * Shared looping white-noise buffer for a context (deterministic, created once).
 * @param {BaseAudioContext} ctx
 * @returns {AudioBuffer}
 */
export function getNoiseBuffer(ctx) {
  let buffer = noiseBuffers.get(ctx);
  if (buffer) return buffer;
  const length = Math.ceil(ctx.sampleRate * NOISE_SECONDS);
  buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 1297;
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 4294967296) * 2 - 1;
  }
  noiseBuffers.set(ctx, buffer);
  return buffer;
}

/**
 * Voice builder: recipes call `tone` / `noise` to add enveloped layers.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out destination node
 * @param {number} startTime context time of the sound start
 * @param {number} pitch frequency multiplier
 * @param {number} level amplitude multiplier
 */
function createBuilder(ctx, out, startTime, pitch, level) {
  let endTime = startTime;

  function envelope(at, duration, peak, attack, hold) {
    const amp = ctx.createGain();
    const attackEnd = at + Math.min(attack, duration * 0.5);
    const holdEnd = Math.max(attackEnd, Math.min(attackEnd + hold, at + duration - 0.02));
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(peak, attackEnd);
    amp.gain.setValueAtTime(peak, holdEnd);
    amp.gain.exponentialRampToValueAtTime(MIN_LEVEL, at + duration);
    amp.connect(out);
    endTime = Math.max(endTime, at + duration + 0.04);
    return amp;
  }

  return {
    /** Latest moment any layer is still audible. */
    get endTime() {
      return endTime;
    },

    /** Uniform random number in [min, max). */
    rand(min, max) {
      return min + Math.random() * (max - min);
    },

    /**
     * Oscillator layer.
     * @param {number} freq start frequency, Hz
     * @param {number} duration seconds
     * @param {number} gain peak amplitude
     * @param {{to?:number, glide?:number[][], delay?:number, type?:OscillatorType, attack?:number, hold?:number, lowpass?:number}} [o]
     *   `to` — end frequency; `glide` — [[timeFraction, freq], …] instead of `to`; `lowpass` — soften harmonics.
     */
    tone(freq, duration, gain, o = {}) {
      const at = startTime + (o.delay || 0);
      const osc = ctx.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq * pitch, at);
      const glide = o.glide || (o.to ? [[1, o.to]] : []);
      for (const [fraction, target] of glide) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, target * pitch), at + duration * fraction);
      }
      const amp = envelope(at, duration, gain * level, o.attack ?? 0.01, o.hold || 0);
      if (o.lowpass) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = o.lowpass * pitch;
        filter.Q.value = 1.2;
        osc.connect(filter).connect(amp);
      } else {
        osc.connect(amp);
      }
      osc.start(at);
      osc.stop(at + duration + 0.03);
    },

    /**
     * Filtered noise layer.
     * @param {number} duration seconds
     * @param {number} gain peak amplitude
     * @param {{freq?:number, to?:number, q?:number, filter?:BiquadFilterType, delay?:number, attack?:number, hold?:number}} [o]
     */
    noise(duration, gain, o = {}) {
      const at = startTime + (o.delay || 0);
      const source = ctx.createBufferSource();
      source.buffer = getNoiseBuffer(ctx);
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = o.filter || 'lowpass';
      filter.Q.value = o.q ?? 0.5;
      const freq = (o.freq || 900) * pitch;
      filter.frequency.setValueAtTime(freq, at);
      if (o.to) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(40, o.to * pitch), at + duration);
      }
      const amp = envelope(at, duration, gain * level, o.attack ?? 0.012, o.hold || 0);
      source.connect(filter).connect(amp);
      source.start(at, Math.random() * (NOISE_SECONDS - 0.1));
      source.stop(at + duration + 0.03);
    },
  };
}

/** A few bell-like notes in a row. */
function chime(v, notes, step, duration, gain) {
  notes.forEach((freq, index) => {
    v.tone(freq, duration, gain, { delay: index * step });
    v.tone(freq * 2, duration * 0.6, gain * 0.25, { delay: index * step });
  });
}

function growl(base, brightness) {
  return (v) => {
    v.tone(base, 0.5, 0.06, { to: base * 0.7, type: 'sawtooth', lowpass: base * 3.5, attack: 0.05, hold: 0.15 });
    v.tone(base * 1.02, 0.45, 0.03, { to: base * 0.72, type: 'triangle', attack: 0.05 });
    v.noise(0.4, 0.025, { freq: brightness, attack: 0.06 });
  };
}

function bleat(base) {
  return (v) => {
    for (let i = 0; i < 3; i++) {
      v.tone(base * (1 + i * 0.06), 0.16, 0.035, { to: base * 0.85, type: 'triangle', delay: i * 0.1, lowpass: base * 3 });
    }
  };
}

function squeak(base) {
  return (v) => {
    v.tone(base, 0.2, 0.035, { glide: [[0.3, base * 1.3], [1, base * 0.7]], attack: 0.03 });
    v.tone(base * 0.8, 0.12, 0.015, { to: base * 0.6, delay: 0.14 });
  };
}

function footstep(noiseFreq, noiseOptions, thudFreq, thudGain) {
  return (v) => {
    v.noise(0.08, 0.045, { freq: noiseFreq * v.rand(0.85, 1.15), ...noiseOptions });
    v.tone(thudFreq * v.rand(0.9, 1.1), 0.06, thudGain, { to: thudFreq * 0.6, type: 'triangle' });
  };
}

const metalHit = (v) => {
  v.tone(196, 0.22, 0.05, { type: 'triangle' });
  v.tone(294, 0.18, 0.03);
  v.tone(1180, 0.12, 0.012);
  v.noise(0.07, 0.04, { freq: 1300, filter: 'bandpass', q: 0.9 });
};

const pickHit = (v) => {
  v.tone(1240, 0.12, 0.028, { type: 'triangle' });
  v.tone(1860, 0.2, 0.012);
  v.tone(170, 0.09, 0.055, { to: 110 });
  v.noise(0.06, 0.04, { freq: 2000, filter: 'bandpass', q: 0.8 });
};

const axeHit = (v) => {
  v.tone(160, 0.11, 0.075, { to: 90, type: 'triangle' });
  v.noise(0.07, 0.06, { freq: 900 });
  v.noise(0.05, 0.018, { freq: 2600, filter: 'bandpass', delay: 0.01 });
};

const softClick = (v) => {
  v.tone(620, 0.07, 0.03, { to: 520 });
};

/** name → recipe. Names starting with `voice-`, `amb-`, `drum-` and `hiss` are internal helpers. */
const RECIPES = {
  // ── movement ──
  'step-grass': footstep(600, { to: 250 }, 90, 0.018),
  'step-stone': footstep(1600, { filter: 'bandpass', q: 1.2 }, 185, 0.022),
  'step-wood': footstep(800, { to: 400 }, 145, 0.04),
  'step-water': (v) => {
    v.noise(0.17, 0.05, { freq: 1600, to: 500, filter: 'bandpass', q: 0.8, attack: 0.02 });
    v.tone(v.rand(380, 480), 0.07, 0.014, { to: 180 });
  },
  jump: (v) => {
    v.noise(0.13, 0.04, { freq: 700, attack: 0.02 });
    v.tone(170, 0.12, 0.022, { to: 260 });
  },
  land: (v) => {
    v.noise(0.12, 0.07, { freq: 420, to: 150 });
    v.tone(95, 0.13, 0.05, { to: 55 });
  },

  // ── combat ──
  swing: (v) => {
    v.noise(0.24, 0.06, { freq: 500, to: 1900, filter: 'bandpass', q: 1.4, attack: 0.08 });
  },
  'hit-flesh': (v) => {
    v.tone(120, 0.11, 0.075, { to: 60 });
    v.noise(0.08, 0.045, { freq: 600 });
  },
  'hit-armor': (v) => {
    v.tone(140, 0.08, 0.05, { to: 80 });
    v.tone(880, 0.1, 0.026, { type: 'triangle' });
    v.tone(1320, 0.14, 0.014);
    v.noise(0.06, 0.04, { freq: 2400, filter: 'bandpass', q: 0.9 });
  },
  block: metalHit,
  crit: (v) => {
    v.tone(100, 0.16, 0.085, { to: 50 });
    v.noise(0.1, 0.05, { freq: 900 });
    v.tone(1175, 0.24, 0.03, { delay: 0.02 });
    v.tone(1568, 0.3, 0.02, { delay: 0.05 });
  },
  'arrow-fly': (v) => {
    v.noise(0.3, 0.04, { freq: 2600, to: 900, filter: 'bandpass', q: 3, attack: 0.06 });
  },
  bolt: (v) => {
    v.tone(200, 0.07, 0.055, { to: 110, type: 'triangle' });
    v.tone(420, 0.05, 0.018, { delay: 0.012 });
    v.noise(0.13, 0.045, { freq: 1800, to: 700, filter: 'bandpass' });
  },
  death: (v) => {
    v.tone(150, 0.75, 0.05, { to: 55, type: 'triangle', attack: 0.03 });
    v.noise(0.5, 0.03, { freq: 400, to: 150, attack: 0.05 });
  },

  // ── progress & trade ──
  levelup: (v) => {
    chime(v, [392, 494, 587, 784], 0.11, 0.6, 0.04);
    v.tone(196, 0.9, 0.03, { attack: 0.05, hold: 0.3 });
    v.noise(0.5, 0.012, { freq: 3000, filter: 'highpass', attack: 0.2 });
  },
  'quest-start': (v) => {
    chime(v, [294, 440], 0.13, 0.45, 0.04);
  },
  'quest-done': (v) => {
    chime(v, [392, 494, 587], 0.1, 0.4, 0.04);
    v.tone(784, 0.8, 0.035, { delay: 0.32 });
    v.tone(392, 0.8, 0.02, { delay: 0.32 });
  },
  coin: (v) => {
    v.tone(1568, 0.1, 0.025);
    v.tone(2093, 0.26, 0.025, { delay: 0.06 });
  },
  buy: (v) => {
    v.tone(1319, 0.1, 0.025);
    v.tone(1760, 0.24, 0.025, { delay: 0.07 });
    v.noise(0.06, 0.02, { freq: 700 });
  },
  sell: (v) => {
    v.tone(1760, 0.1, 0.025);
    v.tone(1319, 0.14, 0.025, { delay: 0.07 });
    v.tone(2093, 0.26, 0.02, { delay: 0.15 });
  },
  craft: (v) => {
    v.tone(196, 0.1, 0.05, { to: 150, type: 'triangle' });
    v.noise(0.05, 0.03, { freq: 1200 });
    v.tone(587, 0.26, 0.032, { delay: 0.1 });
    v.tone(880, 0.34, 0.026, { delay: 0.18 });
  },
  equip: (v) => {
    v.noise(0.13, 0.045, { freq: 1500, to: 700, filter: 'bandpass', attack: 0.03 });
    v.tone(240, 0.08, 0.03, { to: 170, type: 'triangle', delay: 0.07 });
    v.tone(720, 0.1, 0.012, { delay: 0.08 });
  },

  // ── interface ──
  open: (v) => {
    v.tone(440, 0.12, 0.032);
    v.tone(587, 0.18, 0.028, { delay: 0.055 });
    v.noise(0.1, 0.012, { freq: 900 });
  },
  close: (v) => {
    v.tone(494, 0.1, 0.03);
    v.tone(370, 0.15, 0.026, { delay: 0.05 });
  },
  tab: softClick,
  hover: (v) => {
    v.tone(880, 0.04, 0.011);
  },
  error: (v) => {
    v.tone(233, 0.1, 0.035, { type: 'triangle' });
    v.tone(208, 0.17, 0.035, { type: 'triangle', delay: 0.1 });
  },

  // ── gathering & items ──
  'gather-herb': (v) => {
    v.noise(0.2, 0.055, { freq: 1800, to: 900, filter: 'bandpass', attack: 0.05 });
    v.noise(0.1, 0.035, { freq: 2400, filter: 'bandpass', delay: 0.15, attack: 0.02 });
  },
  'gather-ore': pickHit,
  'gather-wood': axeHit,
  'gather-stone': (v) => {
    v.tone(320, 0.07, 0.045, { to: 200, type: 'triangle' });
    v.noise(0.11, 0.065, { freq: 1300, to: 500 });
    v.noise(0.18, 0.015, { freq: 2200, filter: 'bandpass', delay: 0.08, attack: 0.03 });
  },
  chest: (v) => {
    v.tone(180, 0.26, 0.02, { to: 265, type: 'triangle', attack: 0.09, lowpass: 900 });
    v.tone(110, 0.12, 0.05, { to: 70, delay: 0.26 });
    v.noise(0.06, 0.03, { freq: 700, delay: 0.26 });
    v.tone(880, 0.3, 0.022, { delay: 0.36 });
    v.tone(1175, 0.4, 0.02, { delay: 0.44 });
  },
  eat: (v) => {
    for (let i = 0; i < 3; i++) {
      v.noise(0.06, 0.04, { freq: v.rand(1000, 1500), filter: 'bandpass', q: 1.1, delay: i * 0.14 });
    }
  },
  drink: (v) => {
    for (let i = 0; i < 3; i++) {
      v.tone(310, 0.1, 0.035, { glide: [[0.6, 190], [1, 260]], delay: i * 0.17, attack: 0.02 });
    }
  },
  bandage: (v) => {
    v.noise(0.2, 0.04, { freq: 2200, to: 1200, filter: 'bandpass', attack: 0.06 });
    v.noise(0.24, 0.04, { freq: 1500, to: 2600, filter: 'bandpass', delay: 0.22, attack: 0.09 });
  },

  // ── caravan & world ──
  'wagon-creak': (v) => {
    v.tone(210, 0.38, 0.022, { glide: [[0.5, 262], [1, 230]], type: 'triangle', attack: 0.13, lowpass: 1100 });
    v.tone(318, 0.3, 0.01, { to: 380, attack: 0.12 });
    v.noise(0.32, 0.02, { freq: 300, attack: 0.1 });
  },
  'wagon-hit': (v) => {
    v.tone(85, 0.26, 0.09, { to: 45 });
    v.noise(0.18, 0.07, { freq: 500 });
    v.tone(190, 0.1, 0.04, { to: 120, type: 'triangle', delay: 0.015 });
    v.noise(0.05, 0.03, { freq: 1800, filter: 'bandpass', delay: 0.02 });
  },
  horn: (v) => {
    v.tone(147, 0.55, 0.06, { type: 'sawtooth', lowpass: 620, attack: 0.09, hold: 0.36 });
    v.tone(220, 1.5, 0.065, { type: 'sawtooth', lowpass: 760, attack: 0.1, hold: 0.85, delay: 0.5 });
    v.tone(110, 1.5, 0.03, { attack: 0.12, hold: 0.85, delay: 0.5 });
  },
  door: (v) => {
    v.tone(240, 0.24, 0.016, { to: 305, type: 'triangle', attack: 0.09, lowpass: 1000 });
    v.tone(100, 0.11, 0.055, { to: 65, delay: 0.25 });
    v.noise(0.07, 0.04, { freq: 700, delay: 0.25 });
  },
  bell: (v) => {
    v.tone(523, 2.2, 0.05, { attack: 0.004 });
    v.tone(1046, 1.5, 0.026, { attack: 0.004 });
    v.tone(1443, 1.0, 0.016, { attack: 0.004 });
    v.tone(2824, 0.4, 0.006, { attack: 0.004 });
    v.tone(261, 2.4, 0.02, { attack: 0.02 });
  },
  thunder: (v) => {
    v.noise(0.5, 0.07, { freq: 900, to: 150, attack: 0.02 });
    v.noise(2.8, 0.14, { freq: 220, to: 60, attack: 0.08, hold: 0.5 });
    v.tone(52, 1.8, 0.07, { to: 34, attack: 0.08, hold: 0.3 });
  },
  'howl-far': (v) => {
    v.tone(310, 1.9, 0.03, { glide: [[0.25, 440], [0.7, 452], [1, 350]], attack: 0.35, hold: 0.8 });
    v.tone(622, 1.8, 0.007, { glide: [[0.25, 880], [0.7, 904], [1, 700]], attack: 0.4, hold: 0.7 });
    v.noise(1.6, 0.006, { freq: 600, filter: 'bandpass', q: 2, attack: 0.4 });
  },

  // ── fallbacks for the mp3 one-shots ──
  sword: (v) => {
    v.noise(0.16, 0.06, { freq: 1400, to: 700, filter: 'bandpass' });
    v.tone(150, 0.12, 0.035, { to: 80, delay: 0.05 });
  },
  bow: (v) => {
    v.tone(360, 0.1, 0.05, { to: 140, type: 'triangle' });
    v.noise(0.22, 0.045, { freq: 1700, to: 700, filter: 'bandpass', delay: 0.02 });
  },
  impact: (v) => {
    v.tone(110, 0.22, 0.085, { to: 55 });
    v.noise(0.1, 0.055, { freq: 650 });
  },
  shield: metalHit,
  fire: (v) => {
    v.noise(0.45, 0.075, { freq: 750, to: 300, attack: 0.06 });
    v.tone(150, 0.35, 0.035, { to: 80, attack: 0.04 });
  },
  ice: (v) => {
    chime(v, [990, 825, 660], 0.08, 0.3, 0.03);
    v.noise(0.3, 0.015, { freq: 3000, filter: 'highpass', attack: 0.03 });
  },
  spark: (v) => {
    for (let i = 0; i < 3; i++) {
      v.tone(i % 2 ? 660 : 440, 0.09, 0.035, { to: 880, delay: i * 0.075 });
      v.noise(0.06, 0.025, { freq: 2500, filter: 'bandpass', delay: i * 0.075 });
    }
  },
  heal: (v) => {
    chime(v, [392, 494, 587], 0.12, 0.45, 0.035);
    v.tone(196, 0.7, 0.025, { attack: 0.05 });
  },
  mine: pickHit,
  wood: axeHit,
  splash: (v) => {
    v.noise(0.3, 0.065, { freq: 1800, to: 600, filter: 'bandpass', q: 0.7, attack: 0.02 });
    v.tone(420, 0.09, 0.02, { to: 160 });
  },
  ui: softClick,
  wolf: growl(170, 500),
  bear: growl(92, 380),
  boar: growl(130, 450),
  badger: growl(215, 700),
  lynx: growl(260, 900),
  lizard: (v) => {
    v.noise(0.35, 0.04, { freq: 3200, to: 1800, filter: 'bandpass', q: 1.5, attack: 0.05 });
    v.tone(330, 0.2, 0.015, { to: 240, type: 'triangle' });
  },
  deer: bleat(350),
  sheep: bleat(330),
  goat: bleat(450),
  rabbit: squeak(900),
  fox: squeak(700),
  cat: squeak(620),
  bird: (v) => {
    for (let i = 0; i < 3; i++) {
      const base = 1300 + i * 180;
      v.tone(base, 0.09, 0.022, { to: base * (i % 2 ? 0.9 : 1.35), delay: i * 0.16 });
    }
  },
  nest: (v) => {
    for (let i = 0; i < 4; i++) {
      v.tone(2100 + i * 120, 0.06, 0.016, { to: 2600, delay: i * 0.11 });
    }
  },
  peck: (v) => {
    v.tone(520, 0.055, 0.04, { to: 300, type: 'triangle' });
    v.tone(880, 0.04, 0.012, { to: 650, delay: 0.015 });
  },

  // ── internal: human voices, creature layers, ambience events, music drums ──
  'voice-hm': (v) => {
    v.tone(118, 0.22, 0.05, { glide: [[0.5, 128], [1, 105]], type: 'sawtooth', lowpass: 520, attack: 0.04 });
  },
  'voice-shout': (v) => {
    v.tone(165, 0.13, 0.06, { to: 185, type: 'sawtooth', lowpass: 1000, attack: 0.02 });
    v.tone(190, 0.3, 0.065, { to: 140, type: 'sawtooth', lowpass: 850, attack: 0.03, hold: 0.1, delay: 0.14 });
  },
  'voice-grunt': (v) => {
    v.tone(132, 0.17, 0.065, { to: 98, type: 'sawtooth', lowpass: 720, attack: 0.02 });
    v.noise(0.1, 0.012, { freq: 1200, filter: 'bandpass', attack: 0.02 });
  },
  'voice-hurt': (v) => {
    v.tone(205, 0.2, 0.06, { glide: [[0.25, 230], [1, 150]], type: 'sawtooth', lowpass: 1100, attack: 0.015 });
  },
  'voice-groan': (v) => {
    v.tone(150, 0.8, 0.055, { to: 78, type: 'sawtooth', lowpass: 640, attack: 0.05, hold: 0.2 });
    v.noise(0.6, 0.012, { freq: 700, attack: 0.1 });
  },
  hiss: (v) => {
    v.noise(0.42, 0.04, { freq: 4200, to: 2600, filter: 'bandpass', q: 1.8, attack: 0.07, hold: 0.12 });
    v.noise(0.3, 0.012, { freq: 7000, filter: 'highpass', attack: 0.07 });
  },
  'voice-gurgle': (v) => {
    for (let i = 0; i < 4; i++) {
      const base = v.rand(90, 150);
      v.tone(base, 0.11, 0.04, { to: base * 1.7, delay: i * 0.09 + v.rand(0, 0.03), attack: 0.02 });
    }
    v.noise(0.4, 0.02, { freq: 350, attack: 0.08 });
  },
  'amb-chirp': (v) => {
    const base = v.rand(1900, 3200);
    const count = 2 + Math.floor(v.rand(0, 4));
    for (let i = 0; i < count; i++) {
      v.tone(base * v.rand(0.92, 1.08), 0.07, 0.014, { to: base * v.rand(1.1, 1.4), delay: i * v.rand(0.09, 0.13), attack: 0.012 });
    }
  },
  'amb-owl': (v) => {
    v.tone(392, 0.28, 0.022, { to: 370, attack: 0.07, hold: 0.1 });
    v.tone(350, 0.6, 0.025, { to: 320, attack: 0.1, hold: 0.25, delay: 0.42 });
  },
  'amb-frog': (v) => {
    for (let i = 0; i < 2; i++) {
      v.tone(185, 0.13, 0.02, { to: 240, type: 'sawtooth', lowpass: 700, delay: i * 0.19, attack: 0.02 });
    }
  },
  'amb-crackle': (v) => {
    v.noise(0.03, 0.05, { freq: v.rand(1500, 4500), filter: 'bandpass', q: 2, attack: 0.002 });
  },
  'drum-low': (v) => {
    v.tone(82, 0.42, 0.14, { to: 44, attack: 0.006 });
    v.noise(0.12, 0.05, { freq: 260, attack: 0.005 });
  },
  'drum-tick': (v) => {
    v.tone(196, 0.09, 0.05, { to: 150, type: 'triangle', attack: 0.004 });
    v.noise(0.05, 0.03, { freq: 1100, filter: 'bandpass', q: 0.8, attack: 0.004 });
  },
};

const INTERNAL_PREFIX = /^(voice-|amb-|drum-|hiss$)/;

/** Public synthesised sound names (without internal helpers). */
export const SYNTH_NAMES = Object.keys(RECIPES).filter((name) => !INTERNAL_PREFIX.test(name));

/**
 * @param {string} name
 * @returns {boolean} true when a recipe exists (public or internal)
 */
export function hasSynth(name) {
  return Object.hasOwn(RECIPES, name);
}

/**
 * Schedule a synthesised sound.
 * @param {BaseAudioContext} ctx
 * @param {string} name recipe name
 * @param {AudioNode} out node to connect the sound to
 * @param {number} time context time to start at
 * @param {{pitch?:number, gain?:number}} [options]
 * @returns {number} context time when the sound has fully decayed (0 if the name is unknown)
 */
export function playSynth(ctx, name, out, time, options = {}) {
  const recipe = RECIPES[name];
  if (!recipe) return 0;
  const builder = createBuilder(ctx, out, time, options.pitch || 1, options.gain ?? 1);
  recipe(builder);
  return builder.endTime;
}

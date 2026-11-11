// Continuous ambience beds (wind, leaves, rain, water, crickets, fire, city crowd)
// and sparse random events (birds, owls, frogs, distant howls, thunder, fire crackle).
// Beds are synthesised from one shared noise buffer; every parameter change is a smooth ramp.

import { getNoiseBuffer, playSynth } from './synth.js';

const RAMP = 0.8;

/** Per-biome character: how windy, leafy, bird-rich etc. the place sounds (0 = absent). */
const BIOMES = {
  meadow: { wind: 0.8, leaves: 0.3, birds: 1, crickets: 1, owls: 0.3, frogs: 0, howls: 0.2, surf: 0 },
  farmland: { wind: 0.8, leaves: 0.2, birds: 0.9, crickets: 1, owls: 0.2, frogs: 0, howls: 0, surf: 0 },
  forest: { wind: 0.6, leaves: 1, birds: 1.3, crickets: 0.7, owls: 1, frogs: 0, howls: 0.6, surf: 0 },
  darkforest: { wind: 0.5, leaves: 1, birds: 0.4, crickets: 0.4, owls: 1.3, frogs: 0, howls: 1, surf: 0 },
  heath: { wind: 1.1, leaves: 0.2, birds: 0.5, crickets: 0.8, owls: 0.3, frogs: 0, howls: 0.6, surf: 0 },
  highland: { wind: 1.3, leaves: 0.1, birds: 0.4, crickets: 0.3, owls: 0.2, frogs: 0, howls: 0.8, surf: 0 },
  mountain: { wind: 1.5, leaves: 0, birds: 0.2, crickets: 0, owls: 0, frogs: 0, howls: 0.8, surf: 0 },
  snow: { wind: 1.7, leaves: 0, birds: 0.05, crickets: 0, owls: 0, frogs: 0, howls: 1, surf: 0 },
  steppe: { wind: 1.2, leaves: 0.1, birds: 0.4, crickets: 1.2, owls: 0.1, frogs: 0, howls: 0.7, surf: 0 },
  swamp: { wind: 0.5, leaves: 0.4, birds: 0.5, crickets: 0.9, owls: 0.5, frogs: 1, howls: 0.2, surf: 0 },
  lake: { wind: 0.9, leaves: 0.3, birds: 0.8, crickets: 0.7, owls: 0.3, frogs: 0.6, howls: 0.1, surf: 0.3 },
  coast: { wind: 1.2, leaves: 0.1, birds: 0.6, crickets: 0.3, owls: 0, frogs: 0, howls: 0, surf: 1 },
};

const DEFAULT_PARAMS = {
  biome: 'meadow',
  night: 0,
  rain: 0,
  wind: 0.2,
  cityDistance: Infinity,
  waterDistance: Infinity,
  fireDistance: Infinity,
  indoors: false,
};

function clamp01(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

/** 1 when closer than `near`, 0 beyond `far`, smooth in between. */
function proximity(distance, near, far) {
  if (!(distance < far)) return 0;
  if (distance <= near) return 1;
  const t = (far - distance) / (far - near);
  return t * t;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * @param {AudioContext} ctx
 * @param {AudioNode} output ambience bus
 * @param {(name:string, opts:object) => void} playOneShot plays a positional one-shot (samples or synth) through the sfx path
 * @returns {{set:(params:object)=>void, setCrowdBuffer:(buffer:AudioBuffer)=>void, update:(dt:number, listener:{x:number,z:number})=>void}}
 */
export function createAmbience(ctx, output, playOneShot) {
  const params = { ...DEFAULT_PARAMS };
  const noise = getNoiseBuffer(ctx);

  // Everything outdoors goes through one filter so stepping indoors muffles it all at once.
  const outdoorFilter = ctx.createBiquadFilter();
  outdoorFilter.type = 'lowpass';
  outdoorFilter.frequency.value = 18000;
  const outdoorGain = ctx.createGain();
  outdoorFilter.connect(outdoorGain).connect(output);

  /** Looping noise → filter chain → gain (silent until ramped up). */
  function noiseBed(filters, destination) {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    let tail = source;
    const nodes = filters.map(([type, frequency, q]) => {
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      tail.connect(filter);
      tail = filter;
      return filter;
    });
    const gain = ctx.createGain();
    gain.gain.value = 0;
    tail.connect(gain).connect(destination);
    source.start(0, Math.random() * 1.5);
    return { gain, filters: nodes };
  }

  /** Slow oscillator that modulates an AudioParam around its base value. */
  function lfo(frequency, depth, target) {
    const osc = ctx.createOscillator();
    const amount = ctx.createGain();
    osc.frequency.value = frequency;
    amount.gain.value = depth;
    osc.connect(amount).connect(target);
    osc.start();
    return amount;
  }

  // Wind: band-passed noise whose tone and loudness drift like gusts.
  const windGust = ctx.createGain();
  windGust.gain.value = 0.75;
  windGust.connect(outdoorFilter);
  lfo(0.13, 0.25, windGust.gain);
  const wind = noiseBed([['bandpass', 420, 0.6], ['lowpass', 1800, 0.3]], windGust);
  const windSweep = lfo(0.07, 120, wind.filters[0].frequency);

  const leaves = noiseBed([['highpass', 2600, 0.4], ['lowpass', 7000, 0.3]], windGust);
  const rain = noiseBed([['highpass', 900, 0.3], ['lowpass', 6500, 0.3]], outdoorFilter);
  const rainBody = noiseBed([['lowpass', 420, 0.4]], outdoorFilter);

  // Water: steady river hiss plus a slow swell that only the sea/lake uses.
  const water = noiseBed([['lowpass', 1100, 0.4], ['highpass', 180, 0.3]], outdoorFilter);
  const surfSwell = ctx.createGain();
  surfSwell.gain.value = 0.5;
  surfSwell.connect(outdoorFilter);
  lfo(0.1, 0.5, surfSwell.gain);
  const surf = noiseBed([['lowpass', 700, 0.5]], surfSwell);

  // Crickets: two high carriers chopped by a fast trill and a slow on/off pulse.
  const crickets = ctx.createGain();
  crickets.gain.value = 0;
  const trill = ctx.createGain();
  const pulse = ctx.createGain();
  trill.gain.value = 0.5;
  pulse.gain.value = 0.5;
  lfo(31, 0.5, trill.gain);
  lfo(0.8, 0.5, pulse.gain);
  for (const frequency of [4300, 4720]) {
    const carrier = ctx.createOscillator();
    carrier.frequency.value = frequency;
    carrier.connect(trill);
    carrier.start();
  }
  trill.connect(pulse).connect(crickets).connect(outdoorFilter);

  // Fire and crowd are "nearby" sources: they are not muffled by the indoor filter.
  const fire = noiseBed([['lowpass', 320, 0.5]], output);
  const crackleGain = ctx.createGain();
  crackleGain.gain.value = 0;
  crackleGain.connect(output);
  const crowdGain = ctx.createGain();
  crowdGain.gain.value = 0;
  const crowdFilter = ctx.createBiquadFilter();
  crowdFilter.type = 'lowpass';
  crowdFilter.frequency.value = 5000;
  crowdFilter.connect(crowdGain).connect(output);

  const timers = { bird: 3, owl: 12, frog: 6, howl: 50, thunder: 15, crackle: 0.2 };
  let fireLevel = 0;

  function ramp(param, value) {
    param.setTargetAtTime(value, ctx.currentTime, RAMP);
  }

  function apply() {
    const biome = BIOMES[params.biome] || BIOMES.meadow;
    const night = clamp01(params.night);
    const wet = clamp01(params.rain);
    const windy = clamp01(params.wind);
    const dry = 1 - wet;
    const indoors = Boolean(params.indoors);

    ramp(outdoorFilter.frequency, indoors ? 650 : 18000);
    ramp(outdoorGain.gain, indoors ? 0.45 : 1);

    ramp(wind.gain.gain, (0.012 + windy * 0.1) * biome.wind);
    ramp(wind.filters[0].frequency, 320 + windy * 520);
    ramp(windSweep.gain, 60 + windy * 160);
    ramp(leaves.gain.gain, windy * biome.leaves * 0.035);
    ramp(rain.gain.gain, wet * 0.075);
    ramp(rainBody.gain.gain, wet * 0.05);

    const nearWater = proximity(params.waterDistance, 4, 70);
    ramp(water.gain.gain, nearWater * (1 - biome.surf * 0.6) * 0.085);
    ramp(surf.gain.gain, nearWater * biome.surf * 0.16);
    ramp(crickets.gain,night * dry * biome.crickets * 0.011);

    fireLevel = proximity(params.fireDistance, 2, 18);
    ramp(fire.gain.gain, fireLevel * 0.07);
    ramp(crackleGain.gain, fireLevel);

    const crowd = proximity(params.cityDistance, 25, 150) * (1 - night * 0.8) * (1 - wet * 0.5);
    ramp(crowdGain.gain, crowd * (indoors ? 0.25 : 0.4));
    ramp(crowdFilter.frequency, indoors ? 900 : 5000);
  }

  /**
   * Update the ambience description; omitted fields keep their previous value.
   * @param {{biome?:string, night?:number, rain?:number, wind?:number, cityDistance?:number, waterDistance?:number, fireDistance?:number, indoors?:boolean}} next
   */
  function set(next) {
    if (!next) return;
    for (const key of Object.keys(DEFAULT_PARAMS)) {
      if (next[key] !== undefined) params[key] = next[key];
    }
    apply();
  }

  /** Hand over the decoded crowd loop once it is loaded. */
  function setCrowdBuffer(buffer) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(crowdFilter);
    source.start();
  }

  /** Play an event somewhere around the listener so it gets distance and pan for free. */
  function emitAround(listener, name, minDistance, maxDistance, volume) {
    const angle = Math.random() * Math.PI * 2;
    const distance = randomBetween(minDistance, maxDistance);
    playOneShot(name, {
      x: listener.x + Math.sin(angle) * distance,
      z: listener.z + Math.cos(angle) * distance,
      volume,
    });
  }

  /** Count a timer down; returns true (and re-arms it) when the event should fire. */
  function due(name, dt, rate, minSeconds, maxSeconds) {
    if (rate <= 0.02) return false;
    timers[name] -= dt * rate;
    if (timers[name] > 0) return false;
    timers[name] = randomBetween(minSeconds, maxSeconds);
    return true;
  }

  /**
   * Schedule random ambience events.
   * @param {number} dt seconds since the previous call
   * @param {{x:number, z:number}} listener
   */
  function update(dt, listener) {
    const biome = BIOMES[params.biome] || BIOMES.meadow;
    const night = clamp01(params.night);
    const wet = clamp01(params.rain);
    const outside = params.indoors ? 0 : 1;
    const calm = (1 - wet) * outside;

    if (due('bird', dt, (1 - night) * calm * biome.birds, 2.5, 8)) {
      const roll = Math.random();
      const name = roll < 0.25 ? 'bird' : roll < 0.4 ? 'nest' : 'amb-chirp';
      emitAround(listener, name, 10, 38, name === 'amb-chirp' ? 1 : 0.6);
    }
    if (due('owl', dt, (night > 0.6 ? 1 : 0) * calm * biome.owls, 16, 40)) {
      emitAround(listener, 'amb-owl', 18, 40, 1);
    }
    if (due('frog', dt, (night > 0.3 ? 1 : 0.2) * calm * biome.frogs, 3, 9)) {
      emitAround(listener, 'amb-frog', 8, 30, 1);
    }
    if (due('howl', dt, (night > 0.7 ? 1 : 0) * outside * biome.howls, 70, 160)) {
      emitAround(listener, 'howl-far', 20, 40, 1);
    }
    if (due('thunder', dt, wet > 0.75 ? 1 : 0, 25, 70)) {
      emitAround(listener, 'thunder', 0, 25, randomBetween(0.5, 1));
    }
    if (due('crackle', dt, fireLevel > 0.02 ? 1 : 0, 0.04, 0.3)) {
      playSynth(ctx, 'amb-crackle', crackleGain, ctx.currentTime + 0.01, { gain: randomBetween(0.4, 1) });
    }
  }

  apply();
  return { set, setCrowdBuffer, update };
}

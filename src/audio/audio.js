// Audio layer entry point: context + buses, sample loading, one-shots with voice limiting,
// creature voices, and delegation to music.js / ambience.js.
//
// Graph:  sfx ─┐
//         music ├─► master ─► limiter ─► output ─► destination
//      ambience ─┘

import { SYNTH_NAMES, hasSynth, playSynth } from './synth.js';
import { MUSIC_MOODS, createMusic } from './music.js';
import { createAmbience } from './ambience.js';

const MAX_VOICES = 16;
const VOICE_OVERFLOW = 6;
const FULL_VOLUME_DISTANCE = 6;
const SILENT_DISTANCE = 60;
const MAX_PAN = 0.8;
const DEFAULT_THROTTLE_MS = 60;
const MUSIC_TRIM = 1.5;
const AMBIENCE_TRIM = 0.8;
const CROWD_SAMPLE = 'market';

/** Decoded samples are normalised to these levels so files of very different loudness match. */
const SAMPLE_TARGET = { peak: 0.6, rms: 0.12, maxGain: 6 };
const CROWD_TARGET = { peak: 0.65, rms: 0.06, maxGain: 8 };

const ANIMAL_SAMPLES = ['wolf', 'bear', 'boar', 'deer', 'fox', 'badger', 'lynx', 'lizard', 'rabbit', 'sheep', 'goat', 'cat', 'bird', 'nest', 'peck'];
const EFFECT_SAMPLES = ['sword', 'bow', 'impact', 'shield', 'fire', 'ice', 'spark', 'heal', 'mine', 'wood', 'splash', 'ui'];
const SAMPLE_NAMES = [...EFFECT_SAMPLES, ...ANIMAL_SAMPLES];
const SAMPLE_SET = new Set(SAMPLE_NAMES);

/** Every name accepted by `play` (mp3 one-shots first, then synthesised sounds). */
export const SOUND_NAMES = [...SAMPLE_NAMES, ...SYNTH_NAMES.filter((name) => !SAMPLE_SET.has(name))];

/**
 * Per-sound mix: [volume, throttleMs, priority]. Priority 0 sounds are dropped first when voices run out.
 * For mp3 names the volume applies to the (normalised) sample; their synth fallback plays at its own level.
 * Combat samples sit at 0.2 of a 0.6 peak ≈ −12 dB under the music peaks.
 */
const MIX = {
  sword: [0.2, 70, 1], bow: [0.2, 70, 1], impact: [0.2, 70, 1], shield: [0.2, 70, 1],
  fire: [0.2, 90, 1], ice: [0.2, 90, 1], spark: [0.2, 90, 1], heal: [0.25, 120, 1],
  mine: [0.22, 90, 1], wood: [0.3, 90, 1], splash: [0.25, 120, 1], ui: [0.2, 50, 1],
  bird: [0.25, 300, 0], nest: [0.25, 300, 0], peck: [0.15, 150, 0],
  'step-grass': [1, 110, 0], 'step-stone': [1, 110, 0], 'step-wood': [1, 110, 0], 'step-water': [1.5, 110, 0],
  hover: [1.3, 40, 0], tab: [1.5, 40, 1], error: [1.2, 400, 1], open: [1.5, 60, 1], close: [1.5, 60, 1],
  coin: [1.5, 60, 1], buy: [1.5, 60, 1], sell: [1.5, 60, 1], equip: [1.5, 60, 1], jump: [1.5, 60, 1],
  drink: [1.4, 200, 1], bandage: [1.5, 200, 1], 'gather-herb': [1.4, 90, 1], 'arrow-fly': [2.2, 70, 1],
  swing: [1.2, 70, 1], 'hit-flesh': [1, 70, 1], 'hit-armor': [1, 70, 1], block: [1, 70, 1], crit: [1, 90, 2],
  death: [1, 200, 2], levelup: [1, 1000, 2], 'quest-start': [1, 500, 2], 'quest-done': [1, 500, 2],
  'wagon-creak': [1.5, 400, 0], horn: [1, 1500, 2], bell: [0.8, 300, 1], thunder: [1, 2000, 1], 'howl-far': [1, 3000, 0],
};
const ANIMAL_MIX = [0.24, 250, 1];
const DEFAULT_MIX = [1, DEFAULT_THROTTLE_MS, 1];

/** creature id → voice. `sound` is a sample; `layer` adds a synth layer; `human` uses synthesised grunts. */
const CREATURE_VOICES = {
  rabbit: { sound: 'rabbit' }, deer: { sound: 'deer' }, sheep: { sound: 'sheep' }, goat: { sound: 'goat' },
  fox: { sound: 'fox' }, badger: { sound: 'badger' }, boar: { sound: 'boar' }, wolf: { sound: 'wolf' },
  lynx: { sound: 'lynx' }, bear: { sound: 'bear' },
  alpha_wolf: { sound: 'wolf', pitch: 0.8, volume: 1.15 },
  frost_wolf: { sound: 'wolf', pitch: 1.2, highpass: 320 },
  thorn_boar: { sound: 'boar', pitch: 0.82 },
  elk: { sound: 'deer', pitch: 0.68, volume: 1.1 },
  shadow_cat: { sound: 'lynx', pitch: 0.78, lowpass: 2600 },
  lizard: { sound: 'lizard' },
  stoneback: { sound: 'lizard', pitch: 0.72, lowpass: 2200 },
  ridge_drake: { sound: 'lizard', pitch: 0.5, lowpass: 1800, volume: 1.25, layer: 'hiss', layerPitch: 0.6 },
  marsh_lurker: { sound: 'lizard', pitch: 0.6, lowpass: 1100, layer: 'voice-gurgle', layerPitch: 1 },
  giant_spider: { sound: 'lizard', pitch: 1.45, highpass: 1500, layer: 'hiss', layerPitch: 1 },
  spiderling: { sound: 'lizard', pitch: 1.9, highpass: 2200, volume: 0.7, layer: 'hiss', layerPitch: 1.4 },
  bandit_thug: { human: true, pitch: 1 }, bandit_archer: { human: true, pitch: 1.08 },
  bandit_brute: { human: true, pitch: 0.76, volume: 1.15 }, bandit_scout: { human: true, pitch: 1.16 },
  bandit_looter: { human: true, pitch: 1.04 }, deserter: { human: true, pitch: 0.94 },
  deserter_crossbow: { human: true, pitch: 0.98 }, bandit_chief_kosoy: { human: true, pitch: 0.86, volume: 1.15 },
  bandit_chief_sotnik: { human: true, pitch: 0.8, volume: 1.2 }, bandit_chief_raven: { human: true, pitch: 0.9, volume: 1.15 },
  guard: { human: true, pitch: 0.92 }, merc: { human: true, pitch: 0.97 },
};

/** Creature ids that `creature()` knows. */
export const CREATURE_IDS = Object.keys(CREATURE_VOICES);

/** How each kind of call reshapes the base voice. */
const CREATURE_KINDS = {
  idle: { volume: 0.55, pitch: 1, maxDuration: Infinity, throttleMs: 900, human: 'voice-hm' },
  aggro: { volume: 1, pitch: 0.96, maxDuration: Infinity, throttleMs: 400, human: 'voice-shout' },
  attack: { volume: 0.85, pitch: 1.1, maxDuration: 0.55, throttleMs: 220, human: 'voice-grunt' },
  hurt: { volume: 0.75, pitch: 1.28, maxDuration: 0.4, throttleMs: 180, human: 'voice-hurt' },
  death: { volume: 0.9, pitch: 0.78, maxDuration: Infinity, throttleMs: 300, human: 'voice-groan' },
};

const DEFAULT_SETTINGS = { musicVolume: 0.6, sfxVolume: 0.8, musicOn: true, sfxOn: true };

function noop() {}

function clamp01(value, fallback) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function assetUrl(name) {
  return new URL(`../../assets/audio/${name}.mp3`, import.meta.url).href;
}

/**
 * Scale a decoded buffer in place towards a target peak / RMS.
 * @returns {number} seconds of leading near-silence (below −20 dB of the peak) that playback can skip
 */
function normalise(buffer, target) {
  let peak = 0;
  let energy = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      const value = Math.abs(data[i]);
      if (value > peak) peak = value;
      energy += value * value;
    }
  }
  const rms = Math.sqrt(energy / Math.max(1, buffer.length * buffer.numberOfChannels));
  const gain = Math.min(target.maxGain, target.peak / Math.max(0.001, peak), target.rms / Math.max(0.001, rms));
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) data[i] *= gain;
  }
  const threshold = peak * gain * 0.1;
  let firstLoud = buffer.length;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    let index = 0;
    while (index < firstLoud && Math.abs(data[index]) < threshold) index++;
    firstLoud = index;
  }
  return Math.max(0, firstLoud / buffer.sampleRate - 0.012);
}

/** Fold the tail of a buffer into its head so it loops without a seam. */
function makeSeamless(ctx, source, seconds) {
  const overlap = Math.min(Math.floor(source.sampleRate * seconds), Math.floor(source.length / 4));
  const length = source.length - overlap;
  const result = ctx.createBuffer(source.numberOfChannels, length, source.sampleRate);
  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    const input = source.getChannelData(channel);
    const data = result.getChannelData(channel);
    data.set(input.subarray(overlap));
    for (let i = 0; i < overlap; i++) {
      const t = i / overlap;
      data[length - overlap + i] = input[source.length - overlap + i] * (1 - t) + input[i] * t;
    }
  }
  return result;
}

function createSilentAudio() {
  return {
    unlock: noop, setListener: noop, play: () => false, creature: () => false, setMusic: noop, setAmbience: noop,
    setVolumes: noop, suspend: noop, resume: noop, update: noop, inspect: () => null,
  };
}

/**
 * Create the game's audio system. Nothing is created or played until `unlock()` is called from a user gesture.
 * When Web Audio is unavailable every method is a harmless no-op.
 * @param {{musicVolume?:number, sfxVolume?:number, musicOn?:boolean, sfxOn?:boolean}} [settings]
 * @returns {{
 *   unlock:()=>void, setListener:(x:number,y:number,z:number,yaw:number)=>void,
 *   play:(name:string, opts?:object)=>boolean,
 *   creature:(creatureId:string, kind:'idle'|'aggro'|'attack'|'hurt'|'death', x?:number, z?:number)=>boolean,
 *   setMusic:(mood:string)=>void, setAmbience:(params:object)=>void, setVolumes:(volumes:object)=>void,
 *   suspend:()=>void, resume:()=>void, update:(dt:number)=>void, inspect:()=>object|null }}
 */
export function createAudio(settings = {}) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) return createSilentAudio();

  const volumes = { ...DEFAULT_SETTINGS };
  const listener = { x: 0, y: 0, z: 0, yaw: 0 };
  const buffers = new Map();
  const leadIn = new Map();
  const loading = new Map();
  const failed = new Set();
  const lastPlayed = new Map();
  let voices = [];
  let ctx = null;
  let master = null;
  let output = null;
  let sfxBus = null;
  let musicBus = null;
  let ambienceBus = null;
  let music = null;
  let ambience = null;
  let broken = false;
  let hidden = false;
  let wantedMood = 'none';
  let wantedAmbience = {};

  function applyVolumes() {
    if (!ctx) return;
    const now = ctx.currentTime;
    const sfx = volumes.sfxOn ? volumes.sfxVolume : 0;
    const tune = volumes.musicOn ? volumes.musicVolume * MUSIC_TRIM : 0;
    sfxBus.gain.setTargetAtTime(sfx, now, 0.06);
    ambienceBus.gain.setTargetAtTime(sfx * AMBIENCE_TRIM, now, 0.06);
    musicBus.gain.setTargetAtTime(tune, now, 0.15);
  }

  /** @param {{musicVolume?:number, sfxVolume?:number, musicOn?:boolean, sfxOn?:boolean}} next */
  function setVolumes(next) {
    if (!next) return;
    volumes.musicVolume = clamp01(next.musicVolume, volumes.musicVolume);
    volumes.sfxVolume = clamp01(next.sfxVolume, volumes.sfxVolume);
    if (typeof next.musicOn === 'boolean') volumes.musicOn = next.musicOn;
    if (typeof next.sfxOn === 'boolean') volumes.sfxOn = next.sfxOn;
    applyVolumes();
  }

  function loadSample(name) {
    if (loading.has(name)) return loading.get(name);
    const promise = fetch(assetUrl(name))
      .then((response) => {
        if (!response.ok) throw new Error(`Audio unavailable: ${name}`);
        return response.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => {
        const lead = normalise(buffer, name === CROWD_SAMPLE ? CROWD_TARGET : SAMPLE_TARGET);
        leadIn.set(name, lead);
        buffers.set(name, buffer);
        return buffer;
      })
      .catch(() => {
        failed.add(name);
        return null;
      });
    loading.set(name, promise);
    return promise;
  }

  /** Decode the small one-shots in the background, a few at a time, then the crowd loop. */
  function preloadSamples() {
    const queue = [...SAMPLE_NAMES];
    async function worker() {
      while (queue.length > 0) {
        await loadSample(queue.shift());
      }
    }
    Promise.all([worker(), worker(), worker()])
      .then(() => loadSample(CROWD_SAMPLE))
      .then((crowd) => {
        if (crowd) ambience.setCrowdBuffer(makeSeamless(ctx, crowd, 0.5));
      })
      .catch(noop);
  }

  function buildGraph() {
    ctx = new AudioContextClass({ latencyHint: 'interactive' });
    master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    output = ctx.createGain();
    output.gain.value = 0.85;
    master.connect(limiter).connect(output).connect(ctx.destination);
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    ambienceBus = ctx.createGain();
    sfxBus.gain.value = 0;
    musicBus.gain.value = 0;
    ambienceBus.gain.value = 0;
    sfxBus.connect(master);
    musicBus.connect(master);
    ambienceBus.connect(master);
    music = createMusic(ctx, musicBus, assetUrl);
    ambience = createAmbience(ctx, ambienceBus, play);
    applyVolumes();
    ambience.set(wantedAmbience);
    music.setMood(wantedMood);
    preloadSamples();
  }

  /** Call from a user gesture (click / key press). Safe to call repeatedly. */
  function unlock() {
    if (broken) return;
    try {
      if (!ctx) buildGraph();
      hidden = false;
      if (ctx.state !== 'running') ctx.resume().catch(noop);
    } catch (error) {
      console.warn('Звук недоступен:', error);
      broken = true;
      if (ctx) ctx.close().catch(noop);
      ctx = null;
    }
  }

  /** Listener position and heading (yaw = 0 looks at +z), call every frame. */
  function setListener(x, y, z, yaw) {
    listener.x = x;
    listener.y = y;
    listener.z = z;
    listener.yaw = yaw;
  }

  function releaseVoice(voice) {
    voice.gain.disconnect();
    if (voice.panner) voice.panner.disconnect();
  }

  function reapVoices(now) {
    if (voices.length === 0 || voices.every((voice) => voice.endTime > now)) return;
    const alive = [];
    for (const voice of voices) {
      if (voice.endTime > now) alive.push(voice);
      else releaseVoice(voice);
    }
    voices = alive;
  }

  /** Make room for a new voice; returns false when the new sound should be dropped instead. */
  function claimVoice(priority, now) {
    const active = voices.filter((voice) => !voice.stolen);
    if (active.length < MAX_VOICES) return true;
    if (priority <= 0 || voices.length >= MAX_VOICES + VOICE_OVERFLOW) return false;
    let victim = active[0];
    for (const voice of active) {
      if (voice.priority < victim.priority) victim = voice;
    }
    if (victim.priority > priority) return false;
    victim.stolen = true;
    victim.gain.gain.cancelScheduledValues(now);
    victim.gain.gain.setValueAtTime(victim.gain.gain.value, now);
    victim.gain.gain.linearRampToValueAtTime(0, now + 0.03);
    victim.endTime = now + 0.05;
    return true;
  }

  /** Distance attenuation and stereo pan of a world position relative to the listener. */
  function spatialise(x, z) {
    const dx = x - listener.x;
    const dz = z - listener.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= SILENT_DISTANCE) return { level: 0, pan: 0 };
    let level = 1;
    if (distance > FULL_VOLUME_DISTANCE) {
      const t = (SILENT_DISTANCE - distance) / (SILENT_DISTANCE - FULL_VOLUME_DISTANCE);
      level = t * t;
    }
    const rightX = -Math.cos(listener.yaw);
    const rightZ = Math.sin(listener.yaw);
    const side = (dx * rightX + dz * rightZ) / Math.max(distance, 2);
    return { level, pan: Math.max(-MAX_PAN, Math.min(MAX_PAN, side * MAX_PAN)) };
  }

  /** Schedule a decoded sample into `destination`; returns its end time. */
  function startSample(buffer, offset, destination, startTime, opts, pitch) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    let tail = source;
    for (const type of ['lowpass', 'highpass']) {
      if (!opts[type]) continue;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = opts[type];
      filter.Q.value = 0.4;
      tail.connect(filter);
      tail = filter;
    }
    tail.connect(destination);
    const duration = Math.min((buffer.duration - offset) / pitch, opts.maxDuration || Infinity);
    source.start(startTime, offset);
    source.stop(startTime + duration + 0.02);
    return startTime + duration;
  }

  /**
   * Play a one-shot.
   * @param {string} name one of `SOUND_NAMES`
   * @param {{x?:number, z?:number, volume?:number, pitch?:number, throttleMs?:number,
   *   lowpass?:number, highpass?:number, maxDuration?:number, throttleKey?:string}} [opts]
   *   `x`,`z` — world position (distance attenuation + pan); the last four are used by `creature()`.
   * @returns {boolean} true if a voice was started
   */
  function play(name, opts = {}) {
    if (!ctx || ctx.state !== 'running' || hidden || !volumes.sfxOn) return false;
    const isSample = SAMPLE_SET.has(name);
    if (!isSample && !hasSynth(name)) return false;
    const mix = MIX[name] || (isSample ? ANIMAL_MIX : DEFAULT_MIX);
    const now = ctx.currentTime;
    const throttleKey = opts.throttleKey || name;
    const throttleSeconds = (opts.throttleMs ?? mix[1]) / 1000;
    if (now - (lastPlayed.get(throttleKey) ?? -Infinity) < throttleSeconds) return false;

    const positional = Number.isFinite(opts.x) && Number.isFinite(opts.z);
    const place = positional ? spatialise(opts.x, opts.z) : { level: 1, pan: 0 };
    const buffer = isSample ? buffers.get(name) : null;
    const baseVolume = isSample && !buffer ? 1 : mix[0];
    const level = baseVolume * (opts.volume ?? 1) * place.level;
    if (level < 0.004) return false;

    reapVoices(now);
    if (!claimVoice(mix[2], now)) return false;
    lastPlayed.set(throttleKey, now);

    const gain = ctx.createGain();
    gain.gain.value = 0;
    let panner = null;
    if (positional && ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      panner.pan.value = place.pan;
      gain.connect(panner).connect(sfxBus);
    } else {
      gain.connect(sfxBus);
    }

    const startTime = now + 0.005;
    const pitch = (opts.pitch || 1) * (0.97 + Math.random() * 0.06);
    let endTime;
    if (buffer) {
      endTime = startSample(buffer, leadIn.get(name) || 0, gain, startTime, opts, pitch);
    } else {
      if (isSample && !failed.has(name)) loadSample(name);
      endTime = playSynth(ctx, name, gain, startTime, { pitch });
      if (opts.maxDuration) endTime = Math.min(endTime, startTime + opts.maxDuration);
    }
    // Trapezoid envelope on the whole voice: no clicks at the start, at a cut-off, or when stolen.
    const releaseStart = Math.max(startTime + 0.008, endTime - 0.04);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(level, startTime + 0.006);
    gain.gain.setValueAtTime(level, releaseStart);
    gain.gain.linearRampToValueAtTime(0, endTime);
    voices.push({ gain, panner, endTime: endTime + 0.03, priority: mix[2], stolen: false });
    return true;
  }

  /**
   * Voice of a creature at a world position.
   * @param {string} creatureId id from the creature catalogue
   * @param {'idle'|'aggro'|'attack'|'hurt'|'death'} kind
   * @param {number} [x]
   * @param {number} [z]
   * @returns {boolean} true if something was played
   */
  function creature(creatureId, kind, x, z) {
    const voice = CREATURE_VOICES[creatureId] || (SAMPLE_SET.has(creatureId) ? { sound: creatureId } : null);
    const shape = CREATURE_KINDS[kind];
    if (!voice || !shape) return false;
    const common = {
      x,
      z,
      volume: shape.volume * (voice.volume || 1),
      throttleMs: shape.throttleMs,
      throttleKey: `creature:${creatureId}:${kind}`,
    };
    if (voice.human) {
      return play(shape.human, { ...common, pitch: voice.pitch });
    }
    const played = play(voice.sound, {
      ...common,
      pitch: (voice.pitch || 1) * shape.pitch,
      lowpass: voice.lowpass,
      highpass: voice.highpass,
      maxDuration: Number.isFinite(shape.maxDuration) ? shape.maxDuration : undefined,
    });
    if (played && voice.layer && kind !== 'idle') {
      play(voice.layer, {
        ...common,
        volume: common.volume * 0.8,
        pitch: voice.layerPitch * shape.pitch,
        throttleKey: `${common.throttleKey}:layer`,
        maxDuration: Number.isFinite(shape.maxDuration) ? shape.maxDuration : undefined,
      });
    }
    return played;
  }

  /** @param {'menu'|'town'|'road'|'wild'|'combat'|'caravan'|'night'|'none'} mood crossfades over ~2.5 s */
  function setMusic(mood) {
    if (!MUSIC_MOODS.includes(mood)) return;
    wantedMood = mood;
    if (music) music.setMood(mood);
  }

  /**
   * Describe the surroundings; omitted fields keep their previous value.
   * @param {{biome?:string, night?:number, rain?:number, wind?:number, cityDistance?:number,
   *   waterDistance?:number, fireDistance?:number, indoors?:boolean}} params
   */
  function setAmbience(params) {
    if (!params) return;
    wantedAmbience = { ...wantedAmbience, ...params };
    if (ambience) ambience.set(params);
  }

  /** Tab hidden: fade out quickly and stop the audio clock. */
  function suspend() {
    hidden = true;
    if (!ctx) return;
    music.pause();
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
    setTimeout(() => {
      if (hidden && ctx) ctx.suspend().catch(noop);
    }, 90);
  }

  /** Tab shown again. */
  function resume() {
    hidden = false;
    if (!ctx) return;
    ctx.resume().catch(noop);
    master.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
    music.resume();
  }

  /** Per-frame upkeep. @param {number} dt seconds */
  function update(dt) {
    if (!ctx || hidden || ctx.state !== 'running') return;
    reapVoices(ctx.currentTime);
    music.update(dt);
    ambience.update(dt, listener);
  }

  /** Debug view for tools/preview-audio.html (null before `unlock`). */
  function inspect() {
    if (!ctx) return null;
    return {
      context: ctx,
      output,
      voices: voices.length,
      mood: music.getMood(),
      loaded: [...buffers.keys()],
      failed: [...failed],
    };
  }

  setVolumes(settings);
  return { unlock, setListener, play, creature, setMusic, setAmbience, setVolumes, suspend, resume, update, inspect };
}

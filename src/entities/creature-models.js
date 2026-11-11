// Entry point for everything alive that is not a hero or townsperson.
//
// Actor — the common interface of every model in src/entities:
//   group   THREE.Group, origin at the feet, model faces +z (yaw 0)
//   height, radius  metres (already scaled)
//   update(dt, { speed /* m/s ground speed */, airborne?, turn? /* rad/s */ })
//   play(action, duration?) -> { duration, strike } | null   one-shot overlay; unknown actions return null
//   setStance(name)   persistent pose: idle|combat|sit|sleep|work|guard|lean|dead|mounted|carry (unsupported → idle)
//   setLod(0|1|2)     1: detail geometry dropped, 2: stiff limbs, no shadows, half-rate animation
//   attach  sockets (THREE.Object3D): humanoids { handR, handL, back, head }, beasts { head, back, saddle? }
//   dispose()
import { createQuadruped, QUADRUPED_IDS } from './quadrupeds.js';
import { createLizard, LIZARD_IDS } from './lizards.js';
import { createSpider, SPIDER_IDS } from './spiders.js';
import { createBandit, HUMANOID_CREATURES } from './bandit-models.js';

/** Creature ids by rig archetype (mirrors the catalogue in CLAUDE.md). */
export const CREATURE_GROUPS = {
  quadruped: QUADRUPED_IDS,
  lizard: LIZARD_IDS,
  spider: SPIDER_IDS,
  humanoid: HUMANOID_CREATURES,
};

/**
 * Build any catalogued creature.
 * @param {string} creatureId pinned creature id (see CREATURE_GROUPS); unknown ids fall back to a wolf.
 * @param {{seed?:number, elite?:boolean, scale?:number}} [opts] elite: bigger, darker, amber eyes / accents.
 * @returns Actor
 */
export function createCreature(creatureId, opts = {}) {
  if (HUMANOID_CREATURES.includes(creatureId)) return createBandit(creatureId, opts);
  if (LIZARD_IDS.includes(creatureId)) return createLizard(creatureId, opts);
  if (SPIDER_IDS.includes(creatureId)) return createSpider(creatureId, opts);
  return createQuadruped(QUADRUPED_IDS.includes(creatureId) ? creatureId : 'wolf', opts);
}

/**
 * Rideable horse with saddle. The rider is parented to `actor.attach.saddle` and uses stance 'mounted'.
 * @param {{seed?:number}} [opts]
 */
export function createHorse(opts = {}) {
  const coats = [0x7a5234, 0x5a3c26, 0x9a7a52, 0x3a2e28, 0xb0a48c];
  const seed = (opts.seed ?? 1) >>> 0;
  const coat = coats[seed % coats.length];
  return createQuadruped('horse', { seed, col: { body: coat, belly: coat }, saddle: { blanket: [0x8e3b32, 0x3d5878, 0x4d6b45][seed % 3] } });
}

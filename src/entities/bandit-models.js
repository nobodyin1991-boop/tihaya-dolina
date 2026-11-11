// Humanoid enemies: bandits, deserters, the three chiefs, plus hired mercs. All share the humanoid rig.
import { PALETTE as P } from '../world/materials.js';
import { makeRng } from '../core/noise.js';
import { buildHumanoid } from './humanoid.js';
import { createHumanoidActor } from './humanoid-anim.js';
import { makeGear } from './gear-models.js';
import { tube, ball, slab, shade, mix } from './rig.js';
import { createNpc } from './npc-models.js';

const RAG = [0x5a4a38, 0x4e4436, 0x64503a, 0x3e3a32, 0x55483a];
const SKINS = [P.skin, P.skinTan, P.skinPale, P.skinDark];
const HAIRS = [P.hairBlack, P.hairBrown, P.hairRed, 0x3a2e24];
const FADED_BLUE = mix(P.guardBlue, 0x5a5a56, 0.55);
const DULL_MAIL = 0x5c5f62;
const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

function baseSpec(rng) {
  return {
    skin: pick(rng, SKINS), hair: pick(rng, HAIRS), hairStyle: pick(rng, ['short', 'crop', 'wild', 'bald', 'tail']),
    beard: pick(rng, ['stubble', 'short', 'none', 'full']), stern: true,
    scale: 0.98 + rng() * 0.07, bulk: 0.96 + rng() * 0.14,
    legs: { color: pick(rng, [0x3a342c, 0x40382e, 0x2e2c28]) },
    boots: { color: P.leatherDark, tall: rng() < 0.6 },
    belt: { color: P.leatherDark, buckle: P.iron, pouches: 1 + Math.floor(rng() * 2), sash: P.banditRed },
  };
}

const DEFS = {
  bandit_thug(s, rng) {
    const rag = pick(rng, RAG);
    Object.assign(s, { top: { kind: 'rags', color: rag, skirt: 0.2 }, sleeves: { kind: 'short', color: rag }, overlay: { kind: 'jerkin', color: P.leatherDark }, hat: { kind: 'bandana', color: P.banditRed }, bracers: { color: P.leatherDark }, pauldrons: { color: P.leather, side: -1, size: 0.9 } });
    return { main: rng() < 0.5 ? 'club' : 'axe', style: 'onehand' };
  },
  bandit_archer(s, rng) {
    Object.assign(s, { bulk: s.bulk * 0.92, top: { kind: 'rags', color: 0x4a4a36, skirt: 0.22 }, sleeves: { kind: 'long', color: 0x4a4436 }, hat: { kind: 'hood', color: 0x3c3a2e }, mask: P.banditRed, back: { kind: 'quiver', color: P.leatherDark }, bracers: { color: P.leatherDark }, overlay: { kind: 'vest', color: P.leatherDark } });
    return { main: 'bow', style: 'bow' };
  },
  bandit_brute(s) {
    Object.assign(s, {
      scale: 1.2, bulk: 1.34, shoulders: 1.16, belly: 0.04, hairStyle: 'bald', beard: 'full', sleeves: { kind: 'bare' },
      top: { kind: 'rags', color: 0x4e4436, skirt: 0.24 }, overlay: { kind: 'vest', color: P.leatherDark },
      pauldrons: { color: P.fur, fur: true, side: 1, size: 1.25, spike: true }, bracers: { color: P.iron, metal: 1 },
      strap: { color: P.leatherDark, cross: true }, scar: true,
    });
    s.belt = { ...s.belt, sash: P.banditRed };
    return { main: 'maul', style: 'maul' };
  },
  bandit_scout(s, rng) {
    Object.assign(s, { bulk: 0.88, shoulders: 0.95, scale: s.scale * 0.97, top: { kind: 'tunic', color: 0x3a3a34, skirt: 0.14 }, sleeves: { kind: 'long', color: 0x3a3a34 }, hat: { kind: 'hood', color: 0x2e2e2a }, mask: P.banditRed, cloak: { color: 0x34322c, length: 0.6 }, gloves: P.leatherDark, bracers: { color: P.leatherDark } });
    return { main: 'dagger', off: 'dagger', style: 'dual' };
  },
  bandit_looter(s, rng) {
    const rag = pick(rng, RAG);
    Object.assign(s, { top: { kind: 'rags', color: rag, skirt: 0.26 }, sleeves: { kind: 'long', color: shade(rag, 1.15) }, hat: { kind: 'cap', color: 0x4a3c30 }, mask: rng() < 0.5 ? P.banditRed : null, back: { kind: 'sack', color: P.canvas }, belly: 0.02 });
    s.belt = { ...s.belt, pouches: 4 };
    return { main: rng() < 0.5 ? 'club' : 'dagger', style: 'onehand' };
  },
  deserter(s) {
    Object.assign(s, {
      bulk: Math.max(s.bulk, 1.06), top: { kind: 'mail', color: DULL_MAIL, skirt: 0.16 }, sleeves: { kind: 'mail', color: DULL_MAIL },
      tabard: { color: FADED_BLUE, len: 0.3 }, hat: { kind: 'kettle', metal: 0x6f7478 }, pauldrons: { color: 0x6f7478, metal: 1, side: 1 }, gloves: P.leatherDark, hairStyle: 'crop',
    });
    return { main: 'sword', off: 'roundShield', style: 'shield', shield: { color: FADED_BLUE } };
  },
  deserter_crossbow(s) {
    Object.assign(s, { top: { kind: 'mail', color: DULL_MAIL, skirt: 0.14 }, sleeves: { kind: 'long', color: 0x4a4a44 }, tabard: { color: FADED_BLUE, len: 0.26 }, hat: { kind: 'coif', color: DULL_MAIL, metal: DULL_MAIL }, strap: { color: P.leatherDark }, gloves: P.leatherDark });
    return { main: 'crossbow', style: 'crossbow' };
  },
  bandit_chief_kosoy(s) {
    Object.assign(s, {
      scale: 1.17, bulk: 1.2, shoulders: 1.14, skin: P.skinTan, hair: P.hairRed, hairStyle: 'wild', beard: 'full', eyePatch: 1, scar: true,
      top: { kind: 'rags', color: 0x55402e, skirt: 0.28 }, sleeves: { kind: 'bare' }, overlay: { kind: 'jerkin', color: P.leatherDark },
      collar: { kind: 'fur', color: 0x6e5c48, big: true }, bracers: { color: P.iron, metal: 1 }, strap: { color: P.leatherDark, cross: true },
      back: { kind: 'trophies' }, boots: { color: P.leatherDark, tall: true },
    });
    s.belt = { color: P.leatherDark, buckle: P.bone, pouches: 2, sash: P.banditRed };
    s.extra = { pelvis: [ball(0.05, P.bone, [0.19, -0.1, 0.05], [0.9, 1.1, 1], { segs: 6, rings: 4 }), ball(0.045, P.bone, [-0.2, -0.12, 0.02], [0.9, 1.1, 1], { segs: 6, rings: 4 })] };
    return { main: 'axe', off: 'axe', style: 'dual' };
  },
  bandit_chief_sotnik(s) {
    const plate = 0x62676c;
    Object.assign(s, {
      scale: 1.19, bulk: 1.22, shoulders: 1.15, skin: P.skinPale, hair: P.hairGrey, hairStyle: 'crop', beard: 'short', scar: true,
      top: { kind: 'mail', color: DULL_MAIL, skirt: 0.12 }, sleeves: { kind: 'plate', color: plate }, gloves: plate,
      overlay: { kind: 'cuirass', color: plate, metal: 1, trim: P.bronze }, pauldrons: { color: plate, metal: 1, layers: true, size: 1.2, trim: P.bronze },
      greaves: { color: plate, thigh: true }, tassets: plate, mailSkirt: { color: 0x54585c, metal: 0.55, len: 0.22 },
      hat: { kind: 'fullhelm', metal: plate, crest: P.banditRed }, boots: { color: 0x3a3c40, tall: true, metal: 0.6 },
      back: { kind: 'banner', color: P.banditRed }, tabard: { color: shade(P.banditRed, 0.85), len: 0.34 },
    });
    s.belt = { color: P.leatherDark, buckle: P.bronze, pouches: 0, sash: null };
    return { main: 'sword', off: 'towerShield', style: 'shield', shield: { color: 0x4a4e54, emblemColor: P.banditRed, trim: P.bronze }, tier: 4 };
  },
  bandit_chief_raven(s) {
    const black = 0x1e1e24;
    Object.assign(s, {
      scale: 1.27, bulk: 0.96, shoulders: 1.08, skin: P.skinPale, hair: P.hairBlack, hairStyle: 'long', beard: 'none',
      top: { kind: 'robe', color: black, skirt: 0.5, trim: 0x3a3a48 }, sleeves: { kind: 'long', color: black }, gloves: P.clothBlack,
      hat: { kind: 'hood', color: black }, collar: { kind: 'feathers' }, bracers: { color: 0x34343c, metal: 0.6 },
      cloak: { color: 0x17171c, length: 1.15, segs: 2, feathers: true, width: 0.24, flare: 0.16 },
      legs: { color: 0x1a1a1e }, boots: { color: P.clothBlack, tall: true },
    });
    s.belt = { color: P.clothBlack, buckle: P.bone, pouches: 1, sash: shade(P.banditRed, 0.8) };
    const beak = tube([[0, 0.105, 0.085, 0.05, 0.045], [0, 0.085, 0.17, 0.028, 0.03], [0, 0.05, 0.26, 0.004, 0.005]], P.bone, { segs: 6, gradient: [0.8, 1.05] });
    const mask = ball(0.095, 0x2a2a30, [0, 0.105, 0.03], [1, 1, 0.95]);
    const lens = [slab(0.035, 0.03, 0.012, 0x8a2a22, [0.042, 0.137, 0.108]), slab(0.035, 0.03, 0.012, 0x8a2a22, [-0.042, 0.137, 0.108])];
    s.extra = { head: [mask, beak, lens] };
    return { main: 'glaive', style: 'polearm', tier: 5 };
  },
  merc(s, rng) {
    const col = pick(rng, [0x5d6a3c, 0x6a5a3c, 0x4a5a5a]);
    Object.assign(s, {
      bulk: Math.max(s.bulk, 1.05), top: { kind: 'tunic', color: col, skirt: 0.2 }, sleeves: { kind: 'long', color: col }, overlay: { kind: 'jerkin', color: P.leather },
      mailSkirt: { color: 0x6c7076, metal: 0.55, len: 0.14 }, pauldrons: { color: P.leather, size: 0.95 }, bracers: { color: P.leatherDark }, hat: { kind: 'bandana', color: P.clothGreen },
    });
    s.belt = { ...s.belt, sash: P.clothAmber };
    return { main: 'sword', off: 'roundShield', style: 'shield', shield: { color: P.wood }, tier: 2 };
  },
};

/** Ids handled by this module. */
export const HUMANOID_CREATURES = ['bandit_thug', 'bandit_archer', 'bandit_brute', 'bandit_scout', 'bandit_looter', 'deserter', 'deserter_crossbow',
  'bandit_chief_kosoy', 'bandit_chief_sotnik', 'bandit_chief_raven', 'guard', 'merc'];

/** Build a humanoid enemy / ally by creature id. opts: seed, elite, scale. */
export function createBandit(id, opts = {}) {
  if (id === 'guard') {
    const guard = createNpc({ role: 'guard', cityStyle: opts.cityStyle || 'timber', seed: opts.seed ?? 1, look: opts.scale ? { scale: opts.scale } : null });
    guard.creatureId = id;
    return guard;
  }
  const def = DEFS[id] || DEFS.bandit_thug;
  const rng = makeRng(((opts.seed ?? 1) >>> 0) * 40503 + id.length * 131);
  const s = baseSpec(rng);
  const out = def(s, rng);
  if (opts.elite) {
    s.scale *= 1.1;
    s.bulk *= 1.06;
    if (s.top) s.top = { ...s.top, color: shade(s.top.color, 0.72) };
    s.belt = { ...s.belt, sash: P.amber };
    s.eyes = 0xd88a20;
    if (!s.pauldrons) s.pauldrons = { color: 0x3a3a3e, metal: 0.6, size: 1.05, spike: true };
  }
  if (opts.scale) s.scale *= opts.scale;
  const model = buildHumanoid(s);
  const tier = out.tier || 1;
  const main = makeGear(out.main, { tier });
  let ikMesh = null;
  let onAux = null;
  if (out.main === 'bow') {
    model.sockets.handL.add(main);
    ikMesh = main;
    onAux = a => main.userData.setDraw(Math.max(0, Math.min(1, a)));
  } else {
    model.sockets.handR.add(main);
    if (main.userData.gripL) ikMesh = main;
  }
  let off = null;
  if (out.off) {
    off = makeGear(out.off, { tier, ...(out.shield || {}) });
    (out.style === 'shield' ? model.sockets.shieldL : model.sockets.handL).add(off);
  }
  const actor = createHumanoidActor(model, { style: out.style, ikMesh, onAux, seed: opts.seed ?? 1 });
  actor.creatureId = id;
  actor.gear = { main, off };
  return actor;
}

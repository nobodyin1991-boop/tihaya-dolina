// Townsfolk: named role NPCs (NPC_ROLES), generic citizens, guards, workers and children.
// Outfit = role, variation = seed (height, build, skin, hair, beard, colours, gender, age), tint = city style.
import { PALETTE as P } from '../world/materials.js';
import { makeRng } from '../core/noise.js';
import { buildHumanoid } from './humanoid.js';
import { createHumanoidActor } from './humanoid-anim.js';
import { makeGear } from './gear-models.js';
import { shade, mix } from './rig.js';

const CITY = {
  timber: { cloth: [P.clothBrown, P.clothGreen, 0x8a7a5a, 0x7a6a4a, 0x9a8a62, 0x6f5a3a], accent: P.clothRed, linen: P.clothCream, legs: [0x4a3e2c, 0x5a4a34, 0x3e382c], emblem: P.wheat, rich: P.clothGreen },
  stone: { cloth: [0x5f6468, 0x4a5560, 0x6a5a4a, 0x55504a, 0x3e4046, 0x6d5f52], accent: P.clothBlue, linen: 0xb9b5a6, legs: [0x36383c, 0x403a34, 0x2e3034], emblem: P.stoneLight, rich: P.slate },
  harbor: { cloth: [P.clothBlue, 0x2f6f86, P.clothPurple, P.clothRed, 0xa8744e, 0x4f7a6a], accent: P.clothAmber, linen: P.clothCream, legs: [0x3a3a44, 0x4a4034, 0x2e3440], emblem: P.amber, rich: P.clothPurple },
};
const SKINS = [P.skin, P.skin, P.skinPale, P.skinPale, P.skinTan, P.skinDark];
const HAIRS = [P.hairBrown, P.hairBrown, P.hairBlack, P.hairBlond, P.hairRed, 0x6e4a2c];

const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

/** Role → outfit. Receives base spec `s`, city palette `c`, rng; returns { gear?, off?, style?, stance? }. */
const ROLES = {
  smith(s, c) {
    Object.assign(s, { bulk: Math.max(s.bulk, 1.15), shoulders: 1.12, apron: P.leatherDark, apronLen: 0.5, bracers: { color: P.leatherDark }, gloves: P.leatherDark });
    s.top = { kind: 'shirt', color: mix(c.cloth[2], 0x3a3632, 0.4), skirt: 0 };
    s.sleeves = { kind: 'bare' };
    s.hat = { kind: 'bandana', color: 0x3a3632 };
    return { gear: 'hammer', style: 'onehand', stance: 'work' };
  },
  weaponsmith(s, c) {
    Object.assign(s, { bulk: Math.max(s.bulk, 1.1), apron: 0x3a3028, apronLen: 0.46, bracers: { color: P.iron, metal: 1 }, strap: { color: P.leatherDark } });
    s.top = { kind: 'shirt', color: c.cloth[1], skirt: 0 };
    s.sleeves = { kind: 'short', color: c.cloth[1] };
    return { gear: 'hammer', style: 'onehand', stance: 'work' };
  },
  armorer(s, c) {
    Object.assign(s, { bulk: Math.max(s.bulk, 1.1), apron: P.leather, apronLen: 0.46, pauldrons: { color: P.steel, metal: 1, side: 1, layers: true }, bracers: { color: P.steel, metal: 1 } });
    s.top = { kind: 'shirt', color: c.cloth[0], skirt: 0 };
    s.sleeves = { kind: 'short', color: c.cloth[0] };
    s.hat = { kind: 'coif', color: P.leather };
    return { gear: 'hammer', style: 'onehand', stance: 'work' };
  },
  apothecary(s, c) {
    const col = mix(c.rich, P.clothGreen, 0.5);
    s.top = { kind: 'robe', color: col, skirt: 0.58, trim: c.accent };
    s.sleeves = { kind: 'long', color: col, cuff: c.linen };
    Object.assign(s, { strap: { color: P.leather, vials: true }, hat: { kind: s.female ? 'scarf' : 'cap', color: c.linen }, collar: { kind: 'cowl', color: shade(col, 0.85) } });
    s.belt = { ...s.belt, pouches: 3, satchel: P.leather };
    return {};
  },
  innkeeper(s, c) {
    Object.assign(s, { belly: 0.045, bulk: Math.max(s.bulk, 1.08), apron: c.linen, apronLen: 0.5 });
    s.top = { kind: 'shirt', color: c.cloth[0], skirt: 0.1 };
    s.sleeves = { kind: 'short', color: c.linen };
    if (!s.female) s.beard = 'mustache';
    return { gear: 'mug' };
  },
  captain(s, c) {
    Object.assign(s, {
      bulk: Math.max(s.bulk, 1.1), shoulders: 1.12, stern: true,
      overlay: { kind: 'cuirass', color: P.steel, metal: 1, trim: P.gold },
      pauldrons: { color: P.steel, metal: 1, layers: true, trim: P.gold, size: 1.08 },
      bracers: { color: P.steel, metal: 1 }, greaves: { color: P.steel },
      cloak: { color: P.guardBlue, length: 0.98 }, mailSkirt: { color: 0x6c7076, metal: 0.55, len: 0.2 },
      hat: null, hairStyle: s.female ? 'tail' : 'crop',
    });
    s.top = { kind: 'mail', color: 0x6c7076, skirt: 0 };
    s.sleeves = { kind: 'mail', color: 0x6c7076 };
    s.boots = { color: P.leatherDark, tall: true };
    s.belt = { ...s.belt, sash: c.emblem };
    return { gear: 'sword', style: 'onehand' };
  },
  elder(s, c, rng) {
    const col = shade(c.rich, 0.9);
    s.top = { kind: 'robe', color: col, skirt: 0.64, trim: P.gold };
    s.sleeves = { kind: 'long', color: col, cuff: P.gold };
    Object.assign(s, { chain: P.gold, collar: { kind: 'fur', color: 0xc9c2b0 }, hair: P.hairGrey, hairStyle: s.female ? 'bun' : 'balding', bulk: s.bulk * 0.96 });
    if (!s.female) s.beard = 'full';
    s.hat = rng() < 0.5 ? { kind: 'circlet', color: P.gold } : null;
    return { gear: 'staff' };
  },
  quartermaster(s, c) {
    const col = c.cloth[3];
    s.top = { kind: 'coat', color: col, skirt: 0.36, trim: c.accent };
    s.sleeves = { kind: 'long', color: col, cuff: P.leatherDark };
    Object.assign(s, { hat: { kind: 'cap', color: shade(col, 0.7) }, strap: { color: P.leatherDark }, collar: { kind: 'high', color: shade(col, 0.8) } });
    s.belt = { ...s.belt, pouches: 2, satchel: P.leather };
    return { gear: 'ledger', hand: 'L' };
  },
  stablemaster(s, c) {
    s.top = { kind: 'shirt', color: c.linen, skirt: 0.12 };
    s.sleeves = { kind: 'short', color: c.linen };
    Object.assign(s, { overlay: { kind: 'vest', color: P.leather }, hat: { kind: 'straw', color: c.accent }, bracers: { color: P.leatherDark } });
    s.boots = { color: P.leatherDark, tall: true };
    return { gear: 'pitchfork', style: 'polearm' };
  },
  trainer(s, c) {
    Object.assign(s, {
      bulk: Math.max(s.bulk, 1.08), shoulders: 1.1, stern: true, scar: true,
      overlay: { kind: 'jerkin', color: P.leather }, bracers: { color: P.leatherDark }, pauldrons: { color: P.leatherDark, side: 1, size: 0.95 },
      hat: { kind: 'bandana', color: c.accent },
    });
    s.top = { kind: 'tunic', color: c.cloth[4], skirt: 0.2 };
    s.sleeves = { kind: 'short', color: c.cloth[4] };
    return { gear: 'sword', style: 'onehand' };
  },
  grocer(s, c) {
    Object.assign(s, { apron: P.clothGreen, apronLen: 0.42, belly: 0.02, hat: { kind: 'cap', color: c.cloth[2] } });
    s.top = { kind: 'shirt', color: c.linen, skirt: 0.1 };
    s.belt = { ...s.belt, pouches: 3 };
    return {};
  },
  trader(s, c) {
    const col = c.rich;
    s.top = { kind: 'coat', color: col, skirt: 0.5, trim: P.gold };
    s.sleeves = { kind: 'long', color: col, cuff: P.gold };
    Object.assign(s, { belly: 0.035, collar: { kind: 'fur', color: P.fur }, hat: { kind: 'widebrim', color: shade(col, 0.6), trim: P.gold, feather: c.accent }, chain: null });
    s.belt = { ...s.belt, sash: c.accent, buckle: P.gold, pouches: 2 };
    s.boots = { color: P.leatherDark, tall: true };
    if (!s.female) s.beard = 'goatee';
    return {};
  },
  banker(s, c) {
    const col = 0x2e2c30;
    s.top = { kind: 'coat', color: col, skirt: 0.46, trim: P.gold };
    s.sleeves = { kind: 'long', color: col, cuff: c.linen };
    Object.assign(s, { collar: { kind: 'high', color: c.linen }, chain: P.gold, hat: { kind: 'cap', color: col }, bulk: s.bulk * 0.95 });
    s.belt = { ...s.belt, pouches: 2, buckle: P.gold };
    return { gear: 'ledger', hand: 'L' };
  },
  carpenter(s, c) {
    Object.assign(s, { apron: P.woodLight, apronLen: 0.4, hat: { kind: 'cap', color: P.clothBrown } });
    s.top = { kind: 'shirt', color: c.cloth[0], skirt: 0 };
    s.sleeves = { kind: 'short', color: c.cloth[0] };
    s.belt = { ...s.belt, tools: true, pouches: 1 };
    return { gear: 'hammer', style: 'onehand', stance: 'work' };
  },
  leatherworker(s, c) {
    Object.assign(s, { overlay: { kind: 'jerkin', color: P.leather }, apron: P.leatherDark, apronLen: 0.36, bracers: { color: P.leather } });
    s.top = { kind: 'shirt', color: c.cloth[2], skirt: 0 };
    s.belt = { ...s.belt, pouches: 2 };
    return { gear: 'knife', style: 'onehand' };
  },
  farmer(s, c) {
    s.top = { kind: 'tunic', color: c.linen, skirt: 0.28 };
    s.sleeves = { kind: 'short', color: c.linen };
    Object.assign(s, { hat: { kind: 'straw', color: c.accent }, strap: { color: P.clothBrown } });
    s.boots = { color: P.leather, tall: false };
    return { gear: 'hoe', style: 'polearm' };
  },
  tailor(s, c) {
    s.top = { kind: 'shirt', color: c.linen, skirt: 0.06 };
    s.sleeves = { kind: 'long', color: c.linen, cuff: c.accent };
    Object.assign(s, { overlay: { kind: 'vest', color: c.rich }, strap: { color: 0xe6d9a8, tilt: 0.5 }, bulk: s.bulk * 0.94 });
    s.belt = { ...s.belt, sash: c.accent, pouches: 1 };
    if (s.female) s.hat = { kind: 'scarf', color: c.accent };
    return {};
  },
  mason(s, c) {
    Object.assign(s, { bulk: Math.max(s.bulk, 1.12), apron: 0x8d897c, apronLen: 0.44, hat: { kind: 'coif', color: 0xb9b5a6 }, gloves: P.leatherDark });
    s.top = { kind: 'shirt', color: 0x8a8578, skirt: 0 };
    s.sleeves = { kind: 'short', color: 0x8a8578 };
    return { gear: 'hammer', style: 'onehand', stance: 'work' };
  },
  citizen(s, c, rng) {
    const col = pick(rng, c.cloth);
    s.top = { kind: 'tunic', color: col, skirt: s.female ? 0.5 + rng() * 0.12 : 0.18 + rng() * 0.14, trim: rng() < 0.3 ? c.accent : null };
    s.sleeves = { kind: rng() < 0.4 ? 'short' : 'long', color: rng() < 0.5 ? col : c.linen };
    const r = rng();
    if (r < 0.2) s.overlay = { kind: 'vest', color: pick(rng, c.cloth) };
    else if (r < 0.35) s.apron = c.linen;
    else if (r < 0.5) s.cloak = { color: shade(pick(rng, c.cloth), 0.8), length: 0.8 };
    const h = rng();
    if (h < 0.18) s.hat = { kind: 'cap', color: pick(rng, c.cloth) };
    else if (h < 0.3) s.hat = { kind: s.female ? 'scarf' : 'straw', color: c.accent };
    else if (h < 0.38) s.hat = { kind: 'hood', color: shade(col, 0.8) };
    s.belt = { ...s.belt, pouches: Math.floor(rng() * 3), sash: rng() < 0.2 ? c.accent : null };
    return {};
  },
  merchant(s, c, rng) {
    ROLES.trader(s, c, rng);
    s.collar = null;
    s.belly = 0.015;
    return {};
  },
  guard(s, c, rng) {
    Object.assign(s, {
      bulk: Math.max(s.bulk, 1.06), tabard: { color: P.guardBlue, emblem: c.emblem, len: 0.38 },
      hat: { kind: 'kettle', metal: P.steel }, pauldrons: { color: P.steel, metal: 1, size: 0.95 }, bracers: { color: P.leatherDark }, gloves: P.leatherDark,
      hairStyle: 'crop', female: false,
    });
    s.top = { kind: 'mail', color: 0x6c7076, skirt: 0.16 };
    s.sleeves = { kind: 'mail', color: 0x6c7076 };
    s.boots = { color: P.leatherDark, tall: true };
    return { gear: rng() < 0.6 ? 'halberd' : 'spear', style: 'polearm', stance: 'guard' };
  },
  hunter(s, c) {
    Object.assign(s, { hat: { kind: 'hood', color: 0x4f5a3a }, overlay: { kind: 'jerkin', color: P.leather }, back: { kind: 'quiver', color: P.leatherDark }, bracers: { color: P.leatherDark }, collar: { kind: 'fur', color: P.fur } });
    s.top = { kind: 'tunic', color: 0x5d6a3c, skirt: 0.2 };
    s.boots = { color: P.leather, tall: true };
    return { gear: 'bow', style: 'bow' };
  },
  miner(s, c) {
    Object.assign(s, { bulk: Math.max(s.bulk, 1.1), hat: { kind: 'coif', color: P.leatherDark }, strap: { color: P.leatherDark }, gloves: P.leatherDark });
    s.top = { kind: 'rags', color: 0x55504a, skirt: 0.12 };
    s.sleeves = { kind: 'short', color: 0x55504a };
    s.skin = mix(s.skin, 0x4a4540, 0.18);
    return { gear: 'pick', style: 'greatsword' };
  },
  fisher(s, c) {
    Object.assign(s, { hat: { kind: 'straw', color: P.clothBlue }, overlay: { kind: 'vest', color: 0x4a5a6a } });
    s.top = { kind: 'shirt', color: c.linen, skirt: 0.08 };
    s.sleeves = { kind: 'short', color: c.linen };
    s.legs = { color: 0x55606a };
    s.boots = { color: P.leatherDark, tall: true };
    return { gear: 'rod' };
  },
  child(s, c, rng) {
    ROLES.citizen(s, c, rng);
    Object.assign(s, { scale: 0.6 + rng() * 0.1, headScale: 1.34, bulk: 0.92, shoulders: 0.9, beard: 'none', cloak: null, overlay: null, hat: rng() < 0.3 ? { kind: 'cap', color: c.accent } : null });
    s.hair = pick(rng, HAIRS);
    s.hairStyle = s.female ? pick(rng, ['braids', 'bob', 'tail']) : pick(rng, ['short', 'wild']);
    return {};
  },
};

/** All roles the preview lines up: the 18 named roles + generic townsfolk. */
export const NPC_PREVIEW_ROLES = ['quartermaster', 'elder', 'captain', 'innkeeper', 'stablemaster', 'trainer', 'weaponsmith', 'armorer', 'grocer', 'trader', 'banker',
  'apothecary', 'smith', 'carpenter', 'leatherworker', 'farmer', 'tailor', 'mason', 'citizen', 'citizen', 'guard', 'hunter', 'miner', 'fisher', 'child', 'child', 'merchant'];

const FEMALE_CHANCE = { smith: 0.1, mason: 0.05, captain: 0.25, tailor: 0.7, apothecary: 0.6, innkeeper: 0.45, grocer: 0.5, citizen: 0.5, child: 0.5, miner: 0.05, guard: 0 };

/**
 * Build a townsperson.
 * @param {{role:string, cityStyle?:'timber'|'stone'|'harbor', seed?:number, gender?:'m'|'f', age?:'young'|'adult'|'old', look?:object}} opts
 *        role: any of NPC_ROLES or 'citizen'|'guard'|'farmer'|'hunter'|'miner'|'fisher'|'child'|'merchant'.
 * @returns Actor; `actor.defaultStance` suggests a fitting stance ('work' for smiths, 'guard' for guards …).
 */
export function createNpc(opts = {}) {
  const role = ROLES[opts.role] ? opts.role : 'citizen';
  const c = CITY[opts.cityStyle] || CITY.timber;
  const seed = (opts.seed ?? 1) >>> 0;
  const rng = makeRng(seed * 2654435761 + role.length * 97);
  const female = opts.gender ? opts.gender === 'f' : rng() < (FEMALE_CHANCE[role] ?? 0.35);
  const ageRoll = rng();
  const age = opts.age || (role === 'elder' ? 'old' : ageRoll < 0.2 ? 'young' : ageRoll < 0.8 ? 'adult' : 'old');
  const s = {
    female,
    scale: (female ? 0.94 : 1) * (0.96 + rng() * 0.09),
    bulk: (female ? 0.9 : 1) * (0.92 + rng() * 0.2),
    shoulders: female ? 0.9 : 0.97 + rng() * 0.1,
    skin: pick(rng, SKINS),
    hair: age === 'old' ? (rng() < 0.75 ? P.hairGrey : 0xcfcabb) : pick(rng, HAIRS),
    hairStyle: female ? pick(rng, ['long', 'bun', 'tail', 'bob', 'braids']) : pick(rng, ['short', 'short', 'crop', 'balding', 'tail', 'bald']),
    beard: female ? 'none' : pick(rng, age === 'young' ? ['none', 'none', 'stubble'] : ['none', 'stubble', 'short', 'full', 'mustache', 'goatee']),
    legs: { color: pick(rng, c.legs) },
    boots: { color: rng() < 0.5 ? P.leatherDark : P.leather, tall: rng() < 0.4 },
    belt: { color: P.leatherDark, buckle: P.bronze, pouches: 0 },
  };
  const out = ROLES[role](s, c, rng) || {};
  Object.assign(s, opts.look || {});
  const model = buildHumanoid(s);
  let ikMesh = null;
  let gear = null;
  let onAux = null;
  if (out.gear) {
    gear = makeGear(out.gear, { tier: 2 });
    if (out.gear === 'bow') {
      model.sockets.handL.add(gear);
      ikMesh = gear;
      onAux = a => gear.userData.setDraw(Math.max(0, Math.min(1, a)));
    } else {
      (out.hand === 'L' ? model.sockets.handL : model.sockets.handR).add(gear);
      if (gear.userData.gripL) ikMesh = gear;
    }
  }
  const actor = createHumanoidActor(model, { style: out.style || 'unarmed', ikMesh, onAux, seed });
  actor.role = role;
  actor.defaultStance = out.stance || 'idle';
  actor.gear = { main: gear, off: null };
  return actor;
}

// The seven playable classes. Each is a humanoid spec (silhouette + palette) plus class gear and an animation style.
import { PALETTE as P } from '../world/materials.js';
import { buildHumanoid } from './humanoid.js';
import { createHumanoidActor } from './humanoid-anim.js';
import { makeGear, tierMetal, tierTrim } from './gear-models.js';
import { shade, mix } from './rig.js';

/** Armour pieces by weight class and tier (1..6): cloth/leather → mail → plate accents. */
function armourFor(weight, tier, base) {
  const metal = tierMetal(tier);
  const trim = tierTrim(tier);
  const out = {};
  const lvl = tier >= 5 ? 2 : tier >= 3 ? 1 : 0;
  if (weight === 'heavy') {
    out.pauldrons = { color: lvl ? metal : P.leather, metal: lvl ? 1 : 0, size: 1.05 + lvl * 0.08, layers: lvl > 0, trim: lvl === 2 ? trim : null };
    out.bracers = { color: lvl ? metal : P.leatherDark, metal: lvl ? 1 : 0 };
    out.mailSkirt = { color: lvl ? shade(metal, 0.8) : P.leatherDark, metal: lvl ? 0.55 : 0, len: 0.2 };
    if (lvl >= 1) out.greaves = { color: metal, thigh: lvl === 2 };
    if (lvl === 2) out.overlay = { kind: 'cuirass', color: metal, metal: 1, trim };
    else if (lvl === 1) out.overlay = { kind: 'jerkin', color: shade(metal, 0.82), metal: 0.55 };
    else out.overlay = { kind: 'jerkin', color: P.leather };
  } else if (weight === 'medium') {
    out.pauldrons = { color: lvl === 2 ? metal : P.leather, metal: lvl === 2 ? 1 : 0, size: 0.95, trim: lvl === 2 ? trim : null };
    out.bracers = { color: lvl ? P.leather : P.leatherDark, metal: 0 };
    out.overlay = { kind: lvl ? 'jerkin' : 'vest', color: lvl === 2 ? shade(base, 0.7) : P.leather };
    if (lvl >= 1) out.mailSkirt = { color: shade(metal, 0.8), metal: 0.55, len: 0.14 };
  } else {
    if (lvl >= 1) out.bracers = { color: P.leather, metal: 0 };
    if (lvl === 2) out.pauldrons = { color: P.leather, size: 0.85, trim };
  }
  return out;
}

const CLASSES = {
  warrior(g) {
    const t = g.tier;
    return {
      style: 'greatsword', weapon: 'greatsword', weight: 'heavy',
      spec: {
        bulk: 1.16, shoulders: 1.16, hair: P.hairBrown, hairStyle: 'short', beard: 'short', stern: true,
        top: { kind: 'tunic', color: P.clothRed, skirt: 0.26, trim: t >= 5 ? P.gold : null },
        sleeves: { kind: 'short', color: P.clothRed },
        legs: { color: 0x3c332b }, boots: { color: P.leatherDark, tall: true },
        belt: { color: P.leatherDark, buckle: tierTrim(t), pouches: 1 },
        collar: { kind: 'fur', color: P.fur },
      },
    };
  },
  guardian(g) {
    const t = g.tier;
    return {
      style: 'shield', weapon: 'sword', off: 'kiteShield', weight: 'heavy',
      spec: {
        bulk: 1.12, shoulders: 1.1, hair: P.hairBlond, hairStyle: 'crop', beard: 'stubble',
        hat: { kind: t >= 3 ? 'nasal' : 'coif', metal: tierMetal(t), color: 0x6c7076, trim: tierTrim(t) },
        top: { kind: 'mail', color: 0x6c7076, skirt: 0.2 },
        sleeves: { kind: 'mail', color: 0x6c7076 }, gloves: P.leatherDark,
        tabard: { color: P.guardBlue, emblem: P.gold, len: 0.4 },
        legs: { color: 0x34383f }, boots: { color: P.leatherDark, tall: true },
        belt: { color: P.leather, buckle: tierTrim(t) },
      },
      shield: { color: P.guardBlue, emblemColor: P.gold },
    };
  },
  scientist(g) {
    const coat = 0x2c5560;
    return {
      style: 'device', weapon: 'emitter', weight: 'light',
      spec: {
        bulk: 0.9, shoulders: 0.94, hair: P.hairGrey, hairStyle: 'balding', beard: 'goatee',
        hat: { kind: 'goggles' },
        top: { kind: 'coat', color: coat, skirt: 0.52, trim: P.clothAmber },
        sleeves: { kind: 'long', color: coat, cuff: P.clothAmber }, gloves: P.leatherDark,
        collar: { kind: 'high', color: shade(coat, 0.8) },
        legs: { color: 0x2a2c30 }, boots: { color: P.leatherDark, tall: true },
        belt: { color: P.leather, buckle: P.copper, pouches: 2, satchel: P.leather },
        strap: { color: P.leather, vials: true },
      },
    };
  },
  duelist(g) {
    return {
      style: 'dual', weapon: 'blade', off: 'blade', weight: 'light',
      spec: {
        bulk: 0.92, shoulders: 1.0, hair: P.hairBlack, hairStyle: 'tail', beard: 'mustache',
        hat: { kind: 'widebrim', color: P.clothBlack, trim: P.clothRed, feather: P.clothRed },
        top: { kind: 'shirt', color: P.clothCream, skirt: 0 },
        sleeves: { kind: 'long', color: P.clothCream, cuff: P.clothBlack }, gloves: P.clothBlack,
        overlay: { kind: 'vest', color: P.clothBlack },
        legs: { color: 0x26242a }, boots: { color: P.clothBlack, tall: true },
        belt: { color: P.leatherDark, buckle: P.gold, sash: P.clothRed },
        cloak: { color: 0x7a2420, length: 0.62, side: 1, width: 0.13, flare: 0.05 },
      },
    };
  },
  archer(g) {
    return {
      style: 'bow', weapon: 'bow', weight: 'medium',
      spec: {
        bulk: 0.95, shoulders: 1.0, hair: P.hairRed, hairStyle: 'short', beard: 'none',
        hat: { kind: 'hood', color: P.clothGreen },
        top: { kind: 'tunic', color: 0x5d6a3c, skirt: 0.24 },
        sleeves: { kind: 'long', color: 0x6a5a3c }, bracers: { color: P.leatherDark },
        legs: { color: 0x4a3e2c }, boots: { color: P.leather, tall: true },
        belt: { color: P.leatherDark, buckle: P.bronze, pouches: 2 },
        back: { kind: 'quiver', color: P.leather },
        cloak: { color: P.clothGreen, length: 0.9 },
      },
    };
  },
  medic(g) {
    return {
      style: 'medic', weapon: 'dart', weight: 'light',
      spec: {
        bulk: 0.9, shoulders: 0.92, female: true, hair: P.hairBlond, hairStyle: 'bun', beard: 'none',
        hat: { kind: 'scarf', color: P.clothCream },
        top: { kind: 'tunic', color: P.clothCream, skirt: 0.44, trim: 0x4f8a6a },
        sleeves: { kind: 'long', color: P.clothCream, cuff: 0x4f8a6a },
        apron: 0x4f8a6a, apronLen: 0.38,
        legs: { color: 0x5a5244 }, boots: { color: P.leather, tall: false },
        belt: { color: P.leather, buckle: P.bronze, pouches: 3, satchel: P.leather },
        strap: { color: P.leather, vials: true, tilt: -0.72 },
      },
    };
  },
  engineer(g) {
    return {
      style: 'crossbow', weapon: 'crossbow', weight: 'medium', weaponOpts: { heavy: true },
      spec: {
        bulk: 1.05, shoulders: 1.05, belly: 0.012, hair: P.hairBrown, hairStyle: 'crop', beard: 'full',
        hat: { kind: 'cap', color: P.leather },
        top: { kind: 'shirt', color: 0x8a7a5a, skirt: 0.0 },
        sleeves: { kind: 'short', color: 0x8a7a5a }, gloves: P.leatherDark, bracers: { color: P.copper, metal: 1 },
        apron: P.leatherDark, apronLen: 0.44,
        legs: { color: 0x4a4034 }, boots: { color: P.leatherDark, tall: true },
        belt: { color: P.leather, buckle: P.copper, pouches: 2, tools: true },
        back: { kind: 'pack', color: P.leather, gears: true },
      },
    };
  },
};

/** Class ids in catalogue order. */
export const HERO_CLASSES = Object.keys(CLASSES);

const WEAPON_STYLE = { greatsword: 'greatsword', sword: 'onehand', blades: 'dual', blade: 'dual', bow: 'bow', crossbow: 'crossbow', device: 'device', emitter: 'device', dart: 'medic', dagger: 'onehand', axe: 'onehand' };

/**
 * Build a playable hero.
 * @param {string} classId warrior|guardian|scientist|duelist|archer|medic|engineer
 * @param {{gear?:{weaponKind?:string, weight?:'light'|'medium'|'heavy', tier?:number}, look?:object}} [opts]
 *        `look` overrides spec fields (skin, hair, hairStyle, beard, female, scale …).
 * @returns Actor (see creature-models.js for the interface) with attach { handR, handL, back, head }.
 */
export function createHero(classId, opts = {}) {
  const gear = { tier: 1, ...(opts.gear || {}) };
  gear.tier = Math.max(1, Math.min(6, gear.tier | 0 || 1));
  const def = (CLASSES[classId] || CLASSES.warrior)(gear);
  const weight = gear.weight || def.weight;
  const spec = { ...def.spec, ...armourFor(weight, gear.tier, def.spec.top.color), ...(opts.look || {}) };
  if (gear.tier >= 5 && spec.top && spec.top.trim == null) spec.top = { ...spec.top, trim: P.gold };
  if (gear.tier >= 4 && spec.top) spec.top = { ...spec.top, color: mix(spec.top.color, shade(spec.top.color, 1.25), 0.4) };
  const model = buildHumanoid(spec);
  let weaponKind = def.weapon;
  let style = def.style;
  if (gear.weaponKind && gear.weaponKind !== weaponKind && WEAPON_STYLE[gear.weaponKind]) {
    weaponKind = gear.weaponKind === 'blades' ? 'blade' : gear.weaponKind === 'device' ? 'emitter' : gear.weaponKind;
    style = WEAPON_STYLE[gear.weaponKind];
  }
  const wopts = { tier: gear.tier, ...(def.weaponOpts || {}) };
  const main = makeGear(weaponKind, wopts);
  let ikMesh = null;
  let onAux = null;
  if (weaponKind === 'bow') {
    model.sockets.handL.add(main);
    ikMesh = main;
    onAux = a => main.userData.setDraw(Math.max(0, Math.min(1, a)));
  } else {
    model.sockets.handR.add(main);
    if (main.userData.gripL) ikMesh = main;
    if (main.userData.setGlow) onAux = a => main.userData.setGlow(a);
  }
  let off = null;
  if (style === 'dual') {
    off = makeGear('blade', wopts);
    model.sockets.handL.add(off);
  } else if (style === 'shield') {
    off = makeGear(def.off || 'kiteShield', { tier: gear.tier, ...(def.shield || {}) });
    model.sockets.shieldL.add(off);
  }
  const actor = createHumanoidActor(model, { style, ikMesh, onAux, seed: 7 });
  actor.classId = classId;
  actor.gear = { main, off };
  return actor;
}

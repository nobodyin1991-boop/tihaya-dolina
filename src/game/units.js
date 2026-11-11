// Runtime combat units: the shared shape of everything that can fight or be hit
// (hero, creatures, caravan guards, the wagon) plus status effects.
//
// unit = { id, kind:'hero'|'mob'|'guard'|'wagon', team:'player'|'hostile'|'neutral',
//          name, level, x, y, z, yaw, radius, height, hp, maxHp, alive,
//          statuses: [{type, t, value, tickT, source}], shield, actor? }

let nextUnitId = 1;
export const newUnitId = () => nextUnitId++;

/** Status behaviour table. dot = damage per second as a fraction of `value`; others are flags/multipliers. */
export const STATUS_RULES = {
  stun:    { control: true },                     // cannot move or act
  root:    { rooted: true },                      // cannot move
  slow:    { speedMult: v => 1 - v },             // value = 0..0.8
  burn:    { dot: true, color: '#ff8a3a' },       // value = damage per second
  bleed:   { dot: true, color: '#d2543f' },
  poison:  { dot: true, color: '#8fb86a' },
  weaken:  { damageMult: v => 1 - v },            // deals less damage
  mark:    { takenMult: v => 1 + v },             // takes more damage
  guard:   { takenMult: v => 1 - v },             // takes less damage (defensive stances)
  fury:    { damageMult: v => 1 + v },            // deals more damage
  haste:   { speedMult: v => 1 + v },
  regen:   { hot: true, color: '#8fd08a' },       // value = healing per second
  overdrive: {},                                  // engineer's companion fires faster
  taunt:   {},                                    // forces enemies to target the source
};

export function addStatus(unit, type, duration, value = 0, source = null) {
  if (!unit.alive || !STATUS_RULES[type]) return;
  if (type === 'stun' && unit.stunImmune > 0) return;
  const existing = unit.statuses.find(s => s.type === type);
  if (existing) {
    existing.t = Math.max(existing.t, duration);
    existing.value = Math.max(existing.value, value);
    existing.source = source || existing.source;
  } else {
    unit.statuses.push({ type, t: duration, total: duration, value, tickT: 1, source });
  }
  if (type === 'stun') unit.stunImmune = duration + 2.5;   // diminishing: no stun-lock
}

export const hasStatus = (unit, type) => unit.statuses.some(s => s.type === type);
export function removeStatus(unit, type) {
  const i = unit.statuses.findIndex(s => s.type === type);
  if (i >= 0) unit.statuses.splice(i, 1);
}
export function clearNegativeStatuses(unit, types = ['burn', 'bleed', 'poison', 'slow', 'weaken']) {
  unit.statuses = unit.statuses.filter(s => !types.includes(s.type));
}

function mult(unit, key) {
  let m = 1;
  for (const s of unit.statuses) { const f = STATUS_RULES[s.type][key]; if (f) m *= f(s.value); }
  return m;
}
export const speedMult = unit => Math.max(0.2, mult(unit, 'speedMult'));
export const damageMult = unit => mult(unit, 'damageMult');
export const takenMult = unit => mult(unit, 'takenMult');
export const isControlled = unit => unit.statuses.some(s => STATUS_RULES[s.type].control);
export const isRooted = unit => unit.statuses.some(s => STATUS_RULES[s.type].rooted || STATUS_RULES[s.type].control);

/**
 * Advance timers. Calls onTick(unit, kind:'dot'|'hot', amount, status) once per second per ticking status.
 */
export function tickStatuses(unit, dt, onTick) {
  if (unit.stunImmune > 0) unit.stunImmune -= dt;
  const list = unit.statuses;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    s.t -= dt;
    const rule = STATUS_RULES[s.type];
    if (rule.dot || rule.hot) {
      s.tickT -= dt;
      if (s.tickT <= 0) { s.tickT += 1; onTick(unit, rule.dot ? 'dot' : 'hot', s.value, s); }
    }
    if (s.t <= 0) list.splice(i, 1);
  }
}

export const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
/** Smoothly rotate `unit.yaw` toward `yaw` at `rate` rad/s. */
export function turnToward(unit, yaw, rate, dt) {
  const d = angleDiff(unit.yaw, yaw);
  const step = rate * dt;
  unit.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step;
}

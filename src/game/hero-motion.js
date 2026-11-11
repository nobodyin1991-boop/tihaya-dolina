// Hero locomotion: camera-relative movement, sprint/stamina, jump, dodge roll, wading, slopes, collisions.
// Works on a plain runtime object so it has no dependency on models or the DOM.
import { walkHeightAt, heightAt, waterDepthAt, inBounds } from '../world/terrain.js';
import { clamp } from '../core/noise.js';

export const HERO_RADIUS = 0.42;
const GRAVITY = 22;
const JUMP_SPEED = 7.4;
const MAX_WADE = 1.25;      // deeper water is impassable
const STEEP = 0.9;          // max height gain per metre when walking uphill

/** Fresh runtime body. */
export function createHeroBody(x, z, yaw) {
  return {
    x, z, y: walkHeightAt(x, z), yaw,
    vx: 0, vz: 0, vy: 0,
    grounded: true, speed: 0, moving: false, sprinting: false, mounted: false,
    stamina: 100, staminaDelay: 0,
    dodgeT: 0, dodgeDirX: 0, dodgeDirZ: 0, dodgeCooldown: 0, invulnerable: 0,
    rootT: 0,                // seconds of forced immobility (stun, long cast)
    slow: 1,                 // external speed multiplier (statuses)
    lockYaw: null,           // face this yaw (attacking a target) instead of the movement direction
    surface: 'grass',
    fellFrom: 0, landed: 0,  // landing impact signal for animation/sound
  };
}

const angleDelta = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

/**
 * Advance the body. `intent` = {mx, mz (-1..1 strafe/forward in camera space), sprint, walk, jump, dodge, camYaw}.
 * `stats` = {moveSpeed (run m/s), maxStamina}. Returns a list of event strings for sound/animation: 'jump','land','dodge','step'.
 */
export function stepHero(body, dt, intent, stats, colliders) {
  const events = [];
  const maxStamina = stats.maxStamina || 100;
  body.dodgeCooldown = Math.max(0, body.dodgeCooldown - dt);
  body.invulnerable = Math.max(0, body.invulnerable - dt);
  body.rootT = Math.max(0, body.rootT - dt);
  body.landed = Math.max(0, body.landed - dt);

  // —— desired direction in world space ——
  let dx = 0, dz = 0;
  const len = Math.hypot(intent.mx, intent.mz);
  if (len > 0.01 && body.rootT <= 0) {
    const s = Math.sin(intent.camYaw), c = Math.cos(intent.camYaw);
    // camera forward = (s, c); camera right = (-c, s)
    dx = (intent.mz * s - intent.mx * c) / len;
    dz = (intent.mz * c + intent.mx * s) / len;
  }
  const wantMove = dx !== 0 || dz !== 0;

  // —— dodge roll ——
  if (intent.dodge && body.dodgeT <= 0 && body.dodgeCooldown <= 0 && body.grounded && body.rootT <= 0 && !body.mounted && body.stamina >= 22) {
    body.stamina -= 22; body.staminaDelay = 0.9;
    body.dodgeT = 0.42; body.dodgeCooldown = 0.75; body.invulnerable = 0.32;
    if (wantMove) { body.dodgeDirX = dx; body.dodgeDirZ = dz; } else { body.dodgeDirX = -Math.sin(body.yaw); body.dodgeDirZ = -Math.cos(body.yaw); }
    events.push('dodge');
  }

  // —— speed ——
  const depth = waterDepthAt(body.x, body.z);
  const wade = depth > 0.25 ? clamp(1 - (depth - 0.25) * 0.55, 0.45, 1) : 1;
  let run = (stats.moveSpeed || 6.2) * body.slow * wade;
  if (body.mounted) run = 12.5 * wade;
  body.sprinting = false;
  let target = 0;
  if (wantMove) {
    target = intent.walk ? 2.1 : run;
    if (intent.sprint && !intent.walk && body.stamina > 1 && !body.mounted && body.grounded) {
      target = run * 1.38; body.sprinting = true;
      body.stamina = Math.max(0, body.stamina - 11 * dt); body.staminaDelay = 0.6;
    }
  }
  if (!body.sprinting) {
    body.staminaDelay -= dt;
    if (body.staminaDelay <= 0) body.stamina = Math.min(maxStamina, body.stamina + (wantMove ? 14 : 24) * dt);
  }
  body.stamina = Math.min(body.stamina, maxStamina);

  let tvx = dx * target, tvz = dz * target;
  if (body.dodgeT > 0) {
    body.dodgeT -= dt;
    const k = 11.5 * (0.35 + 0.65 * (body.dodgeT / 0.42));
    tvx = body.dodgeDirX * k; tvz = body.dodgeDirZ * k;
    body.vx = tvx; body.vz = tvz;
  } else {
    const accel = body.grounded ? (wantMove ? 34 : 42) : 9;
    const k = 1 - Math.exp(-accel * dt / Math.max(1, target || 6));
    body.vx += (tvx - body.vx) * Math.min(1, k * 4.5);
    body.vz += (tvz - body.vz) * Math.min(1, k * 4.5);
  }

  // —— horizontal move with collisions ——
  let nx = body.x + body.vx * dt, nz = body.z + body.vz * dt;
  if (!inBounds(nx, nz)) { nx = body.x; nz = body.z; }
  const res = colliders.resolve(nx, nz, body.mounted ? 0.7 : HERO_RADIUS, body.y);
  nx = res.x; nz = res.z;

  // deep water and cliffs block ground movement
  if (body.grounded) {
    const nd = waterDepthAt(nx, nz);
    if (nd > MAX_WADE && nd > depth) { nx = body.x; nz = body.z; body.vx = body.vz = 0; }
    else {
      const step = Math.hypot(nx - body.x, nz - body.z);
      if (step > 1e-4) {
        const rise = walkHeightAt(nx, nz) - body.y;
        if (rise > STEEP * step + 0.25) {
          // too steep: slide along the contour instead of climbing
          const tx = nx - body.x, tz = nz - body.z;
          const ax = body.x + tx, az = body.z, bx = body.x, bz = body.z + tz;
          if (walkHeightAt(ax, az) - body.y <= STEEP * Math.abs(tx) + 0.2) { nx = ax; nz = az; }
          else if (walkHeightAt(bx, bz) - body.y <= STEEP * Math.abs(tz) + 0.2) { nx = bx; nz = bz; }
          else { nx = body.x; nz = body.z; }
        }
      }
    }
  }
  const moved = Math.hypot(nx - body.x, nz - body.z);
  body.x = nx; body.z = nz;
  body.speed = dt > 0 ? moved / dt : 0;
  body.moving = body.speed > 0.3;

  // —— vertical ——
  const ground = walkHeightAt(body.x, body.z);
  if (body.grounded) {
    if (intent.jump && body.rootT <= 0 && body.dodgeT <= 0 && !body.mounted && depth < 0.8) {
      body.vy = JUMP_SPEED; body.grounded = false; body.fellFrom = body.y;
      events.push('jump');
    } else if (body.y - ground > 0.6) {
      body.grounded = false; body.vy = 0; body.fellFrom = body.y;   // walked off an edge
    } else {
      body.y = ground;
    }
  }
  if (!body.grounded) {
    body.vy -= GRAVITY * dt;
    body.y += body.vy * dt;
    if (body.y <= ground) {
      body.y = ground; body.grounded = true;
      body.landed = 0.25;
      body.fallDistance = Math.max(0, body.fellFrom - ground);
      body.vy = 0;
      events.push('land');
    }
  }

  // —— facing ——
  let wantYaw = null;
  if (body.lockYaw !== null) wantYaw = body.lockYaw;
  else if (body.dodgeT > 0) wantYaw = Math.atan2(body.dodgeDirX, body.dodgeDirZ);
  else if (wantMove) wantYaw = Math.atan2(dx, dz);
  if (wantYaw !== null) body.yaw += angleDelta(body.yaw, wantYaw) * Math.min(1, dt * (body.lockYaw !== null ? 18 : 12));

  // —— surface for footsteps ——
  body.surface = depth > 0.08 ? 'water' : 'grass';
  return events;
}

/** Find the nearest free, dry spot around (x,z) — used after loading a save or respawning. */
export function findFreeSpot(x, z, colliders, radius = HERO_RADIUS) {
  for (let r = 0; r < 40; r += 1.5) {
    for (let a = 0; a < 8; a++) {
      const px = x + Math.cos(a * 0.785) * r, pz = z + Math.sin(a * 0.785) * r;
      if (!colliders.blocked(px, pz, radius, heightAt(px, pz)) && waterDepthAt(px, pz) < 0.3) return { x: px, z: pz };
    }
  }
  return { x, z };
}

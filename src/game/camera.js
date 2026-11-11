// Third-person orbit camera with terrain + obstacle avoidance.
import * as THREE from 'three';
import { heightAt } from '../world/terrain.js';
import { clamp, lerp } from '../core/noise.js';

const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function createCameraRig(camera, colliders, settings) {
  const rig = {
    yaw: Math.PI,          // camera looks along (sin yaw, cos yaw) on the ground plane
    pitch: 0.28,           // radians above the horizon (positive = looking down at the hero)
    distance: 7.5,
    wantDistance: 7.5,
    shake: 0,
    fovKick: 0,
    cinematic: null,       // {x,y,z, lookX,lookY,lookZ} override for dialogue etc.
  };
  let current = 7.5;
  const BASE_FOV = 58;

  /** Apply mouse look deltas (pixels) and wheel steps. */
  rig.look = function look(dx, dy, wheel) {
    const sens = 0.0022 * (settings.mouseSensitivity ?? 1);
    rig.yaw -= dx * sens;
    rig.pitch = clamp(rig.pitch + dy * sens * (settings.invertY ? -1 : 1), -0.9, 1.35);
    if (wheel) rig.wantDistance = clamp(rig.wantDistance + wheel * 1.1, 2.6, 16);
  };

  /** Place the camera behind `focus` (hero position at feet). `eye` = eye height. */
  rig.update = function update(dt, focus, eye = 1.65, sprinting = false) {
    rig.distance = lerp(rig.distance, rig.wantDistance, 1 - Math.exp(-dt * 8));
    _target.set(focus.x, focus.y + eye + 0.25, focus.z);

    if (rig.cinematic) {
      const c = rig.cinematic;
      camera.position.lerp(_dir.set(c.x, c.y, c.z), 1 - Math.exp(-dt * 4));
      camera.lookAt(c.lookX, c.lookY, c.lookZ);
      return;
    }

    const cp = Math.cos(rig.pitch), sp = Math.sin(rig.pitch);
    // direction from target to camera
    _dir.set(-Math.sin(rig.yaw) * cp, sp, -Math.cos(rig.yaw) * cp);

    // pull in if something is between hero and camera
    let dist = colliders.rayDistance(_target.x, _target.y, _target.z, _dir.x, _dir.y, _dir.z, rig.distance, 0.25, 0.4, 1.3);
    // keep above terrain along the ray
    for (let d = 1; d <= dist; d += 0.8) {
      const gx = _target.x + _dir.x * d, gz = _target.z + _dir.z * d;
      const ground = Math.max(heightAt(gx, gz), 0) + 0.35;
      if (_target.y + _dir.y * d < ground) { dist = Math.max(1.2, d - 0.8); break; }
    }
    current = dist < current ? dist : lerp(current, dist, 1 - Math.exp(-dt * 5));
    current = Math.max(1.6, current);

    camera.position.set(_target.x + _dir.x * current, _target.y + _dir.y * current, _target.z + _dir.z * current);
    const floor = Math.max(heightAt(camera.position.x, camera.position.z), 0) + 0.3;
    if (camera.position.y < floor) camera.position.y = floor;

    if (rig.shake > 0.001) {
      const s = rig.shake;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      rig.shake *= Math.exp(-dt * 9);
    }
    camera.lookAt(_target);

    const wantFov = BASE_FOV + (sprinting ? 5 : 0) + rig.fovKick;
    rig.fovKick *= Math.exp(-dt * 6);
    if (Math.abs(camera.fov - wantFov) > 0.05) {
      camera.fov = lerp(camera.fov, wantFov, 1 - Math.exp(-dt * 6));
      camera.updateProjectionMatrix();
    }
  };

  /** Ground-plane forward of the camera as yaw (hero-relative movement uses this). */
  rig.forwardYaw = () => rig.yaw;
  rig.addShake = amount => { rig.shake = Math.min(0.6, rig.shake + amount); };
  return rig;
}

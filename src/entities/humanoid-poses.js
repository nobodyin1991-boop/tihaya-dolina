// Pose and keyframe data for humanoids. Pure data — compiled by humanoid-anim.js.
//
// Authoring convention (angles in radians, values are for the LEFT limb; the right limb is mirrored automatically,
// so the same numbers on L and R give a symmetric pose):
//   arm:   x < 0 raise forward, z > 0 abduct (away from the body), y > 0 swing the bent forearm outward
//   fore:  x < 0 flex the elbow          hand: x tilts the held weapon (0 = perpendicular to the forearm,
//                                               +1.57 = in line with the forearm, pointing away from the elbow)
//   spine/chest: x > 0 lean forward, y > 0 turn left      head: x > 0 nod down
//   thigh: x < 0 forward, z > 0 abduct, y > 0 toe out     shin: x > 0 bend the knee
// Pseudo joints: root (whole-body rotation about the feet), rootPos, pos (pelvis offset), stride [zL, zR, crouch]
// (planted foot offsets forward/back and crouch depth, used by the leg IK), aux [a, b, c] (bow draw / glow, IK weight).

export const JOINTS = ['root', 'rootPos', 'pelvis', 'pos', 'spine', 'chest', 'neck', 'head', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'stride', 'aux'];

const IDLE = {
  armL: [0.03, 0, 0.1], foreL: [-0.22, 0, 0], handL: [0.55, 0, 0],
  armR: [0.03, 0, 0.1], foreR: [-0.22, 0, 0], handR: [0.55, 0, 0],
  thighL: [0, 0.14, 0.03], thighR: [0, 0.14, 0.03], stride: [0.02, -0.02, 0],
};

const COMBAT = {
  spine: [0.06, 0.12, 0], chest: [0.08, 0.3, 0], head: [-0.04, -0.38, 0],
  armR: [-0.55, 0.25, 0.3], foreR: [-1.25, 0, 0], handR: [0.4, 0, 0],
  armL: [-0.25, -0.2, 0.25], foreL: [-1.2, 0, 0], handL: [0.4, 0, 0],
  thighL: [0, 0.1, 0.07], thighR: [0, 0.4, 0.09], stride: [0.17, -0.16, 0.07],
};

/** Stances shared by every style. Fields: pose, lock (legs use FK), pelvisY, armSwing, idle, breath, rate, ik. */
export const COMMON_STANCES = {
  idle: { pose: IDLE },
  combat: { pose: COMBAT, armSwing: 0.3, idle: 0.3 },
  sit: {
    lock: 1, pelvisY: 0.55, armSwing: 0, idle: 0.5,
    pose: {
      spine: [0.1, 0, 0], chest: [0.05, 0, 0], head: [-0.05, 0, 0],
      thighL: [-1.5, 0.05, 0.1], shinL: [1.5, 0, 0], thighR: [-1.5, 0.05, 0.1], shinR: [1.5, 0, 0],
      armL: [-0.4, 0, 0.12], foreL: [-0.85, 0, 0], armR: [-0.4, 0, 0.12], foreR: [-0.85, 0, 0], handL: [0.6, 0, 0], handR: [0.6, 0, 0],
    },
  },
  sleep: {
    lock: 1, pelvisY: 0.975, armSwing: 0, idle: 0, breath: 1.5, rate: 4,
    pose: {
      root: [-1.5, 0, 0], rootPos: [0, 0.13, 0.9], head: [0.1, 0.5, 0],
      armL: [0, 0, 0.3], foreL: [-0.3, 0, 0], armR: [-0.15, -0.2, 0.25], foreR: [-1.3, 0, 0],
      thighL: [-0.05, 0.3, 0.1], shinL: [0.1, 0, 0], thighR: [-0.3, 0.3, 0.12], shinR: [0.6, 0, 0], footL: [0.5, 0, 0], footR: [0.5, 0, 0],
    },
  },
  dead: {
    lock: 1, pelvisY: 0.975, armSwing: 0, idle: 0, breath: 0, rate: 5,
    pose: {
      root: [-1.53, 0, 0.1], rootPos: [0, 0.12, 0.8], head: [0.15, 0.8, 0.2], spine: [-0.05, 0.15, 0.1],
      armL: [0, 0, 1.2], foreL: [-0.3, 0, 0], armR: [0.02, 0, 0.75], foreR: [-0.25, 0, 0], handR: [1.2, 0, 0], handL: [1.2, 0, 0],
      thighL: [-0.3, 0.5, 0.25], shinL: [0.8, 0, 0], thighR: [0, 0.5, 0.12], shinR: [0.1, 0, 0], footL: [0.6, 0, 0], footR: [0.6, 0, 0],
    },
  },
  work: {
    armSwing: 0, idle: 0.2, loop: 'hammer',
    pose: {
      spine: [0.2, 0, 0], chest: [0.12, 0.1, 0], head: [0.2, 0, 0],
      armR: [-0.8, 0.1, 0.2], foreR: [-1.3, 0, 0], handR: [0.3, 0, 0],
      armL: [-0.55, -0.2, 0.15], foreL: [-1.0, 0, 0], thighL: [0, 0.1, 0.06], thighR: [0, 0.2, 0.08], stride: [0.08, -0.08, 0.04],
    },
  },
  guard: {
    armSwing: 0.2, idle: 0.6,
    pose: {
      chest: [-0.03, 0, 0], armR: [-0.4, 0.15, 0.18], foreR: [-1.2, 0, 0], handR: [0.03, 0, 0],
      armL: [0.12, 0, 0.42], foreL: [-1.15, -0.5, 0], thighL: [0, 0.16, 0.06], thighR: [0, 0.16, 0.06],
    },
  },
  lean: {
    lock: 1, pelvisY: 0.965, armSwing: 0, idle: 0.5,
    pose: {
      root: [-0.1, 0, 0], spine: [-0.04, 0, 0], head: [0.12, 0.2, 0],
      armL: [-0.5, -0.95, 0.12], foreL: [-1.85, 0, 0], armR: [-0.42, -0.95, 0.12], foreR: [-1.95, 0, 0],
      thighL: [0.1, 0.15, 0.04], shinL: [0.02, 0, 0], thighR: [-0.75, 0.2, 0.05], shinR: [1.7, 0, 0], footR: [0.4, 0, 0], footL: [0, 0, 0],
    },
  },
  mounted: {
    lock: 1, pelvisY: 0.2, armSwing: 0, idle: 0.3,
    pose: {
      spine: [0.08, 0, 0], thighL: [-1.0, 0.1, 0.55], shinL: [1.15, 0, 0], thighR: [-1.0, 0.1, 0.55], shinR: [1.15, 0, 0],
      footL: [-0.2, 0, 0], footR: [-0.2, 0, 0],
      armL: [-0.45, -0.25, 0.15], foreL: [-1.05, 0, 0], armR: [-0.45, -0.25, 0.15], foreR: [-1.05, 0, 0],
    },
  },
  carry: {
    armSwing: 0, idle: 0.3,
    pose: {
      spine: [-0.1, 0, 0], armL: [-0.7, -0.3, 0.1], foreL: [-1.2, 0, 0], armR: [-0.7, -0.3, 0.1], foreR: [-1.2, 0, 0],
      thighL: [0, 0.14, 0.04], thighR: [0, 0.14, 0.04],
    },
  },
};

/** One-shot tracks shared by every style. keys: [t, ease, pose]. */
export const COMMON_TRACKS = {
  hit: {
    dur: 0.42, strike: 0.1, fin: 0.08, fout: 0.5,
    keys: [
      [0, 'io', { spine: [-0.28, 0.15, 0], chest: [-0.15, 0.2, 0], head: [-0.25, 0.1, 0.1], pos: [0, -0.03, -0.1], armL: [-0.3, 0, 0.5], armR: [-0.3, 0, 0.5] }],
      [1, 'io', { spine: [-0.1, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], pos: [0, 0, 0], armL: [0, 0, 0.2], armR: [0, 0, 0.2] }],
    ],
  },
  dodge: {
    dur: 0.5, strike: 0.2, fin: 0.15, fout: 0.35,
    keys: [
      [0, 'io', { pos: [0, -0.05, 0], stride: [0, 0, 0.15], spine: [0.2, 0, 0], root: [0, 0, 0] }],
      [0.4, 'out', { pos: [0.1, -0.12, -0.08], stride: [0.05, -0.2, 0.3], spine: [0.45, 0.3, 0.2], root: [0, 0, 0.2], head: [-0.2, -0.3, 0], armL: [-0.6, 0, 0.6], armR: [0.3, 0, 0.5] }],
      [1, 'io', { pos: [0, 0, 0], stride: [0, 0, 0.1], spine: [0.2, 0, 0], root: [0, 0, 0] }],
    ],
  },
  gather: {
    dur: 1.5, strike: 0.5, fin: 0.14, fout: 0.2,
    keys: [
      [0, 'io', { spine: [0.3, 0, 0], chest: [0.15, 0, 0], stride: [0.12, -0.12, 0.2], armR: [-0.6, 0, 0.1], foreR: [-0.6, 0, 0], head: [0.2, 0, 0], armL: [-0.2, 0, 0.2], foreL: [-0.9, 0, 0] }],
      [0.3, 'io', { spine: [0.75, 0.12, 0], chest: [0.4, 0.1, 0], stride: [0.16, -0.14, 0.5], armR: [-1.0, -0.1, 0.1], foreR: [-0.35, 0, 0], head: [0.1, 0, 0] }],
      [0.45, 'io', { armR: [-0.8, -0.3, 0.1], foreR: [-0.9, 0, 0] }],
      [0.6, 'io', { armR: [-1.05, 0.1, 0.15], foreR: [-0.3, 0, 0] }],
      [0.75, 'io', { armR: [-0.8, -0.3, 0.1], foreR: [-1.0, 0, 0], spine: [0.7, 0.05, 0] }],
      [1, 'io', { spine: [0.2, 0, 0], chest: [0.1, 0, 0], stride: [0.1, -0.1, 0.1], armR: [-0.5, 0, 0.1], foreR: [-1.2, 0, 0] }],
    ],
  },
  use: {
    dur: 1.1, strike: 0.5, fin: 0.18, fout: 0.25,
    keys: [
      [0, 'io', { armL: [-0.5, -0.3, 0.2], foreL: [-1.6, 0, 0], head: [0, 0, 0] }],
      [0.4, 'io', { armL: [-0.95, -0.5, 0.3], foreL: [-2.2, 0, 0], head: [-0.3, 0, 0], chest: [-0.08, 0, 0] }],
      [0.75, 'io', { armL: [-1.0, -0.5, 0.3], foreL: [-2.25, 0, 0], head: [-0.4, 0, 0] }],
      [1, 'io', { armL: [-0.4, -0.2, 0.2], foreL: [-1.2, 0, 0], head: [0, 0, 0] }],
    ],
  },
  talk: {
    dur: 1.8, strike: 0.5, fin: 0.15, fout: 0.25,
    keys: [
      [0, 'io', { armL: [-0.3, 0.3, 0.2], foreL: [-1.2, 0, 0], head: [0.05, 0, 0], chest: [0, 0, 0] }],
      [0.25, 'io', { armL: [-0.55, 0.6, 0.3], foreL: [-1.5, 0, 0], head: [0.12, 0.1, 0], chest: [0.03, 0.06, 0] }],
      [0.5, 'io', { armL: [-0.45, 0.2, 0.25], foreL: [-1.25, 0, 0], head: [-0.05, -0.08, 0] }],
      [0.75, 'io', { armL: [-0.6, 0.7, 0.3], foreL: [-1.6, 0, 0], head: [0.1, 0.05, 0.05] }],
      [1, 'io', { armL: [-0.3, 0.3, 0.2], foreL: [-1.1, 0, 0], head: [0, 0, 0] }],
    ],
  },
  cheer: {
    dur: 1.2, strike: 0.35, fin: 0.15, fout: 0.3,
    keys: [
      [0, 'io', { armL: [-1.0, 0, 0.3], foreL: [-1.2, 0, 0], armR: [-1.0, 0, 0.3], foreR: [-1.2, 0, 0], stride: [0, 0, 0.12], spine: [0.05, 0, 0] }],
      [0.3, 'back', { armL: [-2.7, 0, 0.45], foreL: [-0.4, 0, 0], armR: [-2.75, 0, 0.35], foreR: [-0.5, 0, 0], stride: [0, 0, -0.02], spine: [-0.15, 0, 0], head: [-0.25, 0, 0], pos: [0, 0.03, 0] }],
      [0.55, 'io', { armL: [-2.4, 0, 0.55], foreL: [-0.8, 0, 0], armR: [-2.5, 0, 0.5], foreR: [-0.8, 0, 0], stride: [0, 0, 0.06] }],
      [0.8, 'io', { armL: [-2.75, 0, 0.4], foreL: [-0.4, 0, 0], armR: [-2.7, 0, 0.4], foreR: [-0.4, 0, 0], stride: [0, 0, 0] }],
      [1, 'io', { armL: [-1.5, 0, 0.3], foreL: [-1.0, 0, 0], armR: [-1.5, 0, 0.3], foreR: [-1.0, 0, 0] }],
    ],
  },
  block: {
    dur: 0.7, strike: 0.2, fin: 0.2, fout: 0.3,
    keys: [
      [0, 'out', { armR: [-1.3, -0.6, 0.3], foreR: [-1.5, 0, 0], handR: [-0.2, 0, 0], armL: [-1.1, -0.6, 0.25], foreL: [-1.6, 0, 0], spine: [0.15, 0, 0], stride: [0.14, -0.18, 0.16] }],
      [1, 'io', { armR: [-1.25, -0.6, 0.3], foreR: [-1.5, 0, 0] }],
    ],
  },
  attack: {
    dur: 0.62, strike: 0.5, fout: 0.3,
    keys: [
      [0, 'io', { chest: [0, 0.2, 0], spine: [0.05, 0.1, 0], armR: [-0.6, 0.2, 0.3], foreR: [-1.3, 0, 0], handR: [0.3, 0, 0], stride: [0.17, -0.16, 0.07], pos: [0, 0, 0] }],
      [0.32, 'out', { chest: [-0.05, -0.45, 0], spine: [-0.06, -0.2, 0], armR: [-2.2, 0.5, 0.55], foreR: [-1.5, 0, 0], handR: [-0.3, 0, 0], stride: [0.14, -0.2, 0.05], pos: [0, 0.01, -0.04] }],
      [0.52, 'in', { chest: [0.2, 0.6, 0], spine: [0.18, 0.3, 0], armR: [-0.95, -0.7, 0.15], foreR: [-0.3, 0, 0], handR: [1.0, 0, 0], stride: [0.33, -0.26, 0.13], pos: [0, 0, 0.12] }],
      [0.68, 'out', { chest: [0.25, 0.8, 0], armR: [-0.45, -1.0, 0.1], foreR: [-0.5, 0, 0], handR: [1.1, 0, 0] }],
      [1, 'io', { chest: [0.15, 0.5, 0], armR: [-0.5, -0.6, 0.2], foreR: [-0.9, 0, 0], handR: [0.6, 0, 0], stride: [0.2, -0.18, 0.08], pos: [0, 0, 0.03] }],
    ],
  },
  attack2: {
    dur: 0.62, strike: 0.5, fout: 0.3,
    keys: [
      [0, 'io', { chest: [0, 0.4, 0], spine: [0.05, 0.1, 0], armR: [-0.7, -0.6, 0.2], foreR: [-1.3, 0, 0], handR: [0.4, 0, 0], stride: [0.17, -0.16, 0.07], pos: [0, 0, 0] }],
      [0.32, 'out', { chest: [0.05, 0.85, 0], spine: [0, 0.3, 0], armR: [-1.3, -1.35, 0.1], foreR: [-1.7, 0, 0], handR: [0, 0, 0], pos: [0, 0, -0.03] }],
      [0.52, 'in', { chest: [0.15, -0.4, 0], spine: [0.12, -0.2, 0], armR: [-1.25, 0.5, 0.6], foreR: [-0.25, 0, 0], handR: [1.0, 0, 0], stride: [0.3, -0.24, 0.12], pos: [0, 0, 0.1] }],
      [0.7, 'out', { chest: [0.1, -0.6, 0], armR: [-0.9, 0.9, 0.8], foreR: [-0.4, 0, 0] }],
      [1, 'io', { chest: [0.05, -0.2, 0], armR: [-0.6, 0.4, 0.4], foreR: [-1.0, 0, 0], handR: [0.5, 0, 0], stride: [0.2, -0.18, 0.08], pos: [0, 0, 0.02] }],
    ],
  },
  heavy: {
    dur: 0.95, strike: 0.56, fout: 0.3,
    keys: [
      [0, 'io', { chest: [0, 0.1, 0], spine: [0, 0, 0], armR: [-1.0, 0.1, 0.3], foreR: [-1.4, 0, 0], handR: [0.2, 0, 0], stride: [0.15, -0.16, 0.08], pos: [0, 0, 0] }],
      [0.38, 'out', { chest: [-0.15, -0.2, 0], spine: [-0.2, -0.1, 0], armR: [-2.8, 0.2, 0.3], foreR: [-1.3, 0, 0], handR: [-0.5, 0, 0], stride: [0.1, -0.2, 0.02], pos: [0, 0.03, -0.06], head: [-0.15, 0, 0] }],
      [0.58, 'in', { chest: [0.3, 0.2, 0], spine: [0.45, 0.1, 0], armR: [-1.0, -0.3, 0.1], foreR: [-0.2, 0, 0], handR: [1.25, 0, 0], stride: [0.4, -0.3, 0.2], pos: [0, 0, 0.16], head: [-0.2, 0, 0] }],
      [0.75, 'out', { spine: [0.5, 0.1, 0], armR: [-0.8, -0.35, 0.1], handR: [1.35, 0, 0] }],
      [1, 'io', { chest: [0.15, 0.2, 0], spine: [0.2, 0, 0], armR: [-0.7, -0.2, 0.2], foreR: [-0.9, 0, 0], handR: [0.6, 0, 0], stride: [0.25, -0.2, 0.1], pos: [0, 0, 0.05] }],
    ],
  },
};

const GS_COMBAT = {
  spine: [0.08, 0.1, 0], chest: [0.06, 0.25, 0], head: [-0.03, -0.32, 0],
  armR: [-0.45, -0.4, 0.12], foreR: [-0.95, 0, 0], handR: [0.55, 0, 0],
  armL: [-0.4, -0.3, 0.2], foreL: [-1.0, 0, 0],
  thighL: [0, 0.1, 0.08], thighR: [0, 0.45, 0.1], stride: [0.2, -0.17, 0.09],
};

const GREATSWORD = {
  ikHand: 'L',
  stances: {
    idle: { pose: { ...IDLE, armR: [-0.5, 0.3, 0.22], foreR: [-2.15, 0, 0], handR: [0.3, 0, 0] }, armSwing: 0.6 },
    combat: { pose: GS_COMBAT, armSwing: 0.15, idle: 0.3, ik: 1 },
    guard: { pose: { ...IDLE, armR: [-0.5, 0.3, 0.22], foreR: [-2.15, 0, 0], handR: [0.3, 0, 0] } },
  },
  tracks: {
    attack: {
      dur: 0.8, strike: 0.5, fout: 0.3, ik: 1,
      keys: [
        [0, 'io', { ...GS_COMBAT, pos: [0, 0, 0] }],
        [0.34, 'out', { chest: [-0.05, -0.6, 0], spine: [-0.05, -0.25, 0], head: [0, 0.5, 0], armR: [-1.45, 0.85, 0.55], foreR: [-1.55, 0, 0], handR: [-0.25, 0, 0], stride: [0.16, -0.22, 0.06], pos: [0, 0.01, -0.05] }],
        [0.52, 'in', { chest: [0.18, 0.7, 0], spine: [0.15, 0.3, 0], head: [-0.05, -0.6, 0], armR: [-1.2, -0.8, 0.2], foreR: [-0.35, 0, 0], handR: [1.05, 0, 0], stride: [0.36, -0.3, 0.15], pos: [0, 0, 0.12] }],
        [0.68, 'out', { chest: [0.22, 0.95, 0], armR: [-0.9, -1.25, 0.1], foreR: [-0.5, 0, 0], handR: [1.1, 0, 0] }],
        [1, 'io', { chest: [0.15, 0.6, 0], spine: [0.1, 0.2, 0], armR: [-0.6, -0.8, 0.12], foreR: [-0.9, 0, 0], handR: [0.7, 0, 0], stride: [0.24, -0.2, 0.1], pos: [0, 0, 0.04] }],
      ],
    },
    attack2: {
      dur: 0.8, strike: 0.5, fout: 0.3, ik: 1,
      keys: [
        [0, 'io', { ...GS_COMBAT, pos: [0, 0, 0] }],
        [0.34, 'out', { chest: [0, 0.9, 0], spine: [0, 0.3, 0], head: [0, -0.8, 0], armR: [-1.3, -1.4, 0.1], foreR: [-1.6, 0, 0], handR: [0, 0, 0], stride: [0.2, -0.16, 0.06], pos: [0, 0, -0.04] }],
        [0.52, 'in', { chest: [0.15, -0.45, 0], spine: [0.12, -0.2, 0], head: [0, 0.4, 0], armR: [-1.25, 0.45, 0.55], foreR: [-0.3, 0, 0], handR: [1.0, 0, 0], stride: [0.34, -0.28, 0.14], pos: [0, 0, 0.1] }],
        [0.7, 'out', { chest: [0.12, -0.7, 0], armR: [-0.9, 0.85, 0.75], foreR: [-0.45, 0, 0] }],
        [1, 'io', { chest: [0.05, -0.2, 0], spine: [0.08, 0, 0], armR: [-0.6, 0.3, 0.35], foreR: [-0.9, 0, 0], handR: [0.6, 0, 0], stride: [0.22, -0.2, 0.09], pos: [0, 0, 0.03] }],
      ],
    },
    heavy: {
      dur: 1.15, strike: 0.56, fout: 0.3, ik: 1,
      keys: [
        [0, 'io', { ...GS_COMBAT, pos: [0, 0, 0] }],
        [0.4, 'out', { chest: [-0.18, 0, 0], spine: [-0.22, 0, 0], head: [0.2, 0, 0], armR: [-2.75, -0.15, 0.2], foreR: [-1.15, 0, 0], handR: [-0.55, 0, 0], stride: [0.1, -0.2, 0.0], pos: [0, 0.03, -0.07] }],
        [0.58, 'in', { chest: [0.3, 0.1, 0], spine: [0.5, 0, 0], head: [-0.3, 0, 0], armR: [-0.95, -0.3, 0.1], foreR: [-0.2, 0, 0], handR: [1.3, 0, 0], stride: [0.42, -0.32, 0.22], pos: [0, 0, 0.17] }],
        [0.76, 'out', { spine: [0.56, 0, 0], armR: [-0.75, -0.3, 0.1], handR: [1.4, 0, 0] }],
        [1, 'io', { chest: [0.15, 0.2, 0], spine: [0.2, 0.05, 0], head: [-0.1, -0.2, 0], armR: [-0.6, -0.4, 0.12], foreR: [-0.8, 0, 0], handR: [0.7, 0, 0], stride: [0.26, -0.2, 0.12], pos: [0, 0, 0.05] }],
      ],
    },
    block: {
      dur: 0.7, strike: 0.2, fin: 0.2, fout: 0.3, ik: 1,
      keys: [
        [0, 'out', { armR: [-1.2, -0.75, 0.3], foreR: [-1.2, 0, 0], handR: [-0.1, 0.5, 0], spine: [0.12, 0, 0], chest: [0.05, 0.3, 0], stride: [0.14, -0.2, 0.16] }],
        [1, 'io', { armR: [-1.15, -0.75, 0.3] }],
      ],
    },
  },
};

const SH_COMBAT = {
  spine: [0.1, -0.12, 0], chest: [0.08, -0.3, 0], head: [-0.04, 0.38, 0],
  armL: [-0.8, -0.85, 0.3], foreL: [-1.4, 0, 0],
  armR: [0.2, 0.1, 0.3], foreR: [-1.45, 0, 0], handR: [1.1, 0, 0],
  thighL: [0, 0.2, 0.07], thighR: [0, 0.4, 0.1], stride: [0.2, -0.17, 0.1],
};

const SHIELD = {
  stances: {
    idle: { pose: { ...IDLE, armL: [-0.1, -0.45, 0.16], foreL: [-1.0, 0, 0] } },
    combat: { pose: SH_COMBAT, armSwing: 0.1, idle: 0.3 },
    guard: { pose: { ...IDLE, armL: [-0.25, -0.6, 0.2], foreL: [-1.25, 0, 0], armR: [0.03, 0, 0.12], foreR: [-0.3, 0, 0], handR: [0.9, 0, 0] } },
  },
  tracks: {
    attack: {
      dur: 0.6, strike: 0.5, fout: 0.3,
      keys: [
        [0, 'io', { ...SH_COMBAT, pos: [0, 0, 0] }],
        [0.3, 'out', { chest: [0.05, -0.5, 0], armR: [0.55, 0.1, 0.3], foreR: [-1.8, 0, 0], handR: [1.3, 0, 0], pos: [0, 0, -0.04] }],
        [0.52, 'in', { chest: [0.15, 0.25, 0], spine: [0.15, 0.1, 0], head: [0, -0.2, 0], armR: [-1.4, -0.3, 0.1], foreR: [-0.12, 0, 0], handR: [1.45, 0, 0], stride: [0.36, -0.26, 0.15], pos: [0, 0, 0.13] }],
        [0.66, 'out', { armR: [-1.45, -0.3, 0.1] }],
        [1, 'io', { chest: [0.08, -0.2, 0], armR: [-0.2, 0, 0.3], foreR: [-1.3, 0, 0], handR: [1.2, 0, 0], stride: [0.22, -0.18, 0.1], pos: [0, 0, 0.03] }],
      ],
    },
    attack2: {
      dur: 0.7, strike: 0.5, fout: 0.3,
      keys: [
        [0, 'io', { ...SH_COMBAT, pos: [0, 0, 0] }],
        [0.32, 'out', { chest: [-0.05, -0.55, 0], armR: [-2.3, 0.4, 0.4], foreR: [-1.4, 0, 0], handR: [-0.3, 0, 0], pos: [0, 0.01, -0.03] }],
        [0.52, 'in', { chest: [0.2, 0.2, 0], spine: [0.2, 0.05, 0], head: [0, -0.2, 0], armR: [-1.0, -0.5, 0.12], foreR: [-0.3, 0, 0], handR: [1.1, 0, 0], stride: [0.32, -0.25, 0.14], pos: [0, 0, 0.1] }],
        [0.7, 'out', { armR: [-0.6, -0.7, 0.1], handR: [1.2, 0, 0] }],
        [1, 'io', { chest: [0.1, -0.1, 0], armR: [-0.3, -0.2, 0.25], foreR: [-1.1, 0, 0], handR: [0.9, 0, 0], stride: [0.22, -0.18, 0.1], pos: [0, 0, 0.03] }],
      ],
    },
    heavy: {
      dur: 0.85, strike: 0.5, fout: 0.3,
      keys: [
        [0, 'io', { ...SH_COMBAT, pos: [0, 0, 0] }],
        [0.35, 'out', { chest: [0.1, 0.3, 0], spine: [0.15, 0.15, 0], armL: [-0.3, -1.0, 0.4], foreL: [-1.9, 0, 0], stride: [0.1, -0.24, 0.2], pos: [0, 0, -0.08] }],
        [0.52, 'in', { chest: [0.2, -0.5, 0], spine: [0.25, -0.2, 0], armL: [-1.35, -0.55, 0.2], foreL: [-0.75, 0, 0], stride: [0.44, -0.3, 0.2], pos: [0, 0, 0.2] }],
        [0.7, 'out', { armL: [-1.4, -0.55, 0.2] }],
        [1, 'io', { chest: [0.1, -0.3, 0], spine: [0.1, -0.1, 0], armL: [-0.9, -0.8, 0.3], foreL: [-1.3, 0, 0], stride: [0.26, -0.2, 0.12], pos: [0, 0, 0.06] }],
      ],
    },
    block: {
      dur: 0.8, strike: 0.2, fin: 0.18, fout: 0.3,
      keys: [
        [0, 'out', { armL: [-1.25, -0.95, 0.3], foreL: [-1.5, 0, 0], spine: [0.2, -0.1, 0], chest: [0.1, -0.35, 0], head: [0.1, 0.4, 0], stride: [0.2, -0.2, 0.2], armR: [0.3, 0.1, 0.3], foreR: [-1.5, 0, 0] }],
        [1, 'io', { armL: [-1.2, -0.95, 0.3] }],
      ],
    },
  },
};

const DUAL_COMBAT = {
  spine: [0.1, 0.05, 0], chest: [0.08, 0.15, 0], head: [-0.05, -0.2, 0],
  armR: [-0.7, 0.1, 0.3], foreR: [-1.1, 0, 0], handR: [0.6, 0, 0],
  armL: [-0.35, -0.1, 0.35], foreL: [-1.35, 0, 0], handL: [0.3, 0, 0],
  thighL: [0, 0.15, 0.08], thighR: [0, 0.4, 0.1], stride: [0.19, -0.18, 0.11],
};

function dualSlash(side) {
  const A = side === 'R' ? 'armR' : 'armL';
  const F = side === 'R' ? 'foreR' : 'foreL';
  const H = side === 'R' ? 'handR' : 'handL';
  const k = side === 'R' ? 1 : -1;
  return {
    dur: 0.42, strike: 0.48, fout: 0.3,
    keys: [
      [0, 'io', { chest: [0.08, 0.15 * k, 0], spine: [0.1, 0, 0], [A]: [-0.8, 0.1, 0.3], [F]: [-1.2, 0, 0], [H]: [0.4, 0, 0], stride: [0.19, -0.18, 0.11], pos: [0, 0, 0] }],
      [0.3, 'out', { chest: [0, -0.5 * k, 0], spine: [0.02, -0.15 * k, 0], [A]: [-1.9, 0.6, 0.6], [F]: [-1.5, 0, 0], [H]: [-0.2, 0, 0], pos: [0, 0, -0.03] }],
      [0.5, 'in', { chest: [0.2, 0.6 * k, 0], spine: [0.15, 0.25 * k, 0], [A]: [-1.0, -0.75, 0.15], [F]: [-0.25, 0, 0], [H]: [1.05, 0, 0], stride: side === 'R' ? [0.34, -0.24, 0.14] : [0.3, -0.26, 0.14], pos: [0, 0, 0.12] }],
      [0.7, 'out', { chest: [0.2, 0.8 * k, 0], [A]: [-0.5, -1.0, 0.1], [F]: [-0.5, 0, 0] }],
      [1, 'io', { chest: [0.1, 0.3 * k, 0], [A]: [-0.6, -0.3, 0.25], [F]: [-1.0, 0, 0], [H]: [0.6, 0, 0], stride: [0.22, -0.18, 0.11], pos: [0, 0, 0.04] }],
    ],
  };
}

const DUAL = {
  stances: {
    idle: { pose: { ...IDLE, handR: [0.75, 0, 0], handL: [0.75, 0, 0] } },
    combat: { pose: DUAL_COMBAT, armSwing: 0.2, idle: 0.5 },
  },
  tracks: {
    attack: dualSlash('R'),
    attack2: dualSlash('L'),
    heavy: {
      dur: 0.72, strike: 0.52, fout: 0.3,
      keys: [
        [0, 'io', { ...DUAL_COMBAT, pos: [0, 0, 0] }],
        [0.32, 'out', { spine: [0.2, 0, 0], chest: [0.1, 0, 0], armR: [-1.0, -1.1, 0.2], foreR: [-1.7, 0, 0], handR: [0.2, 0, 0], armL: [-1.0, -1.1, 0.2], foreL: [-1.7, 0, 0], handL: [0.2, 0, 0], stride: [0.08, -0.22, 0.24], pos: [0, 0, -0.1] }],
        [0.54, 'in', { spine: [0.3, 0, 0], chest: [0.15, 0, 0], head: [-0.3, 0, 0], armR: [-1.3, 0.5, 0.75], foreR: [-0.2, 0, 0], handR: [1.1, 0, 0], armL: [-1.3, 0.5, 0.75], foreL: [-0.2, 0, 0], handL: [1.1, 0, 0], stride: [0.5, -0.36, 0.2], pos: [0, 0, 0.25] }],
        [0.72, 'out', { armR: [-1.0, 0.8, 0.95], armL: [-1.0, 0.8, 0.95] }],
        [1, 'io', { spine: [0.15, 0, 0], armR: [-0.7, 0.2, 0.4], foreR: [-0.9, 0, 0], handR: [0.6, 0, 0], armL: [-0.6, 0.1, 0.4], foreL: [-1.0, 0, 0], handL: [0.5, 0, 0], stride: [0.26, -0.2, 0.12], pos: [0, 0, 0.08] }],
      ],
    },
    block: {
      dur: 0.6, strike: 0.2, fin: 0.2, fout: 0.3,
      keys: [
        [0, 'out', { armR: [-1.35, -0.75, 0.25], foreR: [-1.3, 0, 0], handR: [0.1, 0, 0.5], armL: [-1.35, -0.75, 0.25], foreL: [-1.3, 0, 0], handL: [0.1, 0, 0.5], spine: [0.15, 0, 0], stride: [0.16, -0.2, 0.17] }],
        [1, 'io', { armR: [-1.3, -0.75, 0.25] }],
      ],
    },
    dodge: {
      dur: 0.5, strike: 0.2, fin: 0.12, fout: 0.35,
      keys: [
        [0, 'io', { pos: [0, -0.05, 0], stride: [0, 0, 0.2], spine: [0.25, 0, 0], root: [0, 0, 0] }],
        [0.45, 'out', { pos: [0.16, -0.16, -0.1], stride: [0.1, -0.28, 0.36], spine: [0.5, 0.4, 0.25], root: [0, 0, 0.28], head: [-0.25, -0.4, 0], armL: [-0.7, 0, 0.8], armR: [0.4, 0, 0.6] }],
        [1, 'io', { pos: [0, 0, 0], stride: [0, 0, 0.1], spine: [0.2, 0, 0], root: [0, 0, 0] }],
      ],
    },
  },
};

const BOW_AIM = {
  pelvis: [0, -0.35, 0], spine: [0, -0.45, 0], chest: [0, -0.6, 0], neck: [0, 0.5, 0], head: [0, 0.85, 0],
  armL: [0, 0, 1.47], foreL: [-0.08, 0, 0], handL: [0, 0, -1.57],
  armR: [-1.3, -0.5, 0.5], foreR: [-2.1, 0, 0],
  thighL: [0, 0.5, 0.1], thighR: [0, 0.3, 0.1], stride: [0.16, -0.14, 0.05],
};

const BOW = {
  ikHand: 'R',
  stances: {
    idle: { pose: { ...IDLE, armL: [0.05, 0, 0.14], foreL: [-0.4, 0, 0], handL: [0.35, 0, 0] } },
    combat: {
      armSwing: 0.15, idle: 0.3,
      pose: {
        spine: [0.05, -0.15, 0], chest: [0.05, -0.3, 0], head: [0, 0.4, 0],
        armL: [-0.55, -0.2, 0.3], foreL: [-0.75, 0, 0], handL: [0.3, 0, -0.6],
        armR: [-0.35, -0.4, 0.2], foreR: [-1.3, 0, 0],
        thighL: [0, 0.3, 0.08], thighR: [0, 0.3, 0.09], stride: [0.16, -0.14, 0.06],
      },
    },
  },
  tracks: {
    shoot: {
      dur: 1.0, strike: 0.66, fin: 0.16, fout: 0.25, ikAux: true,
      keys: [
        [0, 'io', { ...BOW_AIM, aux: [0, 1, 0], pos: [0, 0, 0] }],
        [0.2, 'io', { aux: [0, 1, 0] }],
        [0.55, 'io', { aux: [1, 1, 0], chest: [-0.04, -0.66, 0] }],
        [0.65, 'lin', { aux: [1, 1, 0] }],
        [0.68, 'snap', { aux: [0, 0, 0], armR: [-1.25, -0.2, 0.7], foreR: [-2.0, 0, 0], armL: [0, 0, 1.5], chest: [0, -0.6, 0] }],
        [1, 'io', { aux: [0, 0, 0], armR: [-1.0, -0.2, 0.6], foreR: [-1.6, 0, 0] }],
      ],
    },
    block: {
      dur: 0.6, strike: 0.2, fin: 0.2, fout: 0.3,
      keys: [
        [0, 'out', { armL: [-1.2, -0.6, 0.3], foreL: [-1.2, 0, 0], handL: [0, 0, -0.8], spine: [0.15, 0, 0], stride: [0.1, -0.2, 0.16] }],
        [1, 'io', { armL: [-1.15, -0.6, 0.3] }],
      ],
    },
  },
  alias: { attack: 'shoot', attack2: 'shoot', heavy: 'shoot', cast: 'shoot' },
};

const XBOW_AIM = {
  spine: [0.06, -0.15, 0], chest: [0.06, -0.3, 0], head: [0.05, 0.42, 0.12],
  armR: [-0.62, -0.45, 0.42], foreR: [-1.0, 0, 0], handR: [1.6, 0, 0],
  armL: [-0.8, -0.3, 0.1], foreL: [-0.8, 0, 0],
  thighL: [0, 0.3, 0.08], thighR: [0, 0.35, 0.1], stride: [0.18, -0.15, 0.08],
};

const CROSSBOW = {
  ikHand: 'L',
  stances: {
    idle: { pose: { ...IDLE, armR: [-0.15, -0.3, 0.1], foreR: [-0.8, 0, 0], handR: [1.1, 0.5, 0] }, armSwing: 0.5 },
    combat: { pose: XBOW_AIM, armSwing: 0.05, idle: 0.2, ik: 1 },
  },
  tracks: {
    shoot: {
      dur: 0.7, strike: 0.32, fin: 0.2, fout: 0.3, ik: 1,
      keys: [
        [0, 'io', { ...XBOW_AIM, aux: [0, 0, 0], pos: [0, 0, 0] }],
        [0.3, 'io', { aux: [1, 0, 0], head: [0.08, 0.42, 0.16] }],
        [0.36, 'snap', { aux: [0, 0, 0], armR: [-0.72, -0.45, 0.42], foreR: [-1.12, 0, 0], handR: [1.45, 0, 0], chest: [-0.02, -0.34, 0], spine: [0, -0.15, 0], pos: [0, 0, -0.04] }],
        [0.6, 'io', { armR: [-0.62, -0.45, 0.42], foreR: [-1.0, 0, 0], handR: [1.6, 0, 0], chest: [0.06, -0.3, 0], pos: [0, 0, 0] }],
        [1, 'io', { aux: [0, 0, 0] }],
      ],
    },
    cast: {
      dur: 1.0, strike: 0.4, fin: 0.18, fout: 0.3,
      keys: [
        [0, 'io', { armL: [-0.6, 0, 0.3], foreL: [-1.4, 0, 0], chest: [0, 0.1, 0], head: [0, -0.1, 0] }],
        [0.35, 'back', { armL: [-1.5, 0.1, 0.25], foreL: [-0.2, 0, 0], chest: [0.05, -0.2, 0], head: [-0.1, 0.1, 0] }],
        [0.7, 'io', { armL: [-1.45, 0.2, 0.3], foreL: [-0.3, 0, 0] }],
        [1, 'io', { armL: [-0.6, 0, 0.3], foreL: [-1.2, 0, 0] }],
      ],
    },
  },
  alias: { attack: 'shoot', attack2: 'shoot', heavy: 'shoot' },
};

const DEV_AIM = {
  spine: [0.04, 0.12, 0], chest: [0.04, 0.3, 0], head: [0, -0.4, 0],
  armR: [-1.15, -0.35, 0.2], foreR: [-0.4, 0, 0], handR: [1.55, 0, 0],
  armL: [-0.45, -0.75, 0.1], foreL: [-1.5, 0, 0],
  thighL: [0, 0.2, 0.06], thighR: [0, 0.4, 0.08], stride: [-0.12, 0.16, 0.05],
};

const DEVICE = {
  stances: {
    idle: { pose: { ...IDLE, armR: [-0.1, -0.2, 0.1], foreR: [-1.0, 0, 0], handR: [0.4, 0, 0], armL: [0.25, 0, 0.1], foreL: [-1.2, -0.9, 0] } },
    combat: { pose: DEV_AIM, armSwing: 0.1, idle: 0.3 },
  },
  tracks: {
    cast: {
      dur: 0.9, strike: 0.5, fin: 0.16, fout: 0.3,
      keys: [
        [0, 'io', { ...DEV_AIM, aux: [0, 0, 0], pos: [0, 0, 0] }],
        [0.42, 'io', { aux: [1, 0, 0], armR: [-1.2, -0.35, 0.2], foreR: [-0.3, 0, 0], spine: [0.08, 0.12, 0] }],
        [0.5, 'lin', { aux: [1.4, 0, 0] }],
        [0.56, 'snap', { aux: [0.1, 0, 0], armR: [-1.3, -0.3, 0.25], foreR: [-0.85, 0, 0], handR: [1.25, 0, 0], spine: [-0.06, 0.1, 0], chest: [-0.03, 0.25, 0], pos: [0, 0, -0.05] }],
        [0.8, 'io', { armR: [-1.15, -0.35, 0.2], foreR: [-0.4, 0, 0], handR: [1.55, 0, 0], spine: [0.04, 0.12, 0], pos: [0, 0, 0] }],
        [1, 'io', { aux: [0, 0, 0] }],
      ],
    },
    heavy: {
      dur: 1.3, strike: 0.6, fin: 0.14, fout: 0.25,
      keys: [
        [0, 'io', { ...DEV_AIM, aux: [0, 0, 0], pos: [0, 0, 0], stride: [-0.14, 0.18, 0.1] }],
        [0.25, 'io', { armL: [-1.1, -0.75, 0.1], foreL: [-0.9, 0, 0], aux: [0.4, 0, 0], spine: [0.12, 0.1, 0] }],
        [0.58, 'io', { aux: [1.6, 0, 0], stride: [-0.16, 0.2, 0.16] }],
        [0.64, 'snap', { aux: [0.2, 0, 0], armR: [-1.45, -0.3, 0.3], foreR: [-1.1, 0, 0], handR: [1.1, 0, 0], spine: [-0.14, 0.1, 0], chest: [-0.08, 0.25, 0], pos: [0, 0, -0.1] }],
        [0.85, 'io', { armR: [-1.15, -0.35, 0.2], foreR: [-0.4, 0, 0], handR: [1.55, 0, 0], spine: [0.04, 0.12, 0], pos: [0, 0, 0] }],
        [1, 'io', { aux: [0, 0, 0] }],
      ],
    },
  },
  alias: { attack: 'cast', attack2: 'cast', shoot: 'cast' },
};

const MEDIC = {
  stances: {
    idle: { pose: { ...IDLE, armL: [0.05, 0, 0.12], foreL: [-0.5, 0, 0] } },
    combat: {
      armSwing: 0.2, idle: 0.4,
      pose: {
        spine: [0.06, -0.1, 0], chest: [0.05, -0.25, 0], head: [0, 0.32, 0],
        armR: [-0.7, 0.3, 0.45], foreR: [-1.7, 0, 0], handR: [0.2, 0, 0],
        armL: [-0.7, -0.2, 0.2], foreL: [-0.9, 0, 0],
        thighL: [0, 0.2, 0.07], thighR: [0, 0.4, 0.09], stride: [0.18, -0.16, 0.07],
      },
    },
  },
  tracks: {
    shoot: {
      dur: 0.6, strike: 0.5, fout: 0.3,
      keys: [
        [0, 'io', { spine: [0.05, -0.1, 0], chest: [0.05, -0.25, 0], armR: [-0.8, 0.3, 0.45], foreR: [-1.7, 0, 0], handR: [0.2, 0, 0], armL: [-0.9, -0.2, 0.2], foreL: [-0.6, 0, 0], stride: [0.18, -0.16, 0.07], pos: [0, 0, 0], aux: [0, 0, 0] }],
        [0.32, 'out', { spine: [-0.08, -0.25, 0], chest: [-0.08, -0.5, 0], armR: [-2.0, 0.55, 0.65], foreR: [-2.0, 0, 0], handR: [-0.2, 0, 0], armL: [-1.3, -0.1, 0.2], foreL: [-0.3, 0, 0], pos: [0, 0, -0.04] }],
        [0.5, 'in', { spine: [0.2, 0.2, 0], chest: [0.15, 0.45, 0], armR: [-1.45, -0.3, 0.15], foreR: [-0.15, 0, 0], handR: [1.3, 0, 0], armL: [-0.3, 0, 0.3], foreL: [-1.0, 0, 0], stride: [0.3, -0.24, 0.12], pos: [0, 0, 0.1], aux: [1, 0, 0] }],
        [0.7, 'out', { armR: [-0.9, -0.6, 0.1], foreR: [-0.4, 0, 0], chest: [0.18, 0.6, 0] }],
        [1, 'io', { spine: [0.05, 0, 0], chest: [0.05, 0, 0], armR: [-0.5, 0, 0.3], foreR: [-1.2, 0, 0], handR: [0.4, 0, 0], stride: [0.2, -0.16, 0.08], pos: [0, 0, 0.02], aux: [0, 0, 0] }],
      ],
    },
    cast: {
      dur: 1.3, strike: 0.6, fin: 0.15, fout: 0.25,
      keys: [
        [0, 'io', { spine: [0.2, 0, 0], chest: [0.1, 0, 0], head: [0.25, 0, 0], armL: [-0.9, -0.5, 0.1], foreL: [-1.0, 0, 0], armR: [-0.9, -0.4, 0.1], foreR: [-1.0, 0, 0], handR: [0.4, 0, 0], stride: [0.1, -0.1, 0.1] }],
        [0.25, 'io', { armR: [-1.0, -0.7, 0.1], foreR: [-1.3, 0, 0], armL: [-0.95, -0.4, 0.1], foreL: [-0.9, 0, 0] }],
        [0.45, 'io', { armR: [-0.85, -0.2, 0.15], foreR: [-0.9, 0, 0], armL: [-0.9, -0.6, 0.1], foreL: [-1.1, 0, 0] }],
        [0.65, 'io', { armR: [-1.0, -0.7, 0.1], foreR: [-1.3, 0, 0], armL: [-0.95, -0.4, 0.1], foreL: [-0.9, 0, 0] }],
        [0.85, 'io', { armR: [-0.85, -0.2, 0.15], foreR: [-0.9, 0, 0], armL: [-0.9, -0.6, 0.1], foreL: [-1.1, 0, 0] }],
        [1, 'io', { spine: [0.1, 0, 0], armR: [-0.6, 0, 0.2], foreR: [-1.1, 0, 0], armL: [-0.5, 0, 0.2], foreL: [-1.0, 0, 0] }],
      ],
    },
  },
  alias: { attack: 'shoot', attack2: 'shoot', heavy: 'shoot', use: 'cast' },
};

const POLE_COMBAT = {
  spine: [0.1, 0.15, 0], chest: [0.08, 0.35, 0], head: [-0.04, -0.45, 0],
  armR: [0.25, 0.1, 0.3], foreR: [-1.15, 0, 0], handR: [0.85, -0.2, 0],
  armL: [-0.7, -0.3, 0.2], foreL: [-0.8, 0, 0],
  thighL: [0, 0.1, 0.08], thighR: [0, 0.5, 0.1], stride: [0.22, -0.18, 0.1],
};

const POLEARM = {
  ikHand: 'L',
  stances: {
    idle: { pose: COMMON_STANCES.guard.pose, armSwing: 0.2 },
    combat: { pose: POLE_COMBAT, armSwing: 0.05, idle: 0.3, ik: 1 },
  },
  tracks: {
    attack: {
      dur: 0.7, strike: 0.5, fout: 0.3, ik: 1,
      keys: [
        [0, 'io', { ...POLE_COMBAT, pos: [0, 0, 0] }],
        [0.32, 'out', { chest: [0.02, 0.05, 0], armR: [0.65, 0.1, 0.3], foreR: [-1.45, 0, 0], handR: [0.8, -0.2, 0], pos: [0, 0, -0.07], stride: [0.16, -0.22, 0.12] }],
        [0.52, 'in', { chest: [0.2, 0.7, 0], spine: [0.2, 0.25, 0], head: [-0.05, -0.8, 0], armR: [-0.95, -0.35, 0.15], foreR: [-0.25, 0, 0], handR: [1.2, 0, 0], stride: [0.42, -0.3, 0.18], pos: [0, 0, 0.18] }],
        [0.66, 'out', { armR: [-1.0, -0.35, 0.15] }],
        [1, 'io', { chest: [0.1, 0.4, 0], spine: [0.1, 0.15, 0], armR: [0.1, 0.1, 0.3], foreR: [-1.1, 0, 0], handR: [0.9, -0.2, 0], stride: [0.26, -0.2, 0.11], pos: [0, 0, 0.05] }],
      ],
    },
    attack2: {
      dur: 0.9, strike: 0.5, fout: 0.3, ik: 1,
      keys: [
        [0, 'io', { ...POLE_COMBAT, pos: [0, 0, 0] }],
        [0.34, 'out', { chest: [-0.05, -0.55, 0], spine: [-0.05, -0.25, 0], head: [0, 0.5, 0], armR: [-0.9, 1.0, 0.7], foreR: [-1.3, 0, 0], handR: [0.4, 0, 0], pos: [0, 0, -0.05] }],
        [0.52, 'in', { chest: [0.15, 0.75, 0], spine: [0.12, 0.3, 0], head: [0, -0.7, 0], armR: [-1.0, -0.75, 0.2], foreR: [-0.45, 0, 0], handR: [1.0, 0, 0], stride: [0.36, -0.3, 0.16], pos: [0, 0, 0.12] }],
        [0.7, 'out', { chest: [0.2, 1.0, 0], armR: [-0.8, -1.2, 0.1] }],
        [1, 'io', { chest: [0.12, 0.5, 0], armR: [-0.2, -0.3, 0.25], foreR: [-1.0, 0, 0], handR: [0.9, 0, 0], stride: [0.24, -0.2, 0.1], pos: [0, 0, 0.04] }],
      ],
    },
    heavy: {
      dur: 1.2, strike: 0.56, fout: 0.3, ik: 1,
      keys: [
        [0, 'io', { ...POLE_COMBAT, pos: [0, 0, 0] }],
        [0.4, 'out', { chest: [-0.15, 0.1, 0], spine: [-0.2, 0, 0], head: [0.15, -0.1, 0], armR: [-2.5, 0.1, 0.3], foreR: [-0.9, 0, 0], handR: [0.2, 0, 0], stride: [0.12, -0.2, 0.02], pos: [0, 0.03, -0.06] }],
        [0.58, 'in', { chest: [0.3, 0.3, 0], spine: [0.45, 0.1, 0], head: [-0.3, -0.3, 0], armR: [-0.7, -0.3, 0.15], foreR: [-0.35, 0, 0], handR: [1.25, 0, 0], stride: [0.42, -0.32, 0.22], pos: [0, 0, 0.16] }],
        [0.76, 'out', { spine: [0.5, 0.1, 0], handR: [1.35, 0, 0] }],
        [1, 'io', { chest: [0.15, 0.35, 0], spine: [0.2, 0.1, 0], armR: [0, 0, 0.3], foreR: [-1.0, 0, 0], handR: [0.9, 0, 0], stride: [0.26, -0.2, 0.12], pos: [0, 0, 0.05] }],
      ],
    },
    block: {
      dur: 0.7, strike: 0.2, fin: 0.2, fout: 0.3, ik: 1,
      keys: [
        [0, 'out', { armR: [-0.7, 0.2, 0.5], foreR: [-1.3, 0, 0], handR: [0.2, 0, 0.9], spine: [0.1, 0, 0], chest: [0.05, 0.1, 0], stride: [0.14, -0.2, 0.16] }],
        [1, 'io', { armR: [-0.68, 0.2, 0.5] }],
      ],
    },
  },
};

const UNARMED = {
  stances: {
    combat: {
      armSwing: 0.2, idle: 0.4,
      pose: { ...COMBAT, armR: [-0.6, -0.2, 0.3], foreR: [-1.9, 0, 0], armL: [-0.8, -0.3, 0.25], foreL: [-1.7, 0, 0] },
    },
  },
  tracks: {
    attack: {
      dur: 0.5, strike: 0.45, fout: 0.35,
      keys: [
        [0, 'io', { chest: [0.05, 0.3, 0], armR: [-0.6, -0.2, 0.3], foreR: [-1.9, 0, 0], stride: [0.17, -0.16, 0.07], pos: [0, 0, 0] }],
        [0.28, 'out', { chest: [0, -0.3, 0], armR: [-0.1, 0, 0.4], foreR: [-2.1, 0, 0], pos: [0, 0, -0.03] }],
        [0.48, 'in', { chest: [0.15, 0.6, 0], spine: [0.1, 0.2, 0], armR: [-1.5, -0.3, 0.1], foreR: [-0.1, 0, 0], stride: [0.3, -0.24, 0.12], pos: [0, 0, 0.1] }],
        [1, 'io', { chest: [0.08, 0.3, 0], armR: [-0.7, -0.2, 0.3], foreR: [-1.7, 0, 0], stride: [0.2, -0.17, 0.08], pos: [0, 0, 0.02] }],
      ],
    },
  },
};

/** Style table. A style may override stances/tracks and alias actions; everything else falls back to the commons. */
export const STYLES = {
  unarmed: UNARMED,
  onehand: { stances: {}, tracks: {} },
  greatsword: GREATSWORD,
  maul: { ...GREATSWORD, slow: 1.25 },
  shield: SHIELD,
  dual: DUAL,
  bow: BOW,
  crossbow: CROSSBOW,
  device: DEVICE,
  medic: MEDIC,
  polearm: POLEARM,
};

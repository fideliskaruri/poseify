// The starter pose library.
//
// Poses are authored as per-bone Euler angles in degrees and converted to
// quaternions at load time. Authoring degrees keeps the data readable and
// reviewable; storing quaternions keeps application fast.
//
// Angle conventions for the contract rig (T-pose bind, +X is the model's
// left, +Y up, +Z forward):
//   Arm Z rotation  -> raises or lowers the arm sideways
//   Arm X rotation  -> swings the arm forward or back
//   Elbow Z         -> bends the elbow
//   Leg X           -> swings the leg forward or back
//   Knee X          -> bends the knee (negative bends backward, as knees do)
//
// Measured on the contract rest pose (see tests/pose-derivation): a positive
// UpLeg X rotation swings the thigh BACKWARD (-Z) and a NEGATIVE one swings it
// forward (+Z). With the thigh forward, the knee must fold the shin down,
// which is the OPPOSITE sign again. The Hips bone never translates, so seated
// and kneeling poses also carry an explicit root drop.

import type { Pose, PoseAngles } from "./Pose";
import { anglesToPose, mirrorPose } from "./PoseAuthoring";

interface PoseSpec {
  tags: readonly string[];
  poses: Record<string, PoseAngles>;
  // Root drop applied to every pose in this category, in metres.
  rootOffset?: [number, number, number];
}

// ---------------------------------------------------------------- standing

const STANDING: Record<string, PoseAngles> = {
  attention: {},
  casual: {
    LeftArm: [0, 0, 8],
    RightArm: [0, 0, -8],
    Spine: [0, 0, 2],
  },
  contrapposto: {
    Spine: [0, 4, 3],
    Hips: [0, 0, -3],
    LeftUpLeg: [0, 0, 2],
    RightLeg: [3, 0, 0],
    LeftArm: [0, 0, 6],
    RightArm: [4, 0, -10],
  },
  wide_stance: {
    LeftUpLeg: [0, 0, 14],
    RightUpLeg: [0, 0, -14],
    LeftArm: [0, 0, 16],
    RightArm: [0, 0, -16],
  },
  hands_behind_back: {
    LeftArm: [-18, -22, -18],
    RightArm: [-18, 22, 18],
    LeftForeArm: [0, 0, -32],
    RightForeArm: [0, 0, 32],
    Spine: [-3, 0, 0],
  },
  one_hip_propped: {
    RightUpLeg: [0, 0, -22],
    RightLeg: [12, 0, 0],
    RightFoot: [-10, 0, 0],
    LeftArm: [0, 0, 10],
    RightArm: [10, 0, -8],
    Spine: [0, 3, 2],
  },
  proud_chest: {
    Spine: [-6, 0, 0],
    Spine1: [-4, 0, 0],
    Spine2: [-4, 0, 0],
    LeftShoulder: [0, 0, -4],
    RightShoulder: [0, 0, 4],
    LeftArm: [0, 0, 14],
    RightArm: [0, 0, -14],
  },
  slouch: {
    Spine: [10, 0, 0],
    Spine1: [8, 0, 0],
    Neck: [8, 0, 0],
    LeftShoulder: [0, 0, 6],
    RightShoulder: [0, 0, -6],
  },
  tiptoe: {
    LeftFoot: [-32, 0, 0],
    RightFoot: [-32, 0, 0],
    LeftToeBase: [22, 0, 0],
    RightToeBase: [22, 0, 0],
    LeftLeg: [-6, 0, 0],
    RightLeg: [-6, 0, 0],
    Spine: [-4, 0, 0],
  },
  arms_crossed: {
    LeftArm: [10, 0, 42],
    RightArm: [10, 0, -42],
    LeftForeArm: [0, 0, -74],
    RightForeArm: [0, 0, 74],
    Spine2: [-3, 0, 0],
  },
  hands_on_hips: {
    LeftArm: [6, 0, 26],
    RightArm: [6, 0, -26],
    LeftForeArm: [0, 0, -84],
    RightForeArm: [0, 0, 84],
  },
  ready_stance: {
    Spine: [4, 0, 0],
    LeftUpLeg: [12, 0, 6],
    RightUpLeg: [-8, 0, -6],
    LeftLeg: [-14, 0, 0],
    RightLeg: [-6, 0, 0],
    LeftArm: [22, 0, 18],
    RightArm: [22, 0, -18],
    LeftForeArm: [0, 0, -48],
    RightForeArm: [0, 0, -48],
  },
  weight_shift: {
    Hips: [0, 0, 7],
    Spine: [0, 0, -5],
    LeftUpLeg: [0, 0, 3],
    RightUpLeg: [0, 0, -3],
    LeftArm: [0, 0, 12],
    RightArm: [0, 0, -12],
  },
  arms_folded_stern: {
    LeftArm: [12, 0, 46],
    RightArm: [12, 0, -46],
    LeftForeArm: [0, 0, -86],
    RightForeArm: [0, 0, 86],
    Spine: [-4, 0, 0],
    Neck: [4, 0, 0],
  },
};

// ----------------------------------------------------------------- sitting

const SITTING: Record<string, PoseAngles> = {
  seated_relaxed: {
    LeftUpLeg: [-80, 0, 4],
    RightUpLeg: [-80, 0, -4],
    LeftLeg: [76, 0, 0],
    RightLeg: [76, 0, 0],
    Spine: [-4, 0, 0],
    LeftArm: [12, 0, 8],
    RightArm: [12, 0, -8],
  },
  seated_forward_lean: {
    LeftUpLeg: [-84, 0, 4],
    RightUpLeg: [-84, 0, -4],
    LeftLeg: [80, 0, 0],
    RightLeg: [80, 0, 0],
    Spine: [10, 0, 0],
    Spine1: [8, 0, 0],
    Neck: [6, 0, 0],
    LeftArm: [26, 0, 14],
    RightArm: [26, 0, -14],
  },
  seated_crossed_legs: {
    LeftUpLeg: [-84, 0, 18],
    RightUpLeg: [-84, 0, -6],
    LeftLeg: [78, 0, 0],
    RightLeg: [-94, 14, 0],
    LeftFoot: [-10, 0, 0],
    Spine: [-3, -4, 0],
    LeftArm: [16, 0, 12],
    RightArm: [10, 0, -10],
  },
  seated_legs_together: {
    LeftUpLeg: [-88, 0, 1],
    RightUpLeg: [-88, 0, -1],
    LeftLeg: [84, 0, 0],
    RightLeg: [84, 0, 0],
    LeftArm: [14, 0, 6],
    RightArm: [14, 0, -6],
  },
  seated_hands_on_knees: {
    LeftUpLeg: [-86, 0, 3],
    RightUpLeg: [-86, 0, -3],
    LeftLeg: [82, 0, 0],
    RightLeg: [82, 0, 0],
    LeftArm: [34, 0, 8],
    RightArm: [34, 0, -8],
    LeftForeArm: [0, 0, -14],
    RightForeArm: [0, 0, -14],
  },
  sitting_edge_of_seat: {
    LeftUpLeg: [-82, 0, 5],
    RightUpLeg: [-82, 0, -5],
    LeftLeg: [66, 0, 0],
    RightLeg: [66, 0, 0],
    Spine: [6, 0, 0],
    LeftArm: [8, 0, 14],
    RightArm: [8, 0, -14],
  },
  kneeling_sit_back: {
    LeftUpLeg: [-72, 0, 4],
    RightUpLeg: [-72, 0, -4],
    LeftLeg: [126, 0, 0],
    RightLeg: [126, 0, 0],
    LeftFoot: [-16, 0, 0],
    RightFoot: [-16, 0, 0],
    Spine: [-6, 0, 0],
    LeftArm: [8, 0, 10],
    RightArm: [8, 0, -10],
  },
  sitting_cross_legged_floor: {
    LeftUpLeg: [-58, 12, 18],
    RightUpLeg: [-58, -12, -18],
    LeftLeg: [104, 0, 0],
    RightLeg: [104, 0, 0],
    LeftFoot: [-24, 0, 0],
    RightFoot: [-24, 0, 0],
    Spine: [-4, 0, 0],
    LeftArm: [16, 0, 14],
    RightArm: [16, 0, -14],
  },
};

// ----------------------------------------------------------------- walking

const WALKING: Record<string, PoseAngles> = {
  walk_contact_left: {
    LeftUpLeg: [24, 0, 2],
    LeftLeg: [-6, 0, 0],
    LeftFoot: [-12, 0, 0],
    RightUpLeg: [-18, 0, -2],
    RightLeg: [16, 0, 0],
    RightFoot: [10, 0, 0],
    LeftArm: [-22, 0, 8],
    RightArm: [22, 0, -8],
    LeftForeArm: [0, 0, -22],
    RightForeArm: [0, 0, -22],
    Spine: [3, 0, 0],
  },
  walk_pass_left: {
    LeftUpLeg: [-2, 0, 2],
    LeftLeg: [-16, 0, 0],
    LeftFoot: [4, 0, 0],
    RightUpLeg: [2, 0, -2],
    RightLeg: [-4, 0, 0],
    LeftArm: [0, 0, 8],
    RightArm: [0, 0, -8],
    LeftForeArm: [0, 0, -22],
    RightForeArm: [0, 0, -22],
    Spine: [3, 0, 0],
  },
  walk_pass_right: {
    LeftUpLeg: [-18, 0, 2],
    LeftLeg: [16, 0, 0],
    LeftFoot: [10, 0, 0],
    RightUpLeg: [24, 0, -2],
    RightLeg: [-6, 0, 0],
    RightFoot: [-12, 0, 0],
    LeftArm: [22, 0, 8],
    RightArm: [-22, 0, -8],
    LeftForeArm: [0, 0, -22],
    RightForeArm: [0, 0, -22],
    Spine: [3, 0, 0],
  },
  walk_contact_right: {
    LeftUpLeg: [-18, 0, 2],
    LeftLeg: [16, 0, 0],
    LeftFoot: [10, 0, 0],
    RightUpLeg: [24, 0, -2],
    RightLeg: [-6, 0, 0],
    RightFoot: [-12, 0, 0],
    LeftArm: [22, 0, 8],
    RightArm: [-22, 0, -8],
    Spine: [3, 0, 0],
  },
  walk_rear_view: {
    LeftUpLeg: [-20, 0, 3],
    RightUpLeg: [22, 0, -3],
    LeftLeg: [14, 0, 0],
    RightLeg: [-8, 0, 0],
    LeftArm: [20, 0, 9],
    RightArm: [-20, 0, -9],
    LeftForeArm: [0, 0, -26],
    RightForeArm: [0, 0, -26],
  },
  stride_long: {
    LeftUpLeg: [40, 0, 3],
    LeftLeg: [-8, 0, 0],
    LeftFoot: [-14, 0, 0],
    RightUpLeg: [-28, 0, -3],
    RightLeg: [22, 0, 0],
    RightFoot: [14, 0, 0],
    LeftArm: [-30, 0, 8],
    RightArm: [30, 0, -8],
    LeftForeArm: [0, 0, -18],
    RightForeArm: [0, 0, -18],
    Spine: [5, 0, 0],
  },
  tiptoe_walk: {
    LeftUpLeg: [22, 0, 2],
    RightUpLeg: [-16, 0, -2],
    LeftLeg: [-4, 0, 0],
    RightLeg: [14, 0, 0],
    LeftFoot: [-30, 0, 0],
    RightFoot: [6, 0, 0],
    LeftArm: [-18, 0, 8],
    RightArm: [18, 0, -8],
  },
  side_step: {
    LeftUpLeg: [0, 0, 16],
    RightUpLeg: [0, 0, -6],
    LeftLeg: [-6, 0, 0],
    RightLeg: [-6, 0, 0],
    Hips: [0, 0, -5],
    LeftArm: [0, 0, 12],
    RightArm: [0, 0, -4],
  },
  turn_step: {
    LeftUpLeg: [10, 0, 10],
    RightUpLeg: [-10, 0, -8],
    LeftLeg: [-14, 0, 0],
    RightLeg: [-10, 0, 0],
    Spine: [0, 14, 0],
    LeftArm: [10, 0, 18],
    RightArm: [-10, 0, -14],
  },
};

// ----------------------------------------------------------------- running

const RUNNING: Record<string, PoseAngles> = {
  run_contact_left: {
    LeftUpLeg: [42, 0, 3],
    LeftLeg: [-10, 0, 0],
    LeftFoot: [-16, 0, 0],
    RightUpLeg: [-28, 0, -3],
    RightLeg: [34, 0, 0],
    RightFoot: [16, 0, 0],
    LeftArm: [46, 0, 10],
    RightArm: [-40, 0, -10],
    LeftForeArm: [0, 0, -78],
    RightForeArm: [0, 0, -70],
    Spine: [12, -6, 0],
    Neck: [-8, 0, 0],
  },
  run_pass_left: {
    LeftUpLeg: [4, 0, 3],
    LeftLeg: [-24, 0, 0],
    LeftFoot: [8, 0, 0],
    RightUpLeg: [8, 0, -3],
    RightLeg: [-8, 0, 0],
    LeftArm: [4, 0, 10],
    RightArm: [-4, 0, -10],
    LeftForeArm: [0, 0, -80],
    RightForeArm: [0, 0, -80],
    Spine: [12, 0, 0],
    Neck: [-8, 0, 0],
  },
  run_contact_right: {
    LeftUpLeg: [-28, 0, 3],
    LeftLeg: [34, 0, 0],
    LeftFoot: [16, 0, 0],
    RightUpLeg: [42, 0, -3],
    RightLeg: [-10, 0, 0],
    RightFoot: [-16, 0, 0],
    LeftArm: [-40, 0, 10],
    RightArm: [46, 0, -10],
    LeftForeArm: [0, 0, -70],
    RightForeArm: [0, 0, -78],
    Spine: [12, 6, 0],
    Neck: [-8, 0, 0],
  },
  run_pass_right: {
    LeftUpLeg: [8, 0, 3],
    LeftLeg: [-8, 0, 0],
    RightUpLeg: [4, 0, -3],
    RightLeg: [-24, 0, 0],
    RightFoot: [8, 0, 0],
    LeftArm: [-4, 0, 10],
    RightArm: [4, 0, -10],
    LeftForeArm: [0, 0, -80],
    RightForeArm: [0, 0, -80],
    Spine: [12, 0, 0],
    Neck: [-8, 0, 0],
  },
  sprint_hurdle: {
    LeftUpLeg: [64, 0, 4],
    LeftLeg: [-16, 0, 0],
    RightUpLeg: [-34, 0, -4],
    RightLeg: [46, 0, 0],
    Spine: [18, 0, 0],
    LeftArm: [56, 0, 12],
    RightArm: [-48, 0, -12],
    LeftForeArm: [0, 0, -70],
    RightForeArm: [0, 0, -60],
    Neck: [-12, 0, 0],
  },
  jog_in_place: {
    LeftUpLeg: [16, 0, 3],
    RightUpLeg: [-14, 0, -3],
    LeftLeg: [-12, 0, 0],
    RightLeg: [10, 0, 0],
    LeftFoot: [-6, 0, 0],
    LeftArm: [26, 0, 10],
    RightArm: [-26, 0, -10],
    LeftForeArm: [0, 0, -84],
    RightForeArm: [0, 0, -84],
    Spine: [6, 0, 0],
  },
};

// ---------------------------------------------------------------- fighting

const FIGHTING: Record<string, PoseAngles> = {
  boxing_stance: {
    LeftUpLeg: [12, 0, 8],
    RightUpLeg: [-10, 0, -8],
    LeftLeg: [-14, 0, 0],
    RightLeg: [-12, 0, 0],
    Spine: [6, -12, 0],
    LeftArm: [38, -10, 26],
    RightArm: [42, 8, -22],
    LeftForeArm: [0, 0, -96],
    RightForeArm: [0, 0, -98],
    LeftHand: [0, 0, -10],
    RightHand: [0, 0, 10],
  },
  punch_left_straight: {
    LeftUpLeg: [10, 0, 8],
    RightUpLeg: [-12, 0, -8],
    Spine: [6, 16, 0],
    LeftArm: [-84, 0, 8],
    LeftForeArm: [0, 0, -8],
    RightArm: [40, 8, -22],
    RightForeArm: [0, 0, -98],
  },
  punch_right_hook: {
    LeftUpLeg: [10, 0, 8],
    RightUpLeg: [-10, 0, -8],
    Spine: [6, -26, 0],
    RightArm: [10, -40, -74],
    RightForeArm: [0, 0, -70],
    LeftArm: [40, -10, 26],
    LeftForeArm: [0, 0, -96],
  },
  martial_arts_guard: {
    LeftUpLeg: [16, 0, 10],
    RightUpLeg: [-14, 0, -10],
    LeftLeg: [-16, 0, 0],
    RightLeg: [-14, 0, 0],
    Spine: [6, 0, 0],
    LeftArm: [24, -20, 40],
    RightArm: [26, 20, -38],
    LeftForeArm: [0, 0, -104],
    RightForeArm: [0, 0, -106],
  },
  martial_arts_kick: {
    LeftUpLeg: [8, 0, 10],
    RightUpLeg: [16, 0, -10],
    RightLeg: [-12, 0, 0],
    Spine: [4, -10, 0],
    LeftArm: [30, -20, 44],
    RightArm: [40, 10, -30],
    LeftForeArm: [0, 0, -100],
    RightForeArm: [0, 0, -40],
  },
  high_kick: {
    LeftUpLeg: [10, 0, 10],
    RightUpLeg: [96, 0, -6],
    RightLeg: [-8, 0, 0],
    Spine: [-6, 0, 0],
    LeftArm: [30, 0, 40],
    RightArm: [-20, 0, -20],
    LeftForeArm: [0, 0, -30],
  },
  low_kick: {
    LeftUpLeg: [12, 0, 8],
    RightUpLeg: [28, 0, -8],
    RightLeg: [-24, 0, 0],
    Spine: [10, 0, 0],
    LeftArm: [20, 0, 34],
    RightArm: [10, 0, -18],
  },
  sword_ready: {
    LeftUpLeg: [14, 0, 8],
    RightUpLeg: [-12, 0, -8],
    LeftLeg: [-16, 0, 0],
    RightLeg: [-14, 0, 0],
    Spine: [4, -14, 0],
    RightArm: [54, 12, -26],
    RightForeArm: [0, 0, -58],
    LeftArm: [20, 0, 30],
    LeftForeArm: [0, 0, -80],
  },
  sword_overhead: {
    LeftUpLeg: [10, 0, 8],
    RightUpLeg: [-8, 0, -8],
    Spine: [-8, 0, 0],
    RightArm: [-146, 0, -10],
    RightForeArm: [0, 0, -14],
    LeftArm: [-40, 0, 40],
    LeftForeArm: [0, 0, -60],
  },
  sword_thrust: {
    LeftUpLeg: [26, 0, 10],
    RightUpLeg: [-30, 0, -10],
    RightLeg: [-10, 0, 0],
    Spine: [8, 16, 0],
    RightArm: [-78, 0, -8],
    RightForeArm: [0, 0, -6],
    LeftArm: [24, 0, 34],
    LeftForeArm: [0, 0, -70],
  },
  shield_wall: {
    LeftUpLeg: [10, 0, 8],
    RightUpLeg: [-10, 0, -8],
    Spine: [4, -10, 0],
    LeftArm: [64, -14, 12],
    LeftForeArm: [0, 0, -74],
    RightArm: [20, 0, -18],
    RightForeArm: [0, 0, -30],
  },
  bow_draw: {
    LeftUpLeg: [14, 0, 12],
    RightUpLeg: [-12, 0, -12],
    LeftLeg: [-14, 0, 0],
    RightLeg: [-12, 0, 0],
    Spine: [4, 24, 0],
    LeftArm: [-86, 0, 4],
    LeftForeArm: [0, 0, -4],
    RightArm: [56, 40, -66],
    RightForeArm: [0, 0, -4],
    Head: [0, -30, 0],
  },
  block_overhead: {
    LeftUpLeg: [12, 0, 8],
    RightUpLeg: [-12, 0, -8],
    Spine: [-4, 0, 0],
    LeftArm: [-152, 0, 14],
    RightArm: [-152, 0, -14],
    LeftForeArm: [0, 0, -34],
    RightForeArm: [0, 0, -34],
  },
  stagger_hurt: {
    Spine: [-14, 8, 6],
    Neck: [12, 0, 0],
    LeftArm: [22, 0, 44],
    RightArm: [-16, 0, -30],
    LeftUpLeg: [-14, 0, 6],
    RightLeg: [-18, 0, 0],
  },
  defeated_kneel: {
    LeftUpLeg: [-70, 0, 6],
    RightUpLeg: [-70, 0, -6],
    LeftLeg: [124, 0, 0],
    RightLeg: [124, 0, 0],
    Spine: [16, 0, 0],
    Neck: [14, 0, 0],
    LeftArm: [10, 0, 16],
    RightArm: [10, 0, -16],
  },
  victory_arms_up: {
    LeftArm: [-160, 0, 24],
    RightArm: [-160, 0, -24],
    LeftForeArm: [0, 0, -16],
    RightForeArm: [0, 0, -16],
    Spine: [-8, 0, 0],
    LeftLeg: [-6, 0, 0],
    RightLeg: [-6, 0, 0],
  },
  flex_double_biceps: {
    LeftArm: [10, 0, 96],
    RightArm: [10, 0, -96],
    LeftForeArm: [0, 0, -110],
    RightForeArm: [0, 0, 110],
    LeftUpLeg: [0, 0, 12],
    RightUpLeg: [0, 0, -12],
    Spine: [-4, 0, 0],
  },
};

// ------------------------------------------------------------------ aiming

const AIMING: Record<string, PoseAngles> = {
  aim_pistol_two_hand: {
    LeftUpLeg: [14, 0, 10],
    RightUpLeg: [-14, 0, -10],
    LeftLeg: [-16, 0, 0],
    RightLeg: [-16, 0, 0],
    Spine: [4, -16, 0],
    RightArm: [-80, 0, -10],
    RightForeArm: [0, 0, -12],
    LeftArm: [-76, 24, 22],
    LeftForeArm: [0, 0, -46],
    Head: [0, -14, 0],
  },
  aim_rifle: {
    LeftUpLeg: [16, 0, 12],
    RightUpLeg: [-16, 0, -12],
    LeftLeg: [-18, 0, 0],
    RightLeg: [-18, 0, 0],
    Spine: [10, -20, 0],
    RightArm: [-72, 0, -14],
    RightForeArm: [0, 0, -30],
    LeftArm: [-70, 34, 30],
    LeftForeArm: [0, 0, -70],
    Head: [-4, -18, 0],
  },
  aim_bow: {
    LeftUpLeg: [12, 0, 14],
    RightUpLeg: [-12, 0, -14],
    LeftLeg: [-14, 0, 0],
    RightLeg: [-14, 0, 0],
    Spine: [2, 30, 0],
    LeftArm: [-88, 0, 6],
    LeftForeArm: [0, 0, -6],
    RightArm: [62, 46, -74],
    RightForeArm: [0, 0, -8],
    Head: [0, 34, 0],
  },
  aim_over_shoulder: {
    LeftUpLeg: [18, 0, 12],
    RightUpLeg: [-16, 0, -12],
    LeftLeg: [-18, 0, 0],
    RightLeg: [-16, 0, 0],
    Spine: [8, -26, 0],
    RightArm: [-84, 0, -12],
    RightForeArm: [0, 0, -14],
    LeftArm: [-72, 30, 30],
    LeftForeArm: [0, 0, -60],
    Head: [0, -22, 0],
  },
  aim_crouched: {
    LeftUpLeg: [46, 0, 10],
    RightUpLeg: [42, 0, -10],
    LeftLeg: [-84, 0, 0],
    RightLeg: [-80, 0, 0],
    Spine: [16, -14, 0],
    RightArm: [-76, 0, -10],
    RightForeArm: [0, 0, -14],
    LeftArm: [-72, 22, 24],
    LeftForeArm: [0, 0, -50],
  },
  throw_ready: {
    LeftUpLeg: [16, 0, 12],
    RightUpLeg: [-18, 0, -12],
    RightLeg: [-20, 0, 0],
    Spine: [6, 18, 0],
    RightArm: [-136, 0, -18],
    RightForeArm: [0, 0, -46],
    LeftArm: [30, 0, 26],
    LeftForeArm: [0, 0, -60],
    Head: [0, 12, 0],
  },
};

// ---------------------------------------------------------------- kneeling

const KNEELING: Record<string, PoseAngles> = {
  kneel_upright: {
    LeftUpLeg: [-78, 0, 4],
    RightUpLeg: [-78, 0, -4],
    LeftLeg: [140, 0, 0],
    RightLeg: [140, 0, 0],
    LeftFoot: [-22, 0, 0],
    RightFoot: [-22, 0, 0],
    Spine: [-4, 0, 0],
    LeftArm: [8, 0, 12],
    RightArm: [8, 0, -12],
  },
  kneel_prayer: {
    LeftUpLeg: [-78, 0, 4],
    RightUpLeg: [-78, 0, -4],
    LeftLeg: [140, 0, 0],
    RightLeg: [140, 0, 0],
    LeftFoot: [-22, 0, 0],
    RightFoot: [-22, 0, 0],
    Spine: [-4, 0, 0],
    LeftArm: [-72, 10, 18],
    RightArm: [-72, -10, -18],
    LeftForeArm: [0, 0, -46],
    RightForeArm: [0, 0, 46],
    Head: [6, 0, 0],
  },
  one_knee_raised: {
    LeftUpLeg: [-78, 0, 4],
    RightUpLeg: [72, 0, -4],
    RightLeg: [-96, 0, 0],
    RightFoot: [-16, 0, 0],
    Spine: [-2, 0, 0],
    LeftArm: [8, 0, 12],
    RightArm: [-10, 0, -14],
  },
  kneel_propose: {
    LeftUpLeg: [-78, 0, 4],
    RightUpLeg: [-78, 0, -4],
    LeftLeg: [140, 0, 0],
    RightLeg: [140, 0, 0],
    Spine: [-6, 0, 0],
    LeftArm: [-56, 6, 14],
    RightArm: [-56, -6, -14],
    LeftForeArm: [0, 0, -30],
    RightForeArm: [0, 0, 30],
    Head: [10, 0, 0],
  },
  crouch: {
    LeftUpLeg: [58, 0, 12],
    RightUpLeg: [58, 0, -12],
    LeftLeg: [-104, 0, 0],
    RightLeg: [-104, 0, 0],
    Spine: [18, 0, 0],
    LeftArm: [16, 0, 14],
    RightArm: [16, 0, -14],
  },
  kneel_sit_heels: {
    LeftUpLeg: [-84, 0, 5],
    RightUpLeg: [-84, 0, -5],
    LeftLeg: [146, 0, 0],
    RightLeg: [146, 0, 0],
    LeftFoot: [-26, 0, 0],
    RightFoot: [-26, 0, 0],
    Spine: [-6, 0, 0],
    LeftArm: [6, 0, 10],
    RightArm: [6, 0, -10],
  },
};

// ------------------------------------------------------------------- lying

const LYING: Record<string, PoseAngles> = {
  lie_supine: {
    Hips: [-90, 0, 0],
    Spine: [-4, 0, 0],
    Spine1: [-4, 0, 0],
    Spine2: [-4, 0, 0],
    Neck: [10, 0, 0],
    LeftArm: [0, 0, 68],
    RightArm: [0, 0, -68],
    LeftLeg: [0, 0, 6],
    RightLeg: [0, 0, -6],
  },
  lie_side: {
    Hips: [-90, 0, 62],
    Spine: [0, 0, 4],
    Spine1: [0, 0, 4],
    Spine2: [0, 0, 4],
    LeftArm: [0, 0, 24],
    RightArm: [0, 0, -18],
    LeftLeg: [0, 0, 14],
    RightLeg: [0, 0, -8],
    LeftForeArm: [0, 0, -30],
  },
  lie_stomach: {
    Hips: [-90, 0, 0],
    Spine: [-14, 0, 0],
    Spine1: [-12, 0, 0],
    Spine2: [-10, 0, 0],
    Neck: [34, 0, 0],
    LeftArm: [0, 0, 84],
    RightArm: [0, 0, -84],
    LeftForeArm: [0, 0, -40],
    RightForeArm: [0, 0, -40],
  },
  lie_cradled: {
    Hips: [-90, 0, 0],
    Spine: [6, 0, 0],
    LeftArm: [0, 0, 30],
    RightArm: [0, 0, -30],
    LeftForeArm: [0, 0, -70],
    RightForeArm: [0, 0, -70],
    LeftLeg: [-24, 0, 22],
    RightLeg: [-24, 0, -22],
  },
  sprawl: {
    Hips: [-90, 0, 0],
    Spine: [-6, 0, 0],
    LeftArm: [0, 0, 96],
    RightArm: [0, 0, -96],
    LeftLeg: [0, 0, 18],
    RightLeg: [0, 0, -18],
    Neck: [16, 0, 0],
  },
};

// ----------------------------------------------------------------- dancing

const DANCING: Record<string, PoseAngles> = {
  dance_arms_up: {
    LeftArm: [-140, 0, 26],
    RightArm: [-140, 0, -26],
    Spine: [-6, 0, 0],
    LeftLeg: [0, 0, 8],
    RightLeg: [0, 0, -8],
  },
  dance_hips_sway: {
    Hips: [0, 0, 10],
    Spine: [0, -8, -6],
    Spine1: [0, -6, -4],
    LeftArm: [0, 0, 18],
    RightArm: [0, 0, -18],
    LeftLeg: [0, 0, 10],
    RightLeg: [0, 0, -10],
  },
  dance_one_leg_up: {
    LeftUpLeg: [56, 0, 8],
    LeftLeg: [-64, 0, 0],
    RightUpLeg: [0, 0, -6],
    RightLeg: [-6, 0, 0],
    Spine: [0, 6, 0],
    LeftArm: [-24, 0, 30],
    RightArm: [24, 0, -30],
  },
  dance_twist: {
    Hips: [0, 22, 0],
    Spine: [0, -14, 0],
    Spine1: [0, -8, 0],
    LeftArm: [0, 0, 24],
    RightArm: [0, 0, -16],
    LeftLeg: [0, 0, 8],
    RightLeg: [0, 0, -8],
  },
  dance_bow: {
    Spine: [22, 0, 0],
    Spine1: [16, 0, 0],
    Spine2: [12, 0, 0],
    Neck: [-10, 0, 0],
    LeftArm: [30, 0, 16],
    RightArm: [30, 0, -16],
    LeftForeArm: [0, 0, -20],
    RightForeArm: [0, 0, -20],
    LeftLeg: [0, 0, 6],
    RightLeg: [0, 0, -6],
  },
  dance_reach_high: {
    LeftArm: [-158, 0, 18],
    RightArm: [-40, 0, -30],
    Spine: [-6, 0, 6],
    LeftLeg: [0, 0, 10],
    RightLeg: [0, 0, -10],
  },
  dance_low_squat: {
    LeftUpLeg: [56, 0, 22],
    RightUpLeg: [56, 0, -22],
    LeftLeg: [-100, 0, 0],
    RightLeg: [-100, 0, 0],
    Spine: [16, 0, 0],
    LeftArm: [30, 0, 26],
    RightArm: [30, 0, -26],
    LeftForeArm: [0, 0, -30],
    RightForeArm: [0, 0, -30],
  },
  dance_grand_spread: {
    LeftArm: [-20, 0, 78],
    RightArm: [-20, 0, -78],
    LeftForeArm: [0, 0, -10],
    RightForeArm: [0, 0, -10],
    Spine: [-6, 0, 0],
    LeftLeg: [0, 0, 12],
    RightLeg: [0, 0, -12],
  },
  dance_point: {
    LeftArm: [0, 0, 16],
    RightArm: [-84, 0, -14],
    RightForeArm: [0, 0, -4],
    Spine: [4, -8, 0],
    Head: [0, -8, 0],
    LeftLeg: [0, 0, 8],
    RightLeg: [0, 0, -8],
  },
  dance_lean_back: {
    Spine: [-18, 0, 0],
    Spine1: [-12, 0, 0],
    Neck: [16, 0, 0],
    LeftArm: [0, 0, 34],
    RightArm: [0, 0, -34],
    LeftUpLeg: [-10, 0, 8],
    RightUpLeg: [-10, 0, -8],
  },
};

// ----------------------------------------------------------------- gesture

const GESTURE: Record<string, PoseAngles> = {
  wave_hello: {
    LeftArm: [-84, 0, 22],
    LeftForeArm: [0, 0, -28],
    LeftHand: [0, 0, -24],
    Spine: [0, 4, 0],
    Head: [0, 6, -6],
    RightArm: [4, 0, -8],
  },
  wave_big: {
    LeftArm: [-96, 0, 30],
    LeftForeArm: [0, 0, -36],
    LeftHand: [0, 0, -30],
    Spine: [-4, 8, 0],
    Neck: [-6, 6, 0],
    RightArm: [10, 0, -14],
    RightForeArm: [0, 0, -30],
  },
  thumbs_up: {
    RightArm: [-52, 0, -16],
    RightForeArm: [0, 0, -74],
    RightHand: [0, 0, 30],
    LeftArm: [6, 0, 12],
    Spine: [0, -4, 0],
  },
  point_forward: {
    RightArm: [-84, 0, -10],
    RightForeArm: [0, 0, -6],
    Spine: [0, -10, 0],
    Head: [0, -10, 0],
    LeftArm: [8, 0, 12],
  },
  shrug: {
    LeftShoulder: [0, 0, -14],
    RightShoulder: [0, 0, 14],
    LeftArm: [10, 0, 30],
    RightArm: [10, 0, -30],
    LeftForeArm: [0, 0, -54],
    RightForeArm: [0, 0, 54],
    Neck: [10, 0, 0],
  },
  hands_open_palms_up: {
    LeftArm: [36, 0, 24],
    RightArm: [36, 0, -24],
    LeftForeArm: [0, 0, -30],
    RightForeArm: [0, 0, 30],
    Spine: [-4, 0, 0],
  },
  arms_out_presented: {
    LeftArm: [-16, 0, 62],
    RightArm: [-16, 0, -62],
    LeftForeArm: [0, 0, -20],
    RightForeArm: [0, 0, 20],
    Spine: [-4, 0, 0],
  },
  thinking_hand_chin: {
    RightArm: [-64, 0, -22],
    RightForeArm: [0, 0, -96],
    Head: [6, -10, 0],
    Spine: [4, -6, 0],
    LeftArm: [8, 0, 14],
    LeftForeArm: [0, 0, -40],
  },
  look_back_over_shoulder: {
    Spine: [0, 34, 0],
    Spine1: [0, 20, 0],
    Neck: [0, 22, 0],
    Head: [0, 26, 0],
    LeftArm: [6, 0, 10],
    RightArm: [6, 0, -10],
    LeftUpLeg: [0, 0, 6],
    RightUpLeg: [0, 0, -6],
  },
  hands_on_face: {
    LeftArm: [-70, 14, 16],
    RightArm: [-70, -14, -16],
    LeftForeArm: [0, 0, -86],
    RightForeArm: [0, 0, 86],
    Head: [12, 0, 0],
  },
  applause: {
    LeftArm: [-64, 20, 24],
    RightArm: [-64, -20, -24],
    LeftForeArm: [0, 0, -46],
    RightForeArm: [0, 0, 46],
    Spine: [-4, 0, 0],
  },
  victory_salute: {
    RightArm: [-136, 0, -30],
    RightForeArm: [0, 0, -96],
    LeftArm: [12, 0, 14],
    Spine: [-4, 0, 0],
  },
};

const CATEGORIES: PoseSpec[] = [
  { tags: ["standing"], poses: STANDING },
  // Seated: the root drops so the hips meet a 0.45 m seat.
  { tags: ["sitting"], poses: SITTING, rootOffset: [0, -0.5, 0] },
  { tags: ["walking"], poses: WALKING },
  { tags: ["running"], poses: RUNNING },
  { tags: ["fighting"], poses: FIGHTING },
  { tags: ["aiming"], poses: AIMING },
  // Kneeling: the root drops so the shins meet the floor.
  { tags: ["kneeling"], poses: KNEELING, rootOffset: [0, -0.45, 0] },
  { tags: ["lying"], poses: LYING },
  { tags: ["dancing"], poses: DANCING },
  { tags: ["gesture"], poses: GESTURE },
];

function titleise(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function buildLibrary(): Pose[] {
  const out: Pose[] = [];
  for (const { tags, poses, rootOffset } of CATEGORIES) {
    for (const [key, angles] of Object.entries(poses)) {
      out.push({
        id: key,
        name: titleise(key),
        tags,
        bones: anglesToPose(angles),
        ...(rootOffset ? { rootOffset } : {}),
        source: "authored",
      });
    }
  }

  // Mirrored variants widen the usable library cheaply and exercise the
  // left/right swap that pose transfer depends on.
  const extras: { id: string; name: string; tags: string[]; base: string }[] = [
    {
      id: "wave_hello_right",
      name: "Wave Hello (Right)",
      tags: ["gesture"],
      base: "wave_hello",
    },
    {
      id: "point_forward_left",
      name: "Point Forward (Left)",
      tags: ["gesture"],
      base: "point_forward",
    },
    {
      id: "thumbs_up_left",
      name: "Thumbs Up (Left)",
      tags: ["gesture"],
      base: "thumbs_up",
    },
    {
      id: "punch_right_straight",
      name: "Punch Right Straight",
      tags: ["fighting"],
      base: "punch_left_straight",
    },
    {
      id: "high_kick_left",
      name: "High Kick (Left)",
      tags: ["fighting"],
      base: "high_kick",
    },
  ];

  for (const extra of extras) {
    const base = out.find((p) => p.id === extra.base);
    if (!base) continue;
    out.push({
      id: extra.id,
      name: extra.name,
      tags: extra.tags,
      bones: mirrorPose(base.bones),
      source: "authored",
    });
  }

  return out;
}

/** The shipped pose library. */
export const POSE_LIBRARY: readonly Pose[] = buildLibrary();

export function findPoseById(id: string): Pose | undefined {
  return POSE_LIBRARY.find((p) => p.id === id);
}


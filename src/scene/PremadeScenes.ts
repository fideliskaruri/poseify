// Premade scenes: named bundles of models, poses, props, camera and light.
//
// Authored as scene data rather than baked objects so they compose with the
// rest of the app: loading one restores exactly the state a user would have
// built by hand, and can then be edited and saved.

import { POSE_LIBRARY } from "../pose/PoseLibrary";
import type { PoseData } from "../posing/PosableSkeleton";
import { SCENE_FORMAT_VERSION, type SceneState } from "./Scene";

interface SceneSpec {
  name: string;
  description: string;
  models: { id: string; pose: string; x?: number }[];
  props?: { id: string; x: number; z?: number }[];
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    fov?: number;
  };
  light?: Partial<SceneState["light"]>;
  grid?: Partial<SceneState["grid"]>;
}

function pose(id: string): PoseData {
  const found = POSE_LIBRARY.find((p) => p.id === id);
  if (!found) throw new Error(`Premade scene references unknown pose: ${id}`);
  return found.bones;
}

function poseRootOffset(id: string): [number, number, number] | undefined {
  return POSE_LIBRARY.find((p) => p.id === id)?.rootOffset;
}

const SPECS: SceneSpec[] = [
  {
    name: "Neutral T-Pose",
    description: "A single mannequin in the bind pose, framed straight on.",
    models: [{ id: "mannequin_male", pose: "attention", x: 0 }],
    camera: { position: [0, 1.1, 3.4], target: [0, 0.95, 0] },
  },
  {
    name: "Two Models Comparison",
    description: "Mannequin and realistic woman side by side.",
    models: [
      { id: "mannequin_male", pose: "attention", x: -0.6 },
      { id: "realistic_woman", pose: "attention", x: 0.6 },
    ],
    camera: { position: [0, 1.2, 4], target: [0, 0.95, 0] },
  },
  {
    name: "Seated Portrait",
    description: "A figure seated on a chair, three-quarter view.",
    models: [{ id: "realistic_woman", pose: "seated_relaxed", x: 0 }],
    props: [{ id: "chair", x: 0, z: 0.35 }],
    camera: { position: [1.8, 1.4, 2.2], target: [0, 0.8, 0] },
  },
  {
    name: "Seated Forward Lean",
    description: "Leaning forward on a chair.",
    models: [{ id: "mannequin_male", pose: "seated_forward_lean", x: 0 }],
    props: [{ id: "chair", x: 0, z: 0.3 }],
    camera: { position: [1.6, 1.3, 2.4], target: [0, 0.8, 0] },
  },
  {
    name: "Standing at a Table",
    description: "A figure behind a table.",
    models: [{ id: "realistic_woman", pose: "attention", x: 0 }],
    props: [{ id: "table", x: 0, z: -0.9 }],
    camera: { position: [0.2, 1.4, 3.2], target: [0, 1, -0.3] },
  },
  {
    name: "Casual Conversation",
    description: "Two figures standing with relaxed body language.",
    models: [
      { id: "realistic_woman", pose: "casual", x: -0.7 },
      { id: "realistic_muscular_male", pose: "casual", x: 0.7 },
    ],
    camera: { position: [0, 1.3, 3.6], target: [0, 0.95, 0] },
  },
  {
    name: "Hands on Hips",
    description: "A confident stance for character reference.",
    models: [{ id: "realistic_muscular_male", pose: "hands_on_hips", x: 0 }],
    camera: { position: [0, 1.1, 3], target: [0, 0.95, 0] },
  },
  {
    name: "Arms Crossed",
    description: "Closed posture, useful for attitude reference.",
    models: [{ id: "stocky_male", pose: "arms_crossed", x: 0 }],
    camera: { position: [0, 1.1, 3], target: [0, 0.95, 0] },
  },
  {
    name: "Contrapposto",
    description: "Weight shifted onto one leg, a classic art pose.",
    models: [{ id: "realistic_woman", pose: "contrapposto", x: 0 }],
    camera: { position: [2.2, 1.1, 2], target: [0, 0.9, 0] },
  },
  {
    name: "One Hip Propped",
    description: "Casual lean with a hand on the hip.",
    models: [{ id: "anime_female", pose: "one_hip_propped", x: 0 }],
    camera: { position: [-1.8, 1.2, 2.2], target: [0, 0.9, 0] },
  },
  {
    name: "Proud Chest",
    description: "Chest forward, shoulders back.",
    models: [{ id: "realistic_muscular_male", pose: "proud_chest", x: 0 }],
    camera: { position: [0, 1.1, 2.8], target: [0, 1.05, 0] },
  },
  {
    name: "Wide Stance",
    description: "Feet planted wide for a grounded read.",
    models: [{ id: "brute_male", pose: "wide_stance", x: 0 }],
    camera: { position: [0, 1.2, 3.6], target: [0, 1, 0] },
  },
  {
    name: "Walk Contact",
    description: "A walk cycle caught at the contact frame.",
    models: [{ id: "mannequin_male", pose: "walk_contact_left", x: 0 }],
    camera: { position: [2.4, 1.1, 2.4], target: [0, 0.9, 0] },
  },
  {
    name: "Walk Pass",
    description: "A walk cycle at the passing frame.",
    models: [{ id: "mannequin_male", pose: "walk_pass_left", x: 0 }],
    camera: { position: [0, 1.1, 3.2], target: [0, 0.9, 0] },
  },
  {
    name: "Long Stride",
    description: "An exaggerated stride for motion reference.",
    models: [{ id: "realistic_muscular_male", pose: "stride_long", x: 0 }],
    camera: { position: [2.6, 1, 2], target: [0, 0.9, 0] },
  },
  {
    name: "Run Contact",
    description: "A run caught at ground contact, deep lean.",
    models: [{ id: "realistic_muscular_male", pose: "run_contact_left", x: 0 }],
    camera: { position: [2.6, 1.1, 2.2], target: [0, 1, 0] },
  },
  {
    name: "Run Pass",
    description: "The passing frame of a run.",
    models: [{ id: "realistic_muscular_male", pose: "run_pass_left", x: 0 }],
    camera: { position: [2.4, 1.1, 2.4], target: [0, 1, 0] },
  },
  {
    name: "Sprint Hurdle",
    description: "Maximum extension, good for action poses.",
    models: [{ id: "brute_male", pose: "sprint_hurdle", x: 0 }],
    camera: { position: [2.8, 1.2, 2], target: [0, 1.1, 0] },
  },
  {
    name: "Boxing Stance",
    description: "Guard up, weight back.",
    models: [{ id: "realistic_muscular_male", pose: "boxing_stance", x: 0 }],
    camera: { position: [1.8, 1.2, 2.4], target: [0, 1, 0] },
  },
  {
    name: "Straight Punch",
    description: "A lead-hand punch fully extended.",
    models: [{ id: "realistic_muscular_male", pose: "punch_left_straight", x: 0 }],
    camera: { position: [2.4, 1.2, 2.4], target: [0, 1.1, 0] },
  },
  {
    name: "Martial Arts Guard",
    description: "Defensive guard with a bladed stance.",
    models: [{ id: "skinny_male", pose: "martial_arts_guard", x: 0 }],
    camera: { position: [1.8, 1.2, 2.6], target: [0, 1, 0] },
  },
  {
    name: "High Kick",
    description: "A high kick, good for flexibility reference.",
    models: [{ id: "skinny_female", pose: "high_kick", x: 0 }],
    camera: { position: [2.8, 1.3, 2.2], target: [0, 1.1, 0] },
  },
  {
    name: "Sword Ready",
    description: "A two-handed guard with a prop sword.",
    models: [{ id: "realistic_muscular_male", pose: "sword_ready", x: 0 }],
    props: [{ id: "sword", x: 0.5, z: 0 }],
    camera: { position: [2, 1.2, 2.4], target: [0, 1, 0] },
  },
  {
    name: "Sword Overhead",
    description: "Blade raised, ready to strike.",
    models: [{ id: "realistic_muscular_male", pose: "sword_overhead", x: 0 }],
    props: [{ id: "sword", x: 0.5, z: 0 }],
    camera: { position: [2, 1.4, 2.4], target: [0, 1.2, 0] },
  },
  {
    name: "Shield Wall",
    description: "A braced defensive posture.",
    models: [{ id: "brute_male", pose: "shield_wall", x: 0 }],
    props: [{ id: "crate", x: -0.7, z: 0.4 }],
    camera: { position: [1.8, 1.2, 2.4], target: [0, 1, 0] },
  },
  {
    name: "Aim Pistol",
    description: "Two-handed pistol aim, arms extended.",
    models: [{ id: "stocky_male", pose: "aim_pistol_two_hand", x: 0 }],
    camera: { position: [2.2, 1.2, 2.4], target: [0, 1.1, 0] },
  },
  {
    name: "Aim Rifle",
    description: "Shouldered rifle aim.",
    models: [{ id: "brute_male", pose: "aim_rifle", x: 0 }],
    camera: { position: [2.4, 1.2, 2.4], target: [0, 1.1, 0] },
  },
  {
    name: "Aim Crouched",
    description: "A low crouched aim.",
    models: [{ id: "skinny_male", pose: "aim_crouched", x: 0 }],
    camera: { position: [2.2, 0.9, 2.6], target: [0, 0.7, 0] },
  },
  {
    name: "Kneeling Upright",
    description: "Kneeling on both knees.",
    models: [{ id: "mannequin_male", pose: "kneel_upright", x: 0 }],
    camera: { position: [1.8, 0.9, 2.2], target: [0, 0.5, 0] },
  },
  {
    name: "Kneel Prayer",
    description: "A kneeling prayer pose.",
    models: [{ id: "realistic_woman", pose: "kneel_prayer", x: 0 }],
    camera: { position: [1.8, 0.9, 2.2], target: [0, 0.5, 0] },
  },
  {
    name: "Cross Legged Floor",
    description: "Sitting cross-legged on the ground.",
    models: [{ id: "anime_female", pose: "sitting_cross_legged_floor", x: 0 }],
    camera: { position: [1.6, 0.8, 2], target: [0, 0.4, 0] },
  },
  {
    name: "Lying Supine",
    description: "Lying on the back, viewed from above.",
    models: [{ id: "mannequin_male", pose: "lie_supine", x: 0 }],
    camera: { position: [0.2, 3.2, 1.6], target: [0, 0.1, 0] },
    light: { elevation: 70, intensity: 2.8 },
  },
  {
    name: "Lying Side",
    description: "Lying on one side.",
    models: [{ id: "realistic_woman", pose: "lie_side", x: 0 }],
    camera: { position: [2.4, 1.6, 1.4], target: [0, 0.2, 0] },
  },
  {
    name: "Waving Hello",
    description: "A friendly wave.",
    models: [{ id: "realistic_woman", pose: "wave_hello", x: 0 }],
    camera: { position: [1.4, 1.2, 2.4], target: [0, 1, 0] },
  },
  {
    name: "Thumbs Up",
    description: "A thumbs-up gesture.",
    models: [{ id: "realistic_muscular_male", pose: "thumbs_up", x: 0 }],
    camera: { position: [1.4, 1.2, 2.4], target: [0, 1, 0] },
  },
  {
    name: "Pointing Forward",
    description: "A directional point.",
    models: [{ id: "mannequin_male", pose: "point_forward", x: 0 }],
    camera: { position: [0.2, 1.2, 3], target: [0, 1, 0] },
  },
  {
    name: "Shrugging",
    description: "A shrug with both palms up.",
    models: [{ id: "anime_basic_male", pose: "shrug", x: 0 }],
    camera: { position: [0, 1.2, 2.8], target: [0, 1, 0] },
  },
  {
    name: "Thinking",
    description: "A hand on the chin.",
    models: [{ id: "skinny_male", pose: "thinking_hand_chin", x: 0 }],
    camera: { position: [1.6, 1.3, 2.2], target: [0, 1.05, 0] },
  },
  {
    name: "Looking Back",
    description: "Head turned over the shoulder.",
    models: [{ id: "realistic_woman", pose: "look_back_over_shoulder", x: 0 }],
    camera: { position: [-1.8, 1.2, 2.2], target: [0, 1.05, 0] },
  },
  {
    name: "Applause",
    description: "Hands together, clapping.",
    models: [{ id: "anime_female", pose: "applause", x: 0 }],
    camera: { position: [0, 1.2, 2.6], target: [0, 1, 0] },
  },
  {
    name: "Dance Arms Up",
    description: "A dance pose with both arms raised.",
    models: [{ id: "anime_female", pose: "dance_arms_up", x: 0 }],
    camera: { position: [0, 1.3, 3], target: [0, 1.05, 0] },
  },
  {
    name: "Dance Hips Sway",
    description: "A hip-swaying dance pose.",
    models: [{ id: "anime_female", pose: "dance_hips_sway", x: 0 }],
    camera: { position: [1.8, 1.1, 2.4], target: [0, 0.95, 0] },
  },
  {
    name: "Dance Bow",
    description: "A formal bow.",
    models: [{ id: "realistic_muscular_male", pose: "dance_bow", x: 0 }],
    camera: { position: [0, 1.3, 3], target: [0, 0.9, 0] },
  },
  {
    name: "Group Lineup",
    description: "Four models of different builds standing together.",
    models: [
      { id: "skinny_male", pose: "attention", x: -1.5 },
      { id: "mannequin_male", pose: "attention", x: -0.5 },
      { id: "realistic_muscular_male", pose: "attention", x: 0.5 },
      { id: "brute_male", pose: "attention", x: 1.5 },
    ],
    camera: { position: [0, 1.3, 5], target: [0, 1, 0] },
  },
  {
    name: "Cafe Corner",
    description: "A figure at a table with a chair, for staging.",
    models: [{ id: "realistic_woman", pose: "seated_relaxed", x: -0.4 }],
    props: [
      { id: "chair", x: -0.4, z: 0.3 },
      { id: "table", x: -0.4, z: -0.8 },
      { id: "barrel", x: 1.2, z: -0.6 },
    ],
    camera: { position: [2, 1.5, 2.8], target: [-0.2, 0.9, 0] },
  },
  {
    name: "Duelling",
    description: "Two figures in fighting stances facing off.",
    models: [
      { id: "realistic_muscular_male", pose: "boxing_stance", x: -0.9 },
      { id: "skinny_male", pose: "martial_arts_guard", x: 0.9 },
    ],
    camera: { position: [0, 1.3, 4], target: [0, 1, 0] },
  },
  {
    name: "Low Key Lighting",
    description: "A single figure under a low, raking light.",
    models: [{ id: "realistic_woman", pose: "attention", x: 0 }],
    camera: { position: [1.6, 1, 2.6], target: [0, 0.95, 0] },
    light: { azimuth: 300, elevation: 12, intensity: 3.2, castShadows: true },
  },
  {
    name: "Overhead Study",
    description: "A top-down view for proportion and silhouette work.",
    models: [{ id: "mannequin_male", pose: "attention", x: 0 }],
    camera: { position: [0, 4, 0.6], target: [0, 0.9, 0], fov: 40 },
    grid: { visible: true, cellSize: 0.5, divisions: 60, opacity: 0.4 },
  },
];

export interface PremadeScene extends SceneState {
  description: string;
}

function buildScene(spec: SceneSpec): PremadeScene {
  return {
    version: SCENE_FORMAT_VERSION,
    name: spec.name,
    description: spec.description,
    models: spec.models.map((m) => ({
      id: m.id,
      pose: pose(m.pose),
      rootOffset: poseRootOffset(m.pose),
      position: [m.x ?? 0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: 1,
    })),
    props: (spec.props ?? []).map((p) => ({
      id: p.id,
      position: [p.x, 0, p.z ?? 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })),
    camera: {
      position: spec.camera.position,
      target: spec.camera.target,
      fov: spec.camera.fov ?? 50,
    },
    light: {
      azimuth: 40,
      elevation: 55,
      intensity: 2.4,
      distance: 9,
      castShadows: true,
      ...(spec.light ?? {}),
    },
    grid: {
      visible: true,
      cellSize: 1,
      divisions: 40,
      opacity: 0.55,
      ...(spec.grid ?? {}),
    },
  };
}

/** The shipped premade scenes. */
export const PREMADE_SCENES: readonly PremadeScene[] = SPECS.map(buildScene);

export function findPremadeScene(name: string): PremadeScene | undefined {
  return PREMADE_SCENES.find((s) => s.name === name);
}


// OpenPose (COCO-18) keypoint extraction.
//
// This is the highest-stakes correctness surface in the app: a wrong joint
// order produces a plausible-looking image that is silently useless downstream
// in ControlNet. The ordering is defined once here and asserted by tests
// rather than written inline at the call site.

import * as THREE from "three";
import type { PosableSkeleton } from "../posing/PosableSkeleton";

/**
 * COCO-18 body keypoints, in the exact order ControlNet expects.
 * This is the OpenPose body convention trimmed to the 18 joints every
 * pose-conditioning model consumes.
 */
export const COCO18 = [
  "Nose",
  "LeftEye",
  "RightEye",
  "LeftEar",
  "RightEar",
  "LeftShoulder",
  "RightShoulder",
  "LeftElbow",
  "RightElbow",
  "LeftWrist",
  "RightWrist",
  "LeftHip",
  "RightHip",
  "LeftKnee",
  "RightKnee",
  "LeftAnkle",
  "RightAnkle",
  "Neck",
] as const;

export type Coco18Name = (typeof COCO18)[number];

/**
 * Rig-contract bone supplying each COCO-18 keypoint.
 *
 * The rig has no dedicated nose/eye/ear bones, so those derive from the head
 * bone plus a fixed head-space offset. Everything else maps to a real joint,
 * which keeps output stable across model proportions.
 */
export const COCO18_SOURCE: Readonly<Record<Coco18Name, string>> = {
  Nose: "Head",
  LeftEye: "Head",
  RightEye: "Head",
  LeftEar: "Head",
  RightEar: "Head",
  LeftShoulder: "LeftShoulder",
  RightShoulder: "RightShoulder",
  LeftElbow: "LeftForeArm",
  RightElbow: "RightForeArm",
  LeftWrist: "LeftHand",
  RightWrist: "RightHand",
  LeftHip: "LeftUpLeg",
  RightHip: "RightUpLeg",
  LeftKnee: "LeftLeg",
  RightKnee: "RightLeg",
  LeftAnkle: "LeftFoot",
  RightAnkle: "RightFoot",
  Neck: "Neck",
};

/**
 * Head-local offsets for the five face keypoints in metres, in the head
 * bone's local space. Scaled by head size at extraction time so chibi and
 * adult heads both work.
 */
const FACE_OFFSETS: Readonly<
  Partial<Record<Coco18Name, [number, number, number]>>
> = {
  Nose: [0, 0.02, 0.16],
  LeftEye: [0.035, 0.06, 0.14],
  RightEye: [-0.035, 0.06, 0.14],
  LeftEar: [0.085, 0.02, 0.02],
  RightEar: [-0.085, 0.02, 0.02],
};

export interface Keypoint2D {
  name: Coco18Name;
  x: number;
  y: number;
  // Model-space position, useful for debugging and the OBJ pass.
  model: THREE.Vector3;
}

/** The 17 bones of the COCO-18 stick figure, as COCO18 index pairs. */
export const COCO18_LIMBS: readonly (readonly [number, number])[] = [
  [1, 2],
  [1, 5],
  [2, 3],
  [3, 4],
  [5, 6],
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10],
  [5, 11],
  [11, 12],
  [6, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [17, 1],
];

export interface Keypoint2DOptions {
  /**
   * Scale factor for face offsets. Callers pass the head's world scale so the
   * same numbers suit chibi and adult heads.
   */
  headScale?: number;
}

/**
 * Project a posed skeleton into COCO-18 keypoints in normalised image
 * coordinates (0..1, y down, matching the OpenPose image convention).
 */
export function extractCoco18(
  skeleton: PosableSkeleton,
  camera: THREE.Camera,
  options: Keypoint2DOptions = {},
): Keypoint2D[] {
  skeleton.root.updateMatrixWorld(true);

  const headBone = skeleton.getBone("Head");
  const headScale =
    options.headScale ?? (headBone ? headBone.scale.length() : 1);

  const world = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const out: Keypoint2D[] = [];

  for (const name of COCO18) {
    const sourceBone = skeleton.getBone(COCO18_SOURCE[name]);
    if (!sourceBone) {
      out.push({ name, x: 0, y: 0, model: world.clone() });
      continue;
    }

    sourceBone.getWorldPosition(world);

    const faceOffset = FACE_OFFSETS[name];
    if (faceOffset) {
      const offset = new THREE.Vector3(...faceOffset).multiplyScalar(
        Math.max(headScale, 0.001),
      );
      sourceBone.getWorldQuaternion(quat);
      world.add(offset.applyQuaternion(quat));
    }

    ndc.copy(world).project(camera);
    out.push({
      name,
      // NDC runs -1..1 with y up; OpenPose images are 0..1 with y down.
      x: (ndc.x + 1) / 2,
      y: (1 - ndc.y) / 2,
      model: world.clone(),
    });
  }

  return out;
}

/** Index into COCO18 for a named keypoint, or -1 when absent. */
export function coco18Index(name: string): number {
  return (COCO18 as readonly string[]).indexOf(name);
}

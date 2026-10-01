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
 * Hand keypoints appended after the 18 body joints.
 *
 * PoseMy.Art exports OpenPose twice, with and without hands, because different
 * downstream consumers need different things: ControlNet's openpose
 * conditioning historically ignores fingers, while hand-pose pipelines and
 * some SDXL variants do consume them. Rather than a second image format, the
 * two variants share this one ordered list and differ only by where they stop.
 *
 * Order is fingers-then-thumb per hand, proximal to distal, following the
 * OpenPose BODY_25 hand convention.
 */
export const HAND_KEYPOINTS: readonly string[] = [
  "LeftHandIndex1", "LeftHandIndex2", "LeftHandIndex3",
  "LeftHandMiddle1", "LeftHandMiddle2", "LeftHandMiddle3",
  "LeftHandRing1", "LeftHandRing2", "LeftHandRing3",
  "LeftHandPinky1", "LeftHandPinky2", "LeftHandPinky3",
  "LeftHandThumb1", "LeftHandThumb2", "LeftHandThumb3", "LeftHandThumb4",
  "RightHandIndex1", "RightHandIndex2", "RightHandIndex3",
  "RightHandMiddle1", "RightHandMiddle2", "RightHandMiddle3",
  "RightHandRing1", "RightHandRing2", "RightHandRing3",
  "RightHandPinky1", "RightHandPinky2", "RightHandPinky3",
  "RightHandThumb1", "RightHandThumb2", "RightHandThumb3", "RightHandThumb4",
];

/** Full ordered keypoint list: 18 body then 32 hand. */
export const OPENPOSE_FULL: readonly string[] = [...COCO18, ...HAND_KEYPOINTS];

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
  /**
   * A COCO-18 body keypoint name, or a hand keypoint name when hands are
   * included. Typed as string because the hand names are a separate,
   * later-appended set rather than part of the COCO-18 contract.
   */
  name: string;
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
  /**
   * Append the 32 finger keypoints after the 18 body joints.
   *
   * Off by default because the body-only form is what most ControlNet
 * conditioning expects; the with-hands form exists for hand-pose pipelines.
   */
  includeHands?: boolean;
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

  // Fingers are appended rather than interleaved, so the body keypoints keep
  // their exact COCO-18 indices and every existing consumer of them is
  // unaffected by the flag.
  if (options.includeHands) out.push(...extractHandKeypoints(skeleton, camera));

  return out;
}

/** Index into COCO18 for a named keypoint, or -1 when absent. */
export function coco18Index(name: string): number {
  return (COCO18 as readonly string[]).indexOf(name);
}

/**
 * Project the finger bones alongside the body keypoints.
 *
 * Finger positions come from the real bones rather than being synthesised,
 * because the rig contract already guarantees the 42 names on any humanoid.
 * A bone the model lacks yields a keypoint at the wrist instead of a hole in
 * the image, which keeps every limb index valid and the picture honest: the
 * artist sees collapsed fingers where there are none.
 */
export function extractHandKeypoints(
  skeleton: PosableSkeleton,
  camera: THREE.Camera,
): Keypoint2D[] {
  skeleton.root.updateMatrixWorld(true);
  const world = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const out: Keypoint2D[] = [];

  for (const keypoint of HAND_KEYPOINTS) {
    const bone = skeleton.getBone(keypoint);
    if (bone) {
      bone.getWorldPosition(world);
    } else {
      // Fall back to the wrist so the keypoint still lands on the hand rather
      // than at the image origin.
      const wrist = skeleton.getBone(
        keypoint.startsWith("Left") ? "LeftHand" : "RightHand",
      );
      if (wrist) wrist.getWorldPosition(world);
    }
    ndc.copy(world).project(camera);
    out.push({
      name: keypoint,
      x: (ndc.x + 1) / 2,
      y: (1 - ndc.y) / 2,
      model: world.clone(),
    });
  }

  return out;
}

/**
 * Limb connections for the hand keypoints, as [from, to] pairs of indices into
 * OPENPOSE_FULL.
 *
 * Chains run first-joint -> second -> third, plus the thumb's fourth segment.
 * Each finger's root links back to the COCO-18 wrist, so a with-hands image
 * stays one connected figure rather than two floating clusters. Built once at
 * module load because the mapping is static and every export would otherwise
 * recompute it.
 */
export const HAND_LIMBS: readonly (readonly [number, number])[] = (() => {
  const base = COCO18.length;
  const at = (name: string): number => base + HAND_KEYPOINTS.indexOf(name);
  const limbs: (readonly [number, number])[] = [];
  for (const side of ["Left", "Right"] as const) {
    const wrist = coco18Index(`${side}Wrist`);
    for (const finger of ["Index", "Middle", "Ring", "Pinky", "Thumb"]) {
      limbs.push([wrist, at(`${side}Hand${finger}1`)]);
    }
    for (const finger of ["Index", "Middle", "Ring", "Pinky"]) {
      for (let n = 1; n <= 2; n += 1) {
        limbs.push([
          at(`${side}Hand${finger}${n}`),
          at(`${side}Hand${finger}${n + 1}`),
        ]);
      }
    }
    for (let n = 1; n <= 3; n += 1) {
      limbs.push([
        at(`${side}HandThumb${n}`),
        at(`${side}HandThumb${n + 1}`),
      ]);
    }
  }
  return limbs;
})();

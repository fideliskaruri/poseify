// Validation for generated poses.
//
// A broken generated pose is worse than a missing one: the artist cannot tell
// it is broken, they just trust the thumbnail. So nothing ships that has not
// been checked here.
//
// The checks are the ones that catch real authoring mistakes, not arbitrary
// taste. "Does this look good" is not a test; "does the figure end up inside
// the frame and with its feet on the floor" is.

import * as THREE from "three";
import { ALL_BONES, FULL_PARENTS } from "../src/rig/RigContract";
import { anglesToPose } from "../src/pose/PoseAuthoring";
import type { PoseAngles } from "../src/pose/PoseAuthoring";
import type { GeneratedPose } from "./generate-poses";

export interface ValidationIssue {
  poseId: string;
  reason: string;
}

/** Bones the generator is allowed to touch. */
const ALLOWED = new Set(ALL_BONES);

const EPS = 1e-6;

/**
 * A joint is only meaningful within ±180 degrees.
 *
 * The generator clamps, but a hand-edited axis or a future editor could exceed
 * it, and 270 degrees of elbow reads as a broken pose rather than a curled one.
 */
const MAX_JOINT_DEGREES = 180;

/** Foot heights a grounded figure may have, in metres relative to the floor. */
const GROUND_CONTACT_RANGE = { min: -0.35, max: 0.45 };

/**
 * How far below the floor any body part may end up, in metres.
 *
 * Separate from GROUND_CONTACT_RANGE because the two answer different
 * questions: this one is "is any part of the figure underground", which is
 * always wrong; the range is "is a *grounded* foot still on the floor", which a
 * lying or kneeling pose legitimately is not.
 */
const FLOOR_PENETRATION_TOLERANCE = 0.15;

export interface ValidationContext {
  /**
   * Bone rest positions in the model's local space, keyed by contract name.
   *
   * Needed for the ground-contact and floor-penetration checks. Supplied by the
   * caller so this module stays free of any model loading.
   */
  restPositions: ReadonlyMap<string, THREE.Vector3>;
  /** World-space Y of the floor. Defaults to 0. */
  floorY?: number;
}

/**
 * Check one generated pose.
 *
 * Returns the reasons it should be dropped, or an empty array when it is safe
 * to ship. Empty means "nothing wrong found", not "provably perfect".
 */
export function validateGeneratedPose(
  pose: GeneratedPose,
  context: ValidationContext,
): string[] {
  const problems: string[] = [];
  const { restPositions, floorY = 0 } = context;

  // 1. Every authored bone must be a real contract bone.
  for (const bone of Object.keys(pose.angles)) {
    if (!ALLOWED.has(bone)) {
      problems.push(`unknown bone "${bone}"`);
    }
  }

  // 2. Every angle must be finite and within a single turn.
  for (const [bone, xyz] of Object.entries(pose.angles)) {
    for (let i = 0; i < 3; i += 1) {
      const value = xyz[i];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        problems.push(`${bone} has a non-finite angle`);
        break;
      }
    }
    if (Math.abs(xyz[0]) > MAX_JOINT_DEGREES || Math.abs(xyz[1]) > MAX_JOINT_DEGREES || Math.abs(xyz[2]) > MAX_JOINT_DEGREES) {
      problems.push(`${bone} exceeds ${MAX_JOINT_DEGREES} degrees`);
    }
  }

  // 3. Converting to quaternions must produce unit-length values.
  const bonePose = anglesToPose(pose.angles);
  for (const [bone, q] of Object.entries(bonePose)) {
    const length = Math.hypot(q[0], q[1], q[2], q[3]);
    if (Math.abs(length - 1) > 1e-6) {
      problems.push(`${bone} produced a non-unit quaternion (${length.toFixed(4)})`);
    }
  }

  // 4. A pose with no bones at all would render as an unposed figure and is
  //    not worth shipping under a generated name.
  if (Object.keys(pose.angles).length === 0 && !pose.rootOffset) {
    problems.push("pose is empty");
  }

  // 5. Geometry checks, only when rest positions are available.
  if (restPositions.size > 0) {
    const world = evaluatePose(pose.angles, restPositions);

    // 5a. No part of the figure may end up below the floor.
    for (const [bone, position] of world) {
      if (position.y < floorY - FLOOR_PENETRATION_TOLERANCE) {
        problems.push(
          `${bone} passes through the floor (y=${position.y.toFixed(2)})`,
        );
        break;
      }
    }

    // 5b. A grounded pose must keep its feet in a sane contact range.
    if (pose.tags.includes("grounded")) {
      for (const foot of ["LeftFoot", "RightFoot"]) {
        const position = world.get(foot);
        if (!position) continue;
        const height = position.y - floorY;
        if (height < GROUND_CONTACT_RANGE.min || height > GROUND_CONTACT_RANGE.max) {
          problems.push(
            `${foot} is ${height.toFixed(2)} m off the floor, outside ` +
              `${GROUND_CONTACT_RANGE.min}..${GROUND_CONTACT_RANGE.max}`,
          );
        }
      }
    }
  }

  return problems;
}

/**
 * Apply a pose's angles to rest positions, in dependency order.
 *
 * Parent transforms must be composed before children, so the walk is
 * parent-first. Returns world positions keyed by bone.
 */
export function evaluatePose(
  angles: PoseAngles,
  restPositions: ReadonlyMap<string, THREE.Vector3>,
): Map<string, THREE.Vector3> {
  const DEG2RAD = Math.PI / 180;
  const quats = new Map<string, THREE.Quaternion>();
  const out = new Map<string, THREE.Vector3>();

  // Contract parent order: the rig's BODY_BONES list is parent-first, so
  // building up in that order composes correctly without a graph walk.
  const ordered = orderBonesParentFirst([...restPositions.keys()]);

  for (const bone of ordered) {
    const rest = restPositions.get(bone);
    if (!rest) continue;

    // restPositions holds REST WORLD positions. A child's offset from its
    // parent is that difference; rotating it by the parent's accumulated
    // rotation and adding the parent's NEW world position gives the child's new
    // world position. Storing the offset alone would report a hand 0.78 m up
    // as 0.78 - 1.46 = -0.68, which is below the floor, and reject everything.
    const parent = parentOf(bone);
    const parentQuat = parent ? quats.get(parent) : undefined;
    const parentRest = parent ? restPositions.get(parent) : undefined;
    const parentWorld = parent ? out.get(parent) : undefined;

    const offset = new THREE.Vector3().copy(rest);
    if (parentRest) offset.sub(parentRest);
    if (parentQuat) offset.applyQuaternion(parentQuat);

    const world = new THREE.Vector3();
    if (parentWorld) world.copy(parentWorld);
    world.add(offset);

    const xyz = angles[bone];
    const q = new THREE.Quaternion();
    if (xyz) {
      q.setFromEuler(
        new THREE.Euler(
          xyz[0] * DEG2RAD,
          xyz[1] * DEG2RAD,
          xyz[2] * DEG2RAD,
          "XYZ",
        ),
      );
    }
    const inherited = parentQuat ?? new THREE.Quaternion();
    quats.set(bone, inherited.clone().multiply(q));
    out.set(bone, world);
  }
  return out;
}

/** Local parent of a contract bone, or null for the root. */
function parentOf(bone: string): string | null {
  return FULL_PARENTS[bone] ?? null;
}

/**
 * Order bones so a parent always precedes its children.
 *
 * The contract's parent map is authoritative, so a depth sort is enough and
 * avoids a hand-maintained ordering that could drift.
 */
export function orderBonesParentFirst(bones: readonly string[]): string[] {
  const depth = (bone: string, guard = 0): number => {
    const parent = FULL_PARENTS[bone];
    if (!parent || guard > 64) return 0;
    return 1 + depth(parent, guard + 1);
  };
  return [...bones].sort((a, b) => depth(a) - depth(b));
}

/**
 * Validate a batch, dropping failures.
 *
 * Returns the poses that are safe to ship plus the reasons for the rest, so a
 * generator run reports what it rejected rather than silently shrinking.
 */
export function validateGeneratedPoses(
  poses: readonly GeneratedPose[],
  context: ValidationContext,
): { shipped: GeneratedPose[]; issues: ValidationIssue[] } {
  const shipped: GeneratedPose[] = [];
  const issues: ValidationIssue[] = [];
  for (const pose of poses) {
    const problems = validateGeneratedPose(pose, context);
    if (problems.length === 0) shipped.push(pose);
    else issues.push({ poseId: pose.id, reason: problems.join("; ") });
  }
  return { shipped, issues };
}




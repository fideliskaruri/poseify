// Test fixtures for the posing suite.
//
// The procedural humanoid builder that used to serve this role was removed
// when the app moved to exclusively scraped models. These fixtures build the
// rig contract directly as a THREE.Bone tree, which keeps the posing tests
// independent of any shipped asset and of the network.

import * as THREE from "three";
import { RIG_PARENTS } from "../../rig/RigContract";
import { PosableSkeleton, type PoseData } from "../PosableSkeleton";
import {
  DEFAULT_LOAD_CONFIG,
  type ModelLoadConfig,
} from "../../models/ModelLoadConfig";

export function testConfig(
  id: string,
  patch: Partial<ModelLoadConfig> = {},
): ModelLoadConfig {
  return { ...DEFAULT_LOAD_CONFIG, id, name: id, ...patch };
}

/**
 * Rest offsets in metres for a ~1.75 m T-pose, keyed by contract bone name.
 * Values are absolute world positions; each bone is positioned relative to its
 * parent when the tree is assembled.
 */
const REST: Record<string, [number, number, number]> = {
  Hips: [0, 0.94, 0],
  Spine: [0, 1.03, 0],
  Spine1: [0, 1.12, 0],
  Spine2: [0, 1.21, 0],
  Neck: [0, 1.3, 0],
  Head: [0, 1.37, 0],
  LeftShoulder: [0.05, 1.27, 0],
  LeftArm: [0.16, 1.27, 0],
  LeftForeArm: [0.33, 1.27, 0],
  LeftHand: [0.48, 1.27, 0],
  RightShoulder: [0.05, 1.27, 0],
  RightArm: [0.16, 1.27, 0],
  RightForeArm: [0.33, 1.27, 0],
  RightHand: [0.48, 1.27, 0],
  LeftUpLeg: [0.08, 0.92, 0],
  LeftLeg: [0.08, 0.51, 0],
  LeftFoot: [0.08, 0.09, 0],
  LeftToeBase: [0.08, 0.04, 0.13],
  RightUpLeg: [0.08, 0.92, 0],
  RightLeg: [0.08, 0.51, 0],
  RightFoot: [0.08, 0.09, 0],
  RightToeBase: [0.08, 0.04, 0.13],
};

function restOf(name: string): THREE.Vector3 {
  const base = REST[name] ?? [0, 0.5, 0];
  return new THREE.Vector3(
    name.startsWith("Right") ? -base[0] : base[0],
    base[1],
    base[2],
  );
}

export interface FixtureOptions {
  // Uniform scale applied to the rest pose, to vary model proportions.
  scale?: number;
  // Skip these bones entirely, to simulate an incomplete rig.
  omit?: readonly string[];
  // Build a skinned mesh so CCD IK has a SkinnedMesh to operate on.
  skinned?: boolean;
}

export interface Fixture {
  root: THREE.Group;
  bones: Map<string, THREE.Bone>;
}

/**
 * Build a contract skeleton, optionally wrapped in a minimal SkinnedMesh.
 *
 * CCDIKSolver requires a SkinnedMesh, so posing tests that exercise IK need
 * one. The geometry is a degenerate triangle; only the skeleton matters for
 * the assertions these tests make.
 */
export function buildFixture(options: FixtureOptions = {}): Fixture {
  const { scale = 1, omit = [], skinned = true } = options;
  const omitted = new Set(omit);
  const bones = new Map<string, THREE.Bone>();
  const rest = new Map<string, THREE.Vector3>();

  const childrenOf = (name: string): string[] =>
    Object.entries(RIG_PARENTS)
      .filter(([, parent]) => parent === name)
      .map(([child]) => child);

  const visit = (name: string): void => {
    // Omitting a bone must omit its whole subtree, otherwise children would
 // be built without a parent to attach to.
    if (omitted.has(name)) return;
    const bone = new THREE.Bone();
    bone.name = name;
    bones.set(name, bone);
    rest.set(name, restOf(name).multiplyScalar(scale));
    for (const child of childrenOf(name)) visit(child);
  };
  if (!omitted.has("Hips")) visit("Hips");

  for (const [name, bone] of bones) {
    const parentName = RIG_PARENTS[name];
    const parent = parentName ? bones.get(parentName) : undefined;
    if (parent) {
      bone.position.copy(rest.get(name)!.clone().sub(rest.get(parentName)!));
      parent.add(bone);
    } else {
      bone.position.copy(rest.get(name)!);
    }
  }

  const rootBone = bones.get("Hips")!;
  const group = new THREE.Group();
  group.add(rootBone);

  if (skinned) {
    const ordered = [...bones.values()];
    for (const b of ordered) b.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(ordered);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3),
    );
    const mesh = new THREE.SkinnedMesh(
      geometry,
      new THREE.MeshBasicMaterial(),
    );
    mesh.frustumCulled = false;
    group.add(mesh);
    group.updateMatrixWorld(true);
    mesh.bind(skeleton);
  }

  group.updateMatrixWorld(true);
  return { root: group, bones };
}

/** A ready-to-pose skeleton with the default proportions. */
export function makeSkeleton(id = "fixture", options: FixtureOptions = {}) {
  const { root } = buildFixture(options);
  return new PosableSkeleton(root, testConfig(id));
}

/** A skeleton whose rest pose is scaled, standing in for another model. */
export function makeScaledSkeleton(
  scale: number,
  id = "fixture-scaled",
): PosableSkeleton {
  const { root } = buildFixture({ scale });
  return new PosableSkeleton(root, testConfig(id));
}

export type { PoseData };

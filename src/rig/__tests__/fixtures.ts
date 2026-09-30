import * as THREE from "three";
import { RIG_PARENTS } from "../RigContract";

export interface FixtureOptions {
  rename?: Record<string, string>;
  lengths?: Record<string, number>;
  omit?: readonly string[];
  detach?: readonly string[];
  only?: readonly string[];
}

// Canonical world-space offsets for a ~1.7 m T-pose human. Only used so the
// heuristic pass has realistic geometry to rank against.
const DEFAULT_OFFSETS: Record<string, [number, number, number]> = {
  Hips: [0, 0.95, 0],
  Spine: [0, 1.05, 0],
  Spine1: [0, 1.17, 0],
  Spine2: [0, 1.31, 0],
  Neck: [0, 1.45, 0],
  Head: [0, 1.54, 0],
  LeftShoulder: [0.05, 1.42, 0],
  LeftArm: [0.19, 1.42, 0],
  LeftForeArm: [0.47, 1.42, 0],
  LeftHand: [0.72, 1.42, 0],
  RightShoulder: [-0.05, 1.42, 0],
  RightArm: [-0.19, 1.42, 0],
  RightForeArm: [-0.47, 1.42, 0],
  RightHand: [-0.72, 1.42, 0],
  LeftUpLeg: [0.09, 0.95, 0],
  LeftLeg: [0.09, 0.53, 0],
  LeftFoot: [0.09, 0.12, 0],
  LeftToeBase: [0.09, 0.05, 0.15],
  RightUpLeg: [-0.09, 0.95, 0],
  RightLeg: [-0.09, 0.53, 0],
  RightFoot: [-0.09, 0.12, 0],
  RightToeBase: [-0.09, 0.05, 0.15],
};

function childrenOf(name: string): string[] {
  return Object.entries(RIG_PARENTS)
    .filter(([, parent]) => parent === name)
    .map(([child]) => child);
}

function includeSet(only: readonly string[] | undefined): Set<string> | null {
  if (!only) return null;
  const wanted = new Set<string>();
  const addWithAncestors = (n: string): void => {
    if (wanted.has(n)) return;
    wanted.add(n);
    const p = RIG_PARENTS[n];
    if (p) addWithAncestors(p);
  };
  for (const n of only) addWithAncestors(n);
  return wanted;
}

// Build a canonical Mixamo-named skeleton as a THREE.Bone tree, mirroring what
// an FBX/GLTF loader hands back.
export function buildSkeletonFixture(options: FixtureOptions = {}): {
  root: THREE.Bone;
  bones: Map<string, THREE.Bone>;
} {
  const {
    rename = {},
    lengths = {},
    omit = [],
    detach = [],
    only,
  } = options;

  const wanted = includeSet(only);
  const omitted = new Set<string>([...omit, ...detach]);
  const bones = new Map<string, THREE.Bone>();

  const build = (contractName: string): THREE.Bone | null => {
    if (omitted.has(contractName)) return null;
    if (wanted && !wanted.has(contractName)) return null;

    const bone = new THREE.Bone();
    bone.name = rename[contractName] ?? contractName;
    bones.set(contractName, bone);

    for (const child of childrenOf(contractName)) {
      const built = build(child);
      if (built) bone.add(built);
    }
    return bone;
  };

  const root = build("Hips");
  if (!root) throw new Error("fixture: root Hips was omitted");

  // Position bones so world offsets land on the canonical T-pose.
  for (const [contractName, bone] of bones) {
    const parent = RIG_PARENTS[contractName];
    const offset = DEFAULT_OFFSETS[contractName] ?? [0, 0.1, 0];
    const parentOffset = parent
      ? (DEFAULT_OFFSETS[parent] ?? [0, 0, 0])
      : [0, 0, 0];
    const rel = new THREE.Vector3(...offset).sub(
      new THREE.Vector3(...(parentOffset as [number, number, number])),
    );
    bone.position.copy(rel);
    if (lengths[contractName] !== undefined) {
      const l = lengths[contractName];
      bone.scale.setScalar(Math.max(l, 1e-4) / 0.1);
    }
  }

  // `detach` removes the bone from the tree; `omit` never built it.
  for (const name of detach) {
    const bone = bones.get(name);
    if (bone) bone.removeFromParent();
    bones.delete(name);
  }

  return { root, bones };
}

// Every bone name present in a fixture tree.
export function fixtureBoneNames(root: THREE.Object3D): string[] {
  const names: string[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Bone) names.push(o.name);
  });
  return names;
}

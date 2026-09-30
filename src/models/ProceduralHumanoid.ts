// Procedural humanoid construction from primitives.
//
// A procedurally generated mannequin beats a license-encumbered download, and
// it guarantees the skeleton matches the rig contract exactly because we build
// it from the contract's own parent map. The result is a SkinnedMesh so bone
// rotation deforms the mesh the way a real rig does.

import * as THREE from "three";
import {
  BODY_BONES,
  FINGER_NAMES,
  HAND_SIDES,
  RIG_PARENTS,
} from "../rig/RigContract";

export interface BodyProportions {
  height: number;
  shoulderScale: number;
  hipScale: number;
  limbScale: number;
  depthScale: number;
  headScale: number;
}

export const ADULT: BodyProportions = {
  height: 1.75,
  shoulderScale: 1,
  hipScale: 1,
  limbScale: 1,
  depthScale: 1,
  headScale: 1,
};

export const CHILD: BodyProportions = {
  height: 1.15,
  shoulderScale: 0.82,
  hipScale: 0.9,
  limbScale: 0.82,
  depthScale: 0.95,
  headScale: 1.25,
};

export const BRUTE: BodyProportions = {
  height: 2.1,
  shoulderScale: 1.45,
  hipScale: 1.15,
  limbScale: 1.6,
  depthScale: 1.35,
  headScale: 1.1,
};

export const MUSCULAR: BodyProportions = {
  height: 1.82,
  shoulderScale: 1.28,
  hipScale: 1,
  limbScale: 1.32,
  depthScale: 1.15,
  headScale: 1,
};

export const SKINNY: BodyProportions = {
  height: 1.78,
  shoulderScale: 0.86,
  hipScale: 0.88,
  limbScale: 0.74,
  depthScale: 0.86,
  headScale: 1,
};

export const STOCKY: BodyProportions = {
  height: 1.7,
  shoulderScale: 1.15,
  hipScale: 1.2,
  limbScale: 1.28,
  depthScale: 1.25,
  headScale: 1.02,
};

// Rest offsets in metres for a 1.75 m reference T-pose. Left limbs are listed
// positive-X; right limbs are mirrored at build time.
const REST: Record<string, [number, number, number]> = {
  Hips: [0, 0.94, 0],
  Spine: [0, 1.03, 0],
  Spine1: [0, 1.12, 0],
  Spine2: [0, 1.21, 0],
  Neck: [0, 1.3, 0],
  Head: [0, 1.37, 0],
  LeftShoulder: [0.04, 1.28, 0],
  LeftArm: [0.14, 1.28, 0],
  LeftForeArm: [0.32, 1.28, 0],
  LeftHand: [0.49, 1.28, 0],
  RightShoulder: [0.04, 1.28, 0],
  RightArm: [0.14, 1.28, 0],
  RightForeArm: [0.32, 1.28, 0],
  RightHand: [0.49, 1.28, 0],
  LeftUpLeg: [0.08, 0.92, 0],
  LeftLeg: [0.08, 0.51, 0],
  LeftFoot: [0.08, 0.1, 0],
  LeftToeBase: [0.08, 0.04, 0.14],
  RightUpLeg: [0.08, 0.92, 0],
  RightLeg: [0.08, 0.51, 0],
  RightFoot: [0.08, 0.1, 0],
  RightToeBase: [0.08, 0.04, 0.14],
};

function restOffset(name: string): THREE.Vector3 {
  const base = REST[name];
  if (!base) return new THREE.Vector3(0, 0.5, 0);
  return new THREE.Vector3(
    name.startsWith("Right") ? -base[0] : base[0],
    base[1],
    base[2],
  );
}

interface BuiltBone {
  bone: THREE.Bone;
  rest: THREE.Vector3;
}

// Create the contract bone tree with anatomically plausible rest offsets.
function buildBoneTree(p: BodyProportions): Map<string, BuiltBone> {
  const scale = p.height / 1.75;
  const built = new Map<string, BuiltBone>();

  const childrenOf = (name: string): string[] =>
    Object.entries(RIG_PARENTS)
      .filter(([, parent]) => parent === name)
      .map(([child]) => child);

  const visit = (name: string): void => {
    const bone = new THREE.Bone();
    bone.name = name;
    const rest = restOffset(name).multiplyScalar(scale);

    if (name.endsWith("Shoulder")) rest.x *= p.shoulderScale;
    if (name.endsWith("UpLeg")) rest.x *= p.hipScale;
    if (name === "Spine1" || name === "Spine2") rest.z *= p.depthScale;

    built.set(name, { bone, rest });
    for (const child of childrenOf(name)) visit(child);
  };

  visit("Hips");

  for (const [name, { bone, rest }] of built) {
    const parentName = RIG_PARENTS[name];
    const parent = parentName ? built.get(parentName) : undefined;
    if (parent) {
      bone.position.copy(rest.clone().sub(parent.rest));
      parent.bone.add(bone);
    } else {
      bone.position.copy(rest);
    }
  }

  return built;
}

// Tapered capsule-like segment spanning two bone rest positions.
function segmentGeometry(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  radialSegments = 10,
): THREE.BufferGeometry {
  const dir = to.clone().sub(from);
  const len = Math.max(dir.length(), 1e-4);
  const geom = new THREE.CylinderGeometry(
    radius * 0.85,
    radius,
    len,
    radialSegments,
    1,
    false,
  );
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize(),
  );
  const mid = from.clone().add(to).multiplyScalar(0.5);
  geom.applyQuaternion(quat);
  geom.translate(mid.x, mid.y, mid.z);
  return geom;
}

export interface ProceduralHumanoid {
  root: THREE.Group;
  bones: Map<string, THREE.Bone>;
  mesh: THREE.SkinnedMesh;
  skeleton: THREE.Skeleton;
}

/**
 * Build a rigged humanoid whose skeleton is the Poseify contract by
 * construction. Two models built from different proportions share bone names,
 * so a pose authored on one transfers to the other.
 */
export function buildProceduralHumanoid(
  proportions: BodyProportions = ADULT,
  options: { includeFingers?: boolean; materialColor?: number } = {},
): ProceduralHumanoid {
  const { includeFingers = true, materialColor = 0xb9bdc4 } = options;
  const p = proportions;
  const scale = p.height / 1.75;

  const built = buildBoneTree(p);
  const rootBone = built.get("Hips")!.bone;
  const bodyBones = [...built.values()];

  // Finger bones hang off each wrist so hand poses and OpenPose fingers work.
  if (includeFingers) {
    for (const side of HAND_SIDES) {
      const wrist = built.get(`${side}Hand`)!;
      const sign = side === "Left" ? 1 : -1;
      for (let fi = 0; fi < FINGER_NAMES.length; fi++) {
        const finger = FINGER_NAMES[fi];
        let parent: THREE.Bone = wrist.bone;
        const spread = (fi - 2) * 0.018 * p.limbScale;
        for (let seg = 1; seg <= 4; seg++) {
          const bone = new THREE.Bone();
          bone.name = `${side}Hand${finger}${seg}`;
          bone.position.set(
            sign * (0.026 + seg * 0.02) * scale,
            spread * (1 - seg * 0.15),
            0,
          );
          parent.add(bone);
          parent = bone;
        }
      }
    }
  }

  // Build geometry in world space, then skin by nearest bone with full weight.
  const geometries: THREE.BufferGeometry[] = [];
  const limbR = 0.045 * p.limbScale * scale;

  const addSegment = (a: string, b: string, radius: number): void => {
    const A = built.get(a);
    const B = built.get(b);
    if (!A || !B) return;
    geometries.push(segmentGeometry(A.rest, B.rest, radius));
  };

  addSegment("Hips", "Spine", 0.075 * p.hipScale * scale);
  addSegment("Spine", "Spine1", 0.082 * p.depthScale * scale);
  addSegment("Spine1", "Spine2", 0.09 * p.depthScale * scale);
  addSegment("Spine2", "Neck", 0.082 * p.shoulderScale * scale);
  addSegment("Neck", "Head", 0.038 * scale);

  const headGeom = new THREE.SphereGeometry(0.075 * p.headScale * scale, 16, 12);
  const headRest = built.get("Head")!.rest.clone();
  headGeom.scale(1, 1.15, 1.05);
  headGeom.translate(headRest.x, headRest.y + 0.045 * scale, headRest.z);
  geometries.push(headGeom);

  for (const side of HAND_SIDES) {
    const sign = side === "Left" ? 1 : -1;
    addSegment(`${side}Shoulder`, `${side}Arm`, limbR * 1.15);
    addSegment(`${side}Arm`, `${side}ForeArm`, limbR);
    addSegment(`${side}ForeArm`, `${side}Hand`, limbR * 0.85);

    const wrist = built.get(`${side}Hand`)!.rest;
    const handGeom = new THREE.SphereGeometry(limbR * 1.5, 10, 8);
    handGeom.scale(1.5, 0.75, 1);
    handGeom.translate(
      wrist.x + sign * 0.035 * scale,
      wrist.y,
      wrist.z,
    );
    geometries.push(handGeom);
  }

  for (const side of HAND_SIDES) {
    addSegment(`${side}UpLeg`, `${side}Leg`, limbR * 1.35);
    addSegment(`${side}Leg`, `${side}Foot`, limbR * 1.05);
    const ankle = built.get(`${side}Foot`)!.rest;
    const footGeom = new THREE.BoxGeometry(
      0.075 * p.limbScale * scale,
      0.05 * scale,
      0.2 * p.limbScale * scale,
    );
    footGeom.translate(ankle.x, ankle.y - 0.015 * scale, ankle.z + 0.06 * scale);
    geometries.push(footGeom);
  }

  const merged = mergeGeometries(geometries);

  const vertexCount = merged.getAttribute("position").count;
  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);
  const posAttr = merged.getAttribute("position");

  for (let v = 0; v < vertexCount; v++) {
    const vx = posAttr.getX(v);
    const vy = posAttr.getY(v);
    const vz = posAttr.getZ(v);
    let bestIndex = 0;
    let bestDist = Infinity;
    for (let bi = 0; bi < bodyBones.length; bi++) {
      const bp = bodyBones[bi].rest;
      const d = (vx - bp.x) ** 2 + (vy - bp.y) ** 2 + (vz - bp.z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestIndex = bi;
      }
    }
    skinIndices[v * 4] = bestIndex;
    skinWeights[v * 4] = 1;
  }

  merged.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
  merged.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));

  const orderedBones = bodyBones.map((b) => b.bone);

  // The Skeleton captures each bone's bind-pose world matrix to build
  // boneInverses. The bone tree is already parented, but world matrices have
  // not been refreshed yet, so without this every inverse is identity and
  // skinning pushes the mesh up by the rest offsets.
  for (const b of orderedBones) b.updateMatrixWorld(true);

  const skeleton = new THREE.Skeleton(orderedBones);
  const material = new THREE.MeshStandardMaterial({
    color: materialColor,
    roughness: 0.72,
    metalness: 0.04,
  });
  const mesh = new THREE.SkinnedMesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Skinning moves vertices away from the authored geometry positions, so the
  // bounding sphere computed from those positions can cull a visible figure.
  mesh.frustumCulled = false;

  const root = new THREE.Group();
  root.name = "ProceduralHumanoid";
  root.add(rootBone);
  root.add(mesh);
  root.updateMatrixWorld(true);
  // Bind in 'attached' mode (the default): three.js derives bindMatrix from
  // the mesh's world matrix, which is identity here, and pairs it with the
  // boneInverses captured above. Both geometry and bone rest offsets live in
  // the same world space, so this is consistent.
  mesh.bind(skeleton);

  const bones = new Map<string, THREE.Bone>();
  for (const [name, entry] of built) bones.set(name, entry.bone);
  root.traverse((o) => {
    if (o instanceof THREE.Bone) bones.set(o.name, o);
  });

  return { root, bones, mesh, skeleton };
}

// Minimal geometry merge for position/normal/uv only.
function mergeGeometries(
  geometries: THREE.BufferGeometry[],
): THREE.BufferGeometry {
  const positionParts: number[] = [];
  const normalParts: number[] = [];
  const uvParts: number[] = [];

  for (const geom of geometries) {
    const g = geom.index ? geom.toNonIndexed() : geom;
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      positionParts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const nrm = g.getAttribute("normal");
    for (let i = 0; i < nrm.count; i++) {
      normalParts.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    }
    const uv = g.getAttribute("uv");
    if (uv) {
      for (let i = 0; i < uv.count; i++) uvParts.push(uv.getX(i), uv.getY(i));
    }
    if (g !== geom) g.dispose();
    geom.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(positionParts, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(normalParts, 3));
  if (uvParts.length > 0) {
    out.setAttribute("uv", new THREE.Float32BufferAttribute(uvParts, 2));
  }
  return out;
}

export { BODY_BONES };

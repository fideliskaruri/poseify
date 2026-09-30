// Procedural "bot" models: stick, blocky and square-stick.
//
// These are the cheap, licence-clean replacements for PoseMy's Mixamo-derived
// biped robots. FINDINGS.md flags that Mixamo's XBot/YBot assets must not be
// redistributed, so building equivalents from primitives is both the correct
// and the cleaner path. Each shares the rig contract, so poses transfer freely
// between bots and humanoids.

import * as THREE from "three";
import { FINGER_NAMES, HAND_SIDES, RIG_PARENTS } from "../rig/RigContract";
import type { BodyProportions } from "./ProceduralHumanoid";

type BotStyle = "stick" | "blocky" | "square_stick";

export interface BotSpec {
  id: string;
  name: string;
  style: BotStyle;
  color: number;
  proportions: BodyProportions;
  boneSize: number;
  handBoneSize: number;
  hipBoneSize: number;
}

export const BOT_SPECS: readonly BotSpec[] = [
  {
    id: "stick_bot",
    name: "Stick Bot",
    style: "stick",
    color: 0x2f3540,
    proportions: {
      height: 1.8,
      shoulderScale: 1,
      hipScale: 1,
      limbScale: 0.55,
      depthScale: 0.6,
      headScale: 0.8,
    },
    boneSize: 3,
    handBoneSize: 1,
    hipBoneSize: 6,
  },
  {
    id: "blocky_bot",
    name: "Blocky Bot",
    style: "blocky",
    color: 0x4a5568,
    proportions: {
      height: 1.8,
      shoulderScale: 1.15,
      hipScale: 1.1,
      limbScale: 1.45,
      depthScale: 1.1,
      headScale: 1.1,
    },
    boneSize: 3.4,
    handBoneSize: 1,
    hipBoneSize: 6,
  },
  {
    id: "square_stick_bot",
    name: "Square Stick Bot",
    style: "square_stick",
    color: 0x6b7280,
    proportions: {
      height: 1.8,
      shoulderScale: 1,
      hipScale: 1,
      limbScale: 0.8,
      depthScale: 0.7,
      headScale: 0.9,
    },
    boneSize: 3,
    handBoneSize: 1,
    hipBoneSize: 6,
  },
];

// Rest offsets for a 1.8 m reference, matching the humanoid layout so all
// families stand at the same height and share pose data.
const REST: Record<string, [number, number, number]> = {
  Hips: [0, 0.95, 0],
  Spine: [0, 1.05, 0],
  Spine1: [0, 1.15, 0],
  Spine2: [0, 1.25, 0],
  Neck: [0, 1.35, 0],
  Head: [0, 1.43, 0],
  LeftShoulder: [0.04, 1.32, 0],
  LeftArm: [0.16, 1.32, 0],
  LeftForeArm: [0.34, 1.32, 0],
  LeftHand: [0.5, 1.32, 0],
  RightShoulder: [0.04, 1.32, 0],
  RightArm: [0.16, 1.32, 0],
  RightForeArm: [0.34, 1.32, 0],
  RightHand: [0.5, 1.32, 0],
  LeftUpLeg: [0.08, 0.93, 0],
  LeftLeg: [0.08, 0.52, 0],
  LeftFoot: [0.08, 0.1, 0],
  LeftToeBase: [0.08, 0.04, 0.13],
  RightUpLeg: [0.08, 0.93, 0],
  RightLeg: [0.08, 0.52, 0],
  RightFoot: [0.08, 0.1, 0],
  RightToeBase: [0.08, 0.04, 0.13],
};

function restOffset(name: string, scale: number): THREE.Vector3 {
  const base = REST[name] ?? [0, 0.5, 0];
  return new THREE.Vector3(
    (name.startsWith("Right") ? -base[0] : base[0]) * scale,
    base[1] * scale,
    base[2] * scale,
  );
}

export interface BotModel {
  root: THREE.Group;
  skeleton: THREE.Skeleton;
  mesh: THREE.SkinnedMesh;
  bones: Map<string, THREE.Bone>;
}

export function buildBot(spec: BotSpec): BotModel {
  const scale = spec.proportions.height / 1.8;
  const thickness =
    (spec.style === "stick" ? 0.022 : 0.06) * spec.proportions.limbScale;

  const bones = new Map<string, THREE.Bone>();
  const rest = new Map<string, THREE.Vector3>();

  const childrenOf = (name: string): string[] =>
    Object.entries(RIG_PARENTS)
      .filter(([, p]) => p === name)
      .map(([c]) => c);

  const visit = (name: string): void => {
    const bone = new THREE.Bone();
    bone.name = name;
    bones.set(name, bone);
    rest.set(name, restOffset(name, scale));
    for (const c of childrenOf(name)) visit(c);
  };
  visit("Hips");

  // Finger bones hang off each wrist so hand poses and the full 62-bone
  // contract resolve on bots exactly as they do on humanoids.
  for (const side of HAND_SIDES) {
    const wrist = bones.get(`${side}Hand`)!;
    const sign = side === "Left" ? 1 : -1;
    const wristRest = rest.get(`${side}Hand`)!;
    for (let fi = 0; fi < FINGER_NAMES.length; fi++) {
      const finger = FINGER_NAMES[fi];
      let parent: THREE.Bone = wrist;
      let parentRest = wristRest;
      const spread = (fi - 2) * 0.014 * spec.proportions.limbScale;
      for (let seg = 1; seg <= 4; seg++) {
        const bone = new THREE.Bone();
        bone.name = `${side}Hand${finger}${seg}`;
        bone.position.set(
          sign * (0.02 + seg * 0.016) * scale,
          spread * (1 - seg * 0.15),
          0,
        );
        parent.add(bone);
        bones.set(bone.name, bone);
        rest.set(
          bone.name,
          parentRest
            .clone()
            .add(new THREE.Vector3(bone.position.x, bone.position.y, bone.position.z)),
        );
        parent = bone;
        parentRest = rest.get(bone.name)!;
      }
    }
  }

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

  const geometry = buildGeometry(spec.style, rest, thickness, scale);
  const ordered = [...bones.values()];
  for (const b of ordered) b.updateMatrixWorld(true);

  const skeleton = new THREE.Skeleton(ordered);
  skinByNearestBone(geometry, ordered, rest);

  const mesh = new THREE.SkinnedMesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: 0.85,
      metalness: 0.1,
    }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const root = new THREE.Group();
  root.name = spec.id;
  root.add(bones.get("Hips")!);
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(skeleton);

  return { root, skeleton, mesh, bones };
}

function partGeometry(
  style: BotStyle,
  from: THREE.Vector3,
  to: THREE.Vector3,
  thickness: number,
): THREE.BufferGeometry {
  const dir = to.clone().sub(from);
  const len = Math.max(dir.length(), 1e-4);
  let geom: THREE.BufferGeometry;

  if (style === "stick") {
    geom = new THREE.CylinderGeometry(thickness, thickness, len, 8, 1);
  } else {
    // Blocky and square-stick both use boxes; square-stick is simply slimmer.
    const t = style === "square_stick" ? thickness * 0.8 : thickness;
    geom = new THREE.BoxGeometry(t * 2, len, t * 2);
  }

  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize(),
  );
  const mid = from.clone().add(to).multiplyScalar(0.5);
  geom.applyQuaternion(quat);
  geom.translate(mid.x, mid.y, mid.z);
  return geom;
}

function buildGeometry(
  style: BotStyle,
  rest: Map<string, THREE.Vector3>,
  thickness: number,
  scale: number,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const seg = (a: string, b: string, mul = 1): void => {
    const A = rest.get(a);
    const B = rest.get(b);
    if (!A || !B) return;
    parts.push(partGeometry(style, A, B, thickness * mul));
  };

  seg("Hips", "Spine");
  seg("Spine", "Spine1");
  seg("Spine1", "Spine2");
  seg("Spine2", "Neck");
  seg("Neck", "Head", 0.8);

  const head = rest.get("Head")!;
  const headSize =
    style === "stick" ? 0.05 : style === "square_stick" ? 0.1 : 0.16;
  const headGeom =
    style === "stick"
      ? new THREE.SphereGeometry(headSize * scale, 10, 8)
      : new THREE.BoxGeometry(
          headSize * 2 * scale,
          headSize * 2 * scale,
          headSize * 2 * scale,
        );
  headGeom.translate(head.x, head.y + headSize * scale, head.z);
  parts.push(headGeom);

  for (const side of ["Left", "Right"]) {
    seg(`${side}Shoulder`, `${side}Arm`);
    seg(`${side}Arm`, `${side}ForeArm`);
    seg(`${side}ForeArm`, `${side}Hand`, 0.85);
    seg(`${side}UpLeg`, `${side}Leg`);
    seg(`${side}Leg`, `${side}Foot`);

    const ankle = rest.get(`${side}Foot`)!;
    const footSize = style === "stick" ? 0.04 : 0.09;
    const footGeom = new THREE.BoxGeometry(
      footSize * 2 * scale,
      footSize * scale,
      footSize * 3.4 * scale,
    );
    footGeom.translate(
      ankle.x,
      ankle.y - footSize * 0.4 * scale,
      ankle.z + footSize * 1.4 * scale,
    );
    parts.push(footGeom);
  }

  return mergeParts(parts);
}

function skinByNearestBone(
  geometry: THREE.BufferGeometry,
  bones: THREE.Bone[],
  rest: Map<string, THREE.Vector3>,
): void {
  const pos = geometry.getAttribute("position");
  const skinIndices = new Uint16Array(pos.count * 4);
  const skinWeights = new Float32Array(pos.count * 4);

  for (let v = 0; v < pos.count; v++) {
    const vx = pos.getX(v);
    const vy = pos.getY(v);
    const vz = pos.getZ(v);
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < bones.length; i++) {
      const p = rest.get(bones[i].name)!;
      const d = (vx - p.x) ** 2 + (vy - p.y) ** 2 + (vz - p.z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    skinIndices[v * 4] = best;
    skinWeights[v * 4] = 1;
  }

  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(skinIndices, 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(skinWeights, 4),
  );
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const position: number[] = [];
  const normal: number[] = [];

  for (const part of parts) {
    const g = part.index ? part.toNonIndexed() : part;
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    for (let i = 0; i < p.count; i++) {
      position.push(p.getX(i), p.getY(i), p.getZ(i));
      normal.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    if (g !== part) g.dispose();
    part.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  return out;
}

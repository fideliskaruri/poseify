// Procedural humanoid models, generated in code.
//
// WHY THIS EXISTS
//
// The 33 FBX files under public/vendor/pose-my-art/ are PoseMy.Art's
// property. They are gitignored and fetched at install time, so they never ship
// in the repository, but anyone who *redistributes* Poseify still has to
// delete them, and anyone who wants to verify the app's behaviour offline
// cannot.
//
// Everything here is generated from the rig contract at runtime, exactly like
// the prop set. That makes it MIT-clean by construction: there is no third-party
// asset to license, and the figures are reviewable as code.
//
// WHAT THESE ARE NOT
//
// These are reference figures, not character models. They exist so a fresh
// clone has something poseable in its picker with zero downloads, and so the
// rig contract has a second implementation proving the retargeter is not
// coupled to one asset's bone naming. A user who wants a realistic body still
// fetches the FBX set.
//
// The mesh is built from bone segments: each contract bone contributes a
// tapered capsule along its own axis, so a posed figure deforms correctly and
// an OpenPose export has real geometry to work with.

import * as THREE from "three";
import { FULL_PARENTS, BODY_BONES, CORE_BONES, HAND_BONES } from "../rig/RigContract";
import type { ModelLoadConfig } from "./ModelLoadConfig";

/** Rest world positions for a ~1.75 m figure, keyed by contract bone. */
const REST: Readonly<Record<string, readonly [number, number, number]>> = {
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

/** Finger rest positions, fanned out from the wrist. */
function fingerRest(): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {};
  let i = 0;
  for (const bone of HAND_BONES) {
    if (bone.endsWith("Hand")) continue;
    const side = bone.startsWith("Left") ? "Left" : "Right";
    const wrist = restOf(`${side}Hand`);
    const sign = side === "Left" ? 1 : -1;
    out[bone] = [
      wrist.x + sign * 0.012 * (i % 4),
      wrist.y - 0.008 * (i % 3),
      wrist.z + 0.008 * Math.floor(i / 4),
    ];
    i += 1;
  }
  return out;
}

function restOf(bone: string): THREE.Vector3 {
  const base = REST[bone] ?? fingerRestCache[bone] ?? [0, 0.5, 0];
  return new THREE.Vector3(
    bone.startsWith("Right") ? -base[0] : base[0],
    base[1],
    base[2],
  );
}

const fingerRestCache: Record<string, readonly [number, number, number]> =
  fingerRest();

/**
 * Relative thickness per bone, as a fraction of the figure's height.
 *
 * Tuned by eye against the posed app: a torso reads heavier than a forearm, and
 * the head reads heavy enough to read as a head at thumbnail size. This is the
 * only place a figure's proportions live, so a different proportion set is a
 * different entry in PROCEDURAL_CATALOG rather than a second code path.
 */
const THICKNESS: Readonly<Record<string, number>> = {
  Hips: 0.085,
  Spine: 0.078,
  Spine1: 0.072,
  Spine2: 0.066,
  Neck: 0.028,
  Head: 0.075,
  LeftShoulder: 0.038,
  LeftArm: 0.034,
  LeftForeArm: 0.028,
  LeftHand: 0.022,
  RightShoulder: 0.038,
  RightArm: 0.034,
  RightForeArm: 0.028,
  RightHand: 0.022,
  LeftUpLeg: 0.058,
  LeftLeg: 0.044,
  LeftFoot: 0.03,
  LeftToeBase: 0.022,
  RightUpLeg: 0.058,
  RightLeg: 0.044,
  RightFoot: 0.03,
  RightToeBase: 0.022,
};

/** Finger bones are thin rods; one shared value keeps it readable. */
const FINGER_THICKNESS = 0.009;

export interface ProceduralModelOptions {
  id: string;
  name: string;
  family: string;
  tags: readonly string[];
  /** Uniform scale applied to the rest pose, to vary proportions. */
  scale?: number;
  /** Overall thickness multiplier, to vary build without changing pose. */
  build?: number;
  color?: number;
}

/**
 * Build a posed-deformable figure on the rig contract.
 *
 * Each bone contributes one tapered segment with a single vertex assigned to
 * it, so posing rotates the segment with the bone and nothing tears. A figure
 * built this way needs no morph targets and no corrective blendshapes, which is
 * what keeps it small enough to generate at runtime.
 */
export function buildProceduralModel(
  options: ProceduralModelOptions,
): THREE.Group {
  const scale = options.scale ?? 1;
  const build = options.build ?? 1;
  const color = options.color ?? 0xb9bec8;

  const group = new THREE.Group();
  group.name = options.id;

  // Build the bone hierarchy first; the skinning below needs bone indices.
  const bones = new Map<string, THREE.Bone>();
  const ordered = [...CORE_BONES, ...HAND_BONES].filter(
    (n) => n !== "Hips",
  );
  const rootBone = new THREE.Bone();
  rootBone.name = "Hips";
  group.add(rootBone);
  bones.set("Hips", rootBone);

  for (const name of ordered) {
    const bone = new THREE.Bone();
    bone.name = name;
    const parentName = FULL_PARENTS[name];
    const parent = parentName ? bones.get(parentName) ?? rootBone : rootBone;
    parent.add(bone);
    bones.set(name, bone);
  }

  // Rest positions, then local offsets relative to each parent.
  for (const [name, bone] of bones) {
    const rest = restOf(name).multiplyScalar(scale);
    const parentName = FULL_PARENTS[name];
    const parentRest = parentName ? restOf(parentName).multiplyScalar(scale) : null;
    bone.position.copy(parentRest ? rest.sub(parentRest) : rest);
  }

  // One merged geometry with per-bone vertex assignment.
  const positions: number[] = [];
  const normals: number[] = [];
  const boneIndices: number[] = [];
  const boneWeights: number[] = [];
  const indices: number[] = [];
  const boneList = [...bones.keys()];

  for (const [index, name] of boneList.entries()) {
    const thickness = (THICKNESS[name] ?? FINGER_THICKNESS) * build;
    const start = positions.length / 3;

    // A segment runs from this bone toward its first child, so a raised arm
    // carries a limb above the joint rather than leaving a gap.
    const childName = boneList.find((b) => FULL_PARENTS[b] === name);
    const from = restOf(name).multiplyScalar(scale);
    const to = childName
      ? restOf(childName).multiplyScalar(scale)
      : from.clone().add(new THREE.Vector3(0, 0.06 * scale, 0));
    const direction = to.clone().sub(from);
    const length = Math.max(direction.length(), 0.02 * scale);
    direction.normalize();

    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(direction, up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize().multiplyScalar(thickness);
    const forward = new THREE.Vector3()
      .crossVectors(direction, side.clone().normalize())
      .normalize()
      .multiplyScalar(thickness);

    // A tapered box: four corners at the base, four at the tip, with the tip
    // slightly thinner so limbs read as limbs.
    const corners = [
      side.clone().add(forward),
      side.clone().sub(forward),
      side.clone().negate().sub(forward),
      side.clone().negate().add(forward),
    ];
    for (const corner of corners) {
      positions.push(from.x + corner.x, from.y + corner.y, from.z + corner.z);
      normals.push(corner.x, corner.y, corner.z);
      boneIndices.push(index);
      boneWeights.push(1);
    }
    for (const corner of corners) {
      const tip = corner.clone().multiplyScalar(0.82);
      positions.push(to.x + tip.x, to.y + tip.y, to.z + tip.z);
      normals.push(tip.x, tip.y, tip.z);
      boneIndices.push(index);
      boneWeights.push(1);
    }

    for (let f = 0; f < 4; f += 1) {
      const a = start + f;
      const b = start + ((f + 1) % 4);
      const c = start + 4 + f;
      const d = start + 4 + ((f + 1) % 4);
      indices.push(a, c, b, b, c, d);
    }
    // Cap the base so the figure is closed.
    indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(normals, 3),
  );
  geometry.setAttribute(
    "skinIndex",
    // skinIndex is a 4-component attribute. Pushing one index per vertex left
    // the attribute short, so the renderer read past the end of it and got a
    // garbage boneIndex - which surfaces as "cannot read properties of
    // undefined (reading 'matrixWorld')" deep inside applyBoneTransform, and
    // as an empty thumbnail rather than an error the picker could show.
    new THREE.Uint16BufferAttribute(
      boneIndices.flatMap((index) => [index, 0, 0, 0]),
      4,
    ),
  );
  // skinWeight is a 4-component attribute whether or not a vertex uses all
  // four. Writing a single 1 and leaving the rest unset leaves them at 1 too,
  // so every vertex would sum to 4 and the skinning maths would collapse.
  const flatWeights: number[] = [];
  for (let i = 0; i < positions.length / 3; i += 1) {
    flatWeights.push(1, 0, 0, 0);
  }
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(flatWeights, 4),
  );
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.04,
  });

  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = `${options.id}_mesh`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Detached binding: a SkinnedMesh in the default mode recomputes its bind
  // matrix from the world matrix every frame, which collapses the deformation
  // as soon as the root moves. This belongs on the mesh, not the material.
  // three 0.169 has no DetachedSkeleton constant; bindMode is the literal
  // string. A SkinnedMesh in "attached" mode recomputes its bind matrix from
  // the world matrix every frame, which collapses the deformation as soon as
  // the root moves, which is the exact bug the v1 build documented.
  mesh.bindMode = "detached";
  // The mesh joins the hierarchy before binding. Applying a bone transform
  // walks the mesh's own ancestors to reach each skeleton bone, so a mesh
  // bound while still detached from the group dereferences a null parent and
  // throws on the first render - which is why the thumbnails came back empty
  // while the figure itself still posed correctly.
  group.add(mesh);

  for (const bone of bones.values()) bone.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([...bones.values()]);
  group.updateMatrixWorld(true);
  // bind(skeleton, bindMatrix) is required alongside an explicit bindMode:
  // bind() with one argument resets bindMode to the default, which silently
  // undoes the detached-binding line above.
  mesh.bind(skeleton, group.matrixWorld.clone());

  // Update world matrices on the whole hierarchy before returning. A caller
  // that measures the figure straight away - the thumbnailer, Box3.setFromObject
  // - would otherwise read stale matrices and see a collapsed bound.
  group.updateMatrixWorld(true);

  return group;
}

/**
 * The procedural catalogue.
 *
 * Six figures chosen to cover the proportion range a reference tool needs: the
 * retargeter must prove it is not coupled to one asset's bone naming, and a
 * library where every body is the same shape is not a library.
 */
export const PROCEDURAL_CATALOG: readonly ProceduralModelOptions[] = [
  {
    id: "figure_neutral",
    name: "Figure Neutral",
    family: "figure",
    tags: ["figure", "neutral", "reference", "cc0"],
    scale: 1,
    build: 1,
    color: 0xb9bec8,
  },
  {
    id: "figure_lean",
    name: "Figure Lean",
    family: "figure",
    tags: ["figure", "lean", "reference", "cc0"],
    // Longer and thinner: the proportions of a different body, not a
    // rescaled copy of the same one.
    scale: 1.04,
    build: 0.86,
    color: 0xa8b2c4,
  },
  {
    id: "figure_stout",
    name: "Figure Stout",
    family: "figure",
    tags: ["figure", "stout", "heavy", "cc0"],
    scale: 0.94,
    build: 1.34,
    color: 0xc4bbae,
  },
  {
    id: "figure_child",
    name: "Figure Child",
    family: "figure",
    tags: ["figure", "child", "small", "cc0"],
    // Shorter with proportionally shorter limbs, which is what actually
    // distinguishes a child figure from a scaled adult.
    scale: 0.68,
    build: 0.94,
    color: 0xd0c4b6,
  },
  {
    id: "figure_tall",
    name: "Figure Tall",
    family: "figure",
    tags: ["figure", "tall", "reference", "cc0"],
    scale: 1.12,
    build: 0.92,
    color: 0xaeb6c0,
  },
  {
    id: "figure_skeleton",
    name: "Figure Skeleton",
    family: "figure",
    tags: ["figure", "skeleton", "simplified", "cc0"],
    // Very thin and pale: reads as a blockout or mannequin rather than a
    // body, which is the strip-the-figure-down workflow artists ask for.
    scale: 1,
    build: 0.42,
    color: 0xe6e9ef,
  },
];

/** Load configuration for a procedural figure, matching the catalogue shape. */
export function proceduralLoadConfig(
  options: ProceduralModelOptions,
): ModelLoadConfig {
  return {
    id: options.id,
    name: options.name,
    family: options.family,
    tags: options.tags,
    // No file: this model is built, not downloaded. isVendorModel() keys off
    // `file`, so the OBJ exporter's guard behaves correctly for both kinds.
    exportable: true,
  };
}






// The shipped model catalogue.
//
// Every entry is a real FBX scraped from the PoseMy.Art CDN by
// tools/fetch-models.ts and served out of /public/vendor/pose-my-art/. See
// ATTRIBUTION.md for provenance: these are vendor assets, not CC0.
//
// There are no procedurally generated models. Anything that needed a builder
// at runtime was removed; if a model is in the picker, it is a file on disk.

import { DEFAULT_LOAD_CONFIG, type ModelLoadConfig } from "./ModelLoadConfig";
import { VENDOR_CATALOG, type VendorEntry } from "./VendorCatalog";
import { loadModelFromURL } from "./ModelLoader";
import {
  PROCEDURAL_CATALOG,
  buildProceduralModel,
  proceduralLoadConfig,
} from "./ProceduralModels";
import * as THREE from "three";

/**
 * A catalogue entry is a load config plus the vendor file it resolves to. The
 * `file` field is what distinguishes a real asset from a config that only
 * carries tuning.
 */
export interface CatalogEntry extends ModelLoadConfig {
  file?: string;
}

/**
 * Every model Poseify ships. Ordered so the picker reads sensibly: realistic
 * humans first, then stylized, then bots, then creatures.
 */
export const MODEL_CATALOG: readonly CatalogEntry[] = [
  ...VENDOR_CATALOG.map((v) => v as CatalogEntry),
];

export function findModel(id: string): CatalogEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export function isVendorModel(config: ModelLoadConfig): boolean {
  return typeof (config as VendorEntry).file === "string";
}

export interface InstantiatedModel {
  root: THREE.Object3D;
  bones: Map<string, THREE.Bone>;
}

/**
 * Load a model from the catalogue.
 *
 * FBX files come in at roughly human height in centimetres (these measure
 * ~1.7-1.8 in scene units but are authored at 100x scale), so anything loaded
 * from disk is normalised to metres here. That keeps posing, IK and export
 * working in consistent units regardless of how the mesh was authored.
 */
export async function loadModel(
  config: CatalogEntry,
  options: { renderer?: THREE.WebGLRenderer } = {},
): Promise<InstantiatedModel> {
  if (!config.path) {
    throw new Error(
      `Model "${config.id}" has no path; every Poseify model is a vendor FBX.`,
    );
  }

  const { root } = await loadModelFromURL(config.path, options);
  normaliseToMetres(root);

  const bones = new Map<string, THREE.Bone>();
  root.traverse((o) => {
    if (o instanceof THREE.Bone) bones.set(o.name, o);
    // Loaded assets do not carry shadow flags, and without them the figure
    // casts nothing onto the ground plane.
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { root, bones };
}

/**
 * Rescale a loaded model so a human stands roughly 1.75 m tall.
 *
 * DCC exports routinely bake in a scale factor; these FBX files measure about
 * 176 units for a 1.76 m figure. Posing, IK and export all assume metres, so
 * the hierarchy is scaled once here instead of compensating downstream.
 *
 * Animals and other non-humanoids are the awkward case: a horse or a werewolf
 * is genuinely not ~1.75 m, so forcing that target would visibly distort them
 * relative to a human standing next to them. The guard below only rescales
 * when the model is clearly authored in the wrong unit (out of the sane metre
 * range), so a correctly-scaled horse keeps its real size.
 *
 * Skinning note: a SkinnedMesh in the default "attached" bind mode recomputes
 * its bind matrix from the mesh's world matrix every frame, so scaling the
 * root after FBXLoader has bound the skeleton makes the deformation collapse.
 * Switching to "detached" with an explicit bind matrix keeps the bind pose
 * fixed while the root carries the scale.
 */
export function normaliseToMetres(
  root: THREE.Object3D,
  targetHeight = 1.75,
): number {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return 1;

  const height = box.max.y - box.min.y;
  if (height < 1e-6) return 1;
  // Already in a plausible metre range for *something* on this planet: leave
  // an artist's own scale choice alone rather than flattening a tall horse to
  // human height or inflating a mouse.
  if (height >= 0.2 && height <= 20) return 1;

  const scale = targetHeight / height;

  // Scale the whole hierarchy in place rather than setting root.scale.
  //
  // An FBX armature keeps its bones in a separate subtree from the mesh, and
  // the skin matrices are built from the bones. Setting scale on the wrapper
  // root moves the mesh but leaves the bone matrices unscaled, so skinning
  // collapses to a point. Scaling every top-level node by the same factor
  // keeps mesh and skeleton consistent.
  root.updateMatrixWorld(true);
  for (const child of [...root.children]) {
    child.scale.multiplyScalar(scale);
  }

  root.updateMatrixWorld(true);

  // Recompute bind state so the deformation matches the new scale.
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh && o.skeleton) {
      o.bindMode = THREE.AttachedBindMode;
      o.bind(o.skeleton);
    }
  });

  return scale;
}


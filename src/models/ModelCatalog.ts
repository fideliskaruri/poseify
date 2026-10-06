// The shipped model catalogue.
//
// Poseify ships only assets it has rights to distribute. The default figure is
// a rigged humanoid under public/models/ (see ATTRIBUTION.md).

import { DEFAULT_LOAD_CONFIG, type ModelLoadConfig } from "./ModelLoadConfig";
import { loadModelFromURL } from "./ModelLoader";
import * as THREE from "three";

/** A catalogue entry is a load config plus optional on-disk file name. */
export interface CatalogEntry extends ModelLoadConfig {
  file?: string;
}

/**
 * Every model Poseify ships. One bundled humanoid so a fresh clone can pose
 * without fetching third-party CDN content.
 */
export const MODEL_CATALOG: readonly CatalogEntry[] = [
  {
    ...DEFAULT_LOAD_CONFIG,
    id: "cc0-humanoid",
    name: "CC0 Humanoid",
    family: "human",
    tags: ["cc0", "humanoid", "default"],
    path: "/models/cc0-humanoid.glb",
    file: "cc0-humanoid.glb",
    exportable: true,
  },
];

export function findModel(id: string): CatalogEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

/** True when the entry points at a loadable file path. */
export function isBundledModel(config: ModelLoadConfig): boolean {
  return typeof config.path === "string" && config.path.length > 0;
}

export interface InstantiatedModel {
  root: THREE.Object3D;
  bones: Map<string, THREE.Bone>;
}

/**
 * Load a model from the catalogue.
 * Disk assets are normalised to metres so posing, IK and export share units.
 */
export async function loadModel(
  config: CatalogEntry,
  options: { renderer?: THREE.WebGLRenderer } = {},
): Promise<InstantiatedModel> {
  if (!config.path) {
    throw new Error(
      `Model "${config.id}" has no file to load. Add a path under public/models/.`,
    );
  }

  const { root } = await loadModelFromURL(config.path, options);
  normaliseToMetres(root);

  const bones = new Map<string, THREE.Bone>();
  root.traverse((o) => {
    if (o instanceof THREE.Bone) bones.set(o.name, o);
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { root, bones };
}

/**
 * Rescale a loaded model so a human stands roughly 1.75 m tall.
 * Only rescales when clearly authored in the wrong unit.
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
  if (height >= 0.2 && height <= 20) return 1;

  const scale = targetHeight / height;

  root.updateMatrixWorld(true);
  for (const child of [...root.children]) {
    child.scale.multiplyScalar(scale);
  }

  root.updateMatrixWorld(true);

  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh && o.skeleton) {
      o.bindMode = THREE.AttachedBindMode;
      o.bind(o.skeleton);
    }
  });

  return scale;
}

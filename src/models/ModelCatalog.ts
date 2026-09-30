// The shipped model catalogue. Every entry resolves to a procedural builder
// (cheap, always available) or a URL under /public. All content is CC0 or
// generated in-app; see ATTRIBUTION.md.

import {
  ADULT,
  BRUTE,
  CHILD,
  MUSCULAR,
  SKINNY,
  STOCKY,
  buildProceduralHumanoid,
  type BodyProportions,
} from "./ProceduralHumanoid";
import { DEFAULT_LOAD_CONFIG, type ModelLoadConfig } from "./ModelLoadConfig";
import { BOT_SPECS, buildBot, type BotSpec } from "./BotModels";
import { VENDOR_CATALOG, type VendorEntry } from "./VendorCatalog";
import { loadModelFromURL } from "./ModelLoader";
import * as THREE from "three";

interface ProceduralSpec {
  proportions: BodyProportions;
  color: number;
}

export interface CatalogEntry extends ModelLoadConfig {
  proceduralSpec?: ProceduralSpec;
  botSpec?: BotSpec;
}

function entry(
  id: string,
  name: string,
  family: string,
  tags: string[],
  spec: ProceduralSpec,
  tuning: Partial<ModelLoadConfig> = {},
): CatalogEntry {
  return {
    ...DEFAULT_LOAD_CONFIG,
    id,
    name,
    family,
    tags,
    proceduralSpec: spec,
    ...tuning,
  };
}

const GREY = 0xb9bdc4;
const WARM = 0xcbb9a8;
const PALE = 0xd6d2cb;
const DARK = 0x8d9299;

const CHIBI: BodyProportions = {
  height: 1.05,
  shoulderScale: 0.7,
  hipScale: 0.85,
  limbScale: 0.7,
  depthScale: 0.9,
  headScale: 1.7,
};

// Procedurally built models, always available with no network fetch. Ids are
// prefixed so they never collide with the real FBX models, which take priority
// in the picker.
const RAW_PROCEDURAL: readonly CatalogEntry[] = [
  ...BOT_SPECS.map((spec) => ({
    ...DEFAULT_LOAD_CONFIG,
    id: spec.id,
    name: spec.name,
    family: "bot",
    tags: ["bot", "simplified"],
    boneSize: spec.boneSize,
    handBoneSize: spec.handBoneSize,
    hipBoneSize: spec.hipBoneSize,
    botSpec: spec,
  })),
  entry("adult_male", "Adult Male", "human", ["male", "adult", "neutral"], {
    proportions: ADULT,
    color: GREY,
  }),
  entry(
    "adult_female",
    "Adult Female",
    "human",
    ["female", "adult", "neutral"],
    {
      proportions: { ...ADULT, shoulderScale: 0.92, hipScale: 1.08, limbScale: 0.94 },
      color: GREY,
    },
  ),
  entry("muscular_male", "Muscular Male", "human", ["male", "muscular"], {
    proportions: MUSCULAR,
    color: WARM,
  }),
  entry(
    "muscular_female",
    "Muscular Female",
    "human",
    ["female", "muscular"],
    {
      proportions: {
        ...MUSCULAR,
        shoulderScale: 1.12,
        hipScale: 1.02,
        limbScale: 1.16,
      },
      color: WARM,
    },
  ),
  entry("stocky_male", "Stocky Male", "human", ["male", "stocky"], {
    proportions: STOCKY,
    color: WARM,
  }),
  entry("skinny_male", "Skinny Male", "human", ["male", "skinny"], {
    proportions: SKINNY,
    color: PALE,
  }),
  entry("skinny_female", "Skinny Female", "human", ["female", "skinny"], {
    proportions: { ...SKINNY, shoulderScale: 0.82, hipScale: 1 },
    color: PALE,
  }),
  entry("teen_male", "Teen Male", "human", ["male", "teen"], {
    proportions: { ...ADULT, height: 1.62 },
    color: GREY,
  }),
  entry("teen_female", "Teen Female", "human", ["female", "teen"], {
    proportions: {
      ...ADULT,
      height: 1.58,
      shoulderScale: 0.92,
      hipScale: 1.05,
    },
    color: GREY,
  }),
  entry("child_boy", "Child Boy", "human", ["male", "child"], {
    proportions: { ...CHILD, height: 1.22 },
    color: PALE,
  }),
  entry("child_girl", "Child Girl", "human", ["female", "child"], {
    proportions: { ...CHILD, height: 1.2, shoulderScale: 0.8, hipScale: 1.05 },
    color: PALE,
  }),
  entry("male_brute", "Male Brute", "human", ["male", "brute", "big"], {
    proportions: BRUTE,
    color: DARK,
  },
  // Bigger models need smaller relative handles to stay clickable.
  {
    boneSize: 4,
    handBoneSize: 1,
    hipBoneSize: 6,
  }),
  entry("female_brute", "Female Brute", "human", ["female", "brute", "big"], {
    proportions: { ...BRUTE, shoulderScale: 1.3, hipScale: 1.2, limbScale: 1.45 },
    color: DARK,
  }, {
    boneSize: 4,
    handBoneSize: 1,
    hipBoneSize: 6,
  }),
  entry("chibi_male", "Chibi Male", "stylized", ["male", "chibi", "cute"], {
    proportions: CHIBI,
    color: WARM,
  },
  // Small models need proportionally larger handles.
  {
    boneSize: 2.6,
    handBoneSize: 0.8,
    hipBoneSize: 4.5,
  }),
  entry("chibi_female", "Chibi Female", "stylized", ["female", "chibi", "cute"], {
    proportions: { ...CHIBI, height: 1.02, shoulderScale: 0.66, hipScale: 0.95, headScale: 1.75 },
    color: WARM,
  }, {
    boneSize: 2.6,
    handBoneSize: 0.8,
    hipBoneSize: 4.5,
  }),
  entry("anime_female", "Anime Female", "stylized", ["female", "anime"], {
    proportions: {
      height: 1.66,
      shoulderScale: 0.88,
      hipScale: 1.04,
      limbScale: 0.88,
      depthScale: 0.94,
      headScale: 1.16,
    },
    color: PALE,
  }, {
    boneSize: 3,
    handBoneSize: 0.8,
    hipBoneSize: 5,
  }),
  entry("anime_male", "Anime Male", "stylized", ["male", "anime"], {
    proportions: {
      height: 1.74,
      shoulderScale: 1.02,
      hipScale: 0.96,
      limbScale: 0.94,
      depthScale: 0.96,
      headScale: 1.12,
    },
    color: PALE,
  }, {
    boneSize: 3,
    handBoneSize: 0.8,
    hipBoneSize: 5,
  }),
];

export const PROCEDURAL_CATALOG: readonly CatalogEntry[] = RAW_PROCEDURAL.map(
  (m) => ({
    ...m,
    id: `proc_${m.id}`,
    name: `${m.name} (built-in)`,
  }),
);

/**
 * Every model Poseify ships: real FBX models first, then procedural bots and
 * mannequins as offline fallbacks.
 */
export const MODEL_CATALOG: readonly CatalogEntry[] = [
  ...VENDOR_CATALOG,
  ...PROCEDURAL_CATALOG,
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
 * Build a model, loading its FBX over the network when it has a path.
 *
 * FBX files come in at roughly human height in centimetres (these measure
 * ~1.7-1.8 in scene units but are authored at 100x scale), so anything loaded
 * from disk is normalised to metres here. That keeps posing, IK and export
 * working in consistent units regardless of how the mesh was authored.
 */
export async function loadModel(
  config: ModelLoadConfig,
  options: { renderer?: THREE.WebGLRenderer } = {},
): Promise<InstantiatedModel> {
  if (isVendorModel(config)) {
    const { root } = await loadModelFromURL(config.path!, options);
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

  const botSpec = (config as CatalogEntry).botSpec;
  if (botSpec) {
    const built = buildBot(botSpec);
    return { root: built.root, bones: built.bones };
  }

  const spec = (config as CatalogEntry).proceduralSpec;
  if (!spec) {
    throw new Error(
      `Model "${config.id}" has no procedural spec and no path; nothing to build.`,
    );
  }
  const built = buildProceduralHumanoid(spec.proportions, {
    includeFingers: true,
    materialColor: spec.color,
  });
  built.root.name = config.id;
  return { root: built.root, bones: built.bones };
}

/**
 * Rescale a loaded model so a human stands roughly 1.75 m tall.
 *
 * DCC exports routinely bake in a scale factor; these FBX files measure about
 * 176 units for a 1.76 m figure. Posing, IK and export all assume metres, so
 * the hierarchy is scaled once here instead of compensating downstream.
 * A model already in a sane range is left alone so an artist's own scale
 * choice is respected.
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
  if (height >= 0.5 && height <= 20) return 1;

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
/** Synchronous instantiation for procedural models only (tests, thumbnails). */
export function instantiateModel(config: ModelLoadConfig): {
  root: THREE.Group;
  bones: Map<string, THREE.Bone>;
} {
  if (isVendorModel(config)) {
    throw new Error(
      `Model "${config.id}" is a remote FBX and cannot be built synchronously. ` +
        `Use loadModel().`,
    );
  }
  const botSpec = (config as CatalogEntry).botSpec;
  if (botSpec) {
    const built = buildBot(botSpec);
    return { root: built.root, bones: built.bones };
  }

  const spec = (config as CatalogEntry).proceduralSpec;
  if (!spec) {
    throw new Error(
      `Model "${config.id}" has no procedural spec and no path; nothing to build.`,
    );
  }
  const built = buildProceduralHumanoid(spec.proportions, {
    includeFingers: true,
    materialColor: spec.color,
  });
  built.root.name = config.id;
  return { root: built.root, bones: built.bones };
}

// The shipped model catalogue. Every entry resolves to a procedural builder
// (cheap, always available) or a URL under /public. All content is CC0 or
// generated in-app; see ATTRIBUTION.md.

import type * as THREE from "three";
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

interface ProceduralSpec {
  proportions: BodyProportions;
  color: number;
}

export interface CatalogEntry extends ModelLoadConfig {
  proceduralSpec?: ProceduralSpec;
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

/** All models Poseify ships. */
export const MODEL_CATALOG: readonly CatalogEntry[] = [
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
    // Bigger models need smaller relative handles to stay clickable.
    boneSize: 4,
    handBoneSize: 1,
    hipBoneSize: 6,
  }),
  entry("female_brute", "Female Brute", "human", ["female", "brute", "big"], {
    proportions: { ...BRUTE, shoulderScale: 1.3, hipScale: 1.2, limbScale: 1.45 },
    color: DARK,
    boneSize: 4,
    handBoneSize: 1,
    hipBoneSize: 6,
  }),
  entry("chibi_male", "Chibi Male", "stylized", ["male", "chibi", "cute"], {
    proportions: CHIBI,
    color: WARM,
    // Small models need proportionally larger handles.
    boneSize: 2.6,
    handBoneSize: 0.8,
    hipBoneSize: 4.5,
  }),
  entry("chibi_female", "Chibi Female", "stylized", ["female", "chibi", "cute"], {
    proportions: { ...CHIBI, height: 1.02, shoulderScale: 0.66, hipScale: 0.95, headScale: 1.75 },
    color: WARM,
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
    boneSize: 3,
    handBoneSize: 0.8,
    hipBoneSize: 5,
  }),
];

export function findModel(id: string): CatalogEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

/** Instantiate a catalogue entry's geometry and rig. */
export function instantiateModel(config: ModelLoadConfig): {
  root: THREE.Group;
  bones: Map<string, THREE.Bone>;
} {
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

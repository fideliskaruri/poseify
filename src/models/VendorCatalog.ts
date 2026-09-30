// Catalogue of the real PoseMy.Art FBX models.
//
// ASSET PROVENANCE: these FBX files belong to PoseMy.Art and are NOT CC0 or
// MIT. They live under /public/vendor/pose-my-art/ and are fetched by
// tools/fetch-models.ts. Keep them isolated so they can be swapped for
// cleanly-licensed models later without touching application code. See
// ATTRIBUTION.md.
//
// Bone names in these files use the Mixamo convention behind a namespace
// (mixamorigRightUpLeg / mixamorig1Hips), which src/rig/Retargeter.ts maps back
// onto the rig contract.

import { DEFAULT_LOAD_CONFIG, type ModelLoadConfig } from "./ModelLoadConfig";

export const VENDOR_BASE = "/vendor/pose-my-art";

type Gizmo = Partial<
  Pick<ModelLoadConfig, "boneSize" | "handBoneSize" | "hipBoneSize">
>;

export interface VendorEntry extends ModelLoadConfig {
  file: string;
}

function vendor(
  id: string,
  name: string,
  file: string,
  family: string,
  tags: string[],
  extra: Gizmo & { exportable?: boolean } = {},
): VendorEntry {
  return {
    ...DEFAULT_LOAD_CONFIG,
    id,
    name,
    family,
    tags,
    path: `${VENDOR_BASE}/${file}`,
    file,
    exportable: true,
    ...extra,
  };
}

const CHIBI_GIZMO: Gizmo = {
  boneSize: 2.6,
  handBoneSize: 0.8,
  hipBoneSize: 4.5,
};
const BIG_GIZMO: Gizmo = { boneSize: 4, handBoneSize: 1, hipBoneSize: 6 };
const ANIME_GIZMO: Gizmo = { boneSize: 3, handBoneSize: 0.8, hipBoneSize: 5 };

/** Every FBX model Poseify ships from the vendor set. */
export const VENDOR_CATALOG: readonly VendorEntry[] = [
  vendor(
    "mannequin_male",
    "Mannequin Male",
    "male_mannequin_OP_IK.fbx",
    "human",
    ["male", "mannequin", "neutral"],
  ),
  vendor("stocky_male", "Stocky Male", "male_stocky_OP_IK.fbx", "human", [
    "male",
    "stocky",
    "adult",
  ]),
  vendor("stocky_female", "Stocky Female", "female_stocky_OP_IK.fbx", "human", [
    "female",
    "stocky",
    "adult",
  ]),
  vendor("teen_male", "Teen Fit Male", "male_teen_fit_OP_IK.fbx", "human", [
    "male",
    "teen",
  ]),
  vendor("teen_female", "Teen Fit Female", "female_teen_fit_OP_IK.fbx", "human", [
    "female",
    "teen",
  ]),
  vendor(
    "anime_female",
    "Anime Female",
    "anime_female_OP_IK.fbx",
    "stylized",
    ["female", "anime"],
    ANIME_GIZMO,
  ),
  vendor(
    "anime_basic_male",
    "Anime Basic Male",
    "anime_basic_male_OP_IK.fbx",
    "stylized",
    ["male", "anime"],
    ANIME_GIZMO,
  ),
  vendor(
    "anime_basic_female",
    "Anime Basic Female",
    "anime_basic_female_OP_IK.fbx",
    "stylized",
    ["female", "anime"],
    ANIME_GIZMO,
  ),
  vendor(
    "chibi_male",
    "Chibi Male",
    "chibi_male_OP_IK.fbx",
    "stylized",
    ["male", "chibi", "cute"],
    CHIBI_GIZMO,
  ),
  vendor(
    "zombie_alien",
    "Zombie / Alien",
    "zombie_alien_OP_IK.fbx",
    "creature",
    ["zombie", "alien", "scifi"],
    { exportable: false },
  ),
  vendor("bot_y", "Bot Male", "new_Y_bot_OP_IK.fbx", "bot", ["bot", "male"], BIG_GIZMO),
  vendor("bot_x", "Bot Female", "new_X_bot_OP_IK.fbx", "bot", ["bot", "female"], BIG_GIZMO),
  vendor(
    "bot_y_fixed",
    "Bot Male (Fixed)",
    "y_bot_fixed_OP_IK.fbx",
    "bot",
    ["bot", "male"],
    BIG_GIZMO,
  ),
  vendor(
    "bot_x_fixed",
    "Bot Female (Fixed)",
    "x_bot_fixed_OP_IK.fbx",
    "bot",
    ["bot", "female"],
    BIG_GIZMO,
  ),
  vendor("mixamo_ybot", "Mixamo Y Bot", "ybot_opt.fbx", "bot", ["bot"], BIG_GIZMO),
  vendor("mixamo_xbot", "Mixamo X Bot", "xbot_opt.fbx", "bot", ["bot"], BIG_GIZMO),
];

export function findVendorModel(id: string): VendorEntry | undefined {
  return VENDOR_CATALOG.find((m) => m.id === id);
}

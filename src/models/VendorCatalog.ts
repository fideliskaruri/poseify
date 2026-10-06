// Catalogue of FBX figures served from the project CDN.
//
// Files live under /public/vendor/pose-my-art/ and are fetched by
// tools/fetch-models.ts from the project CDN, using names listed in
// research/model-catalog.csv. See ATTRIBUTION.md.
//
// The list below is the set fetch recorded as downloaded. When you re-run
// `npm run models:fetch`, cross-check it against
// public/vendor/pose-my-art/catalog-report.json and add any newly reachable
// file here.
//
// Bone names use the Mixamo convention behind a namespace
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
  tags: readonly string[],
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

// Gizmo tuning is what makes posing "feel" different on a chibi vs a brute.
// Bigger models get proportionally smaller handles so joints stay clickable.
const CHIBI_GIZMO: Gizmo = {
  boneSize: 2.6,
  handBoneSize: 0.8,
  hipBoneSize: 4.5,
};
const BIG_GIZMO: Gizmo = { boneSize: 4, handBoneSize: 1, hipBoneSize: 6 };
const ANIME_GIZMO: Gizmo = { boneSize: 3, handBoneSize: 0.8, hipBoneSize: 5 };
const BRUTE_GIZMO: Gizmo = { boneSize: 4, handBoneSize: 1, hipBoneSize: 6 };

/**
 * Every FBX model Poseify ships from the vendor set.
 *
 * `exportable` follows the CSV's own `exportable` column: figures that carry a
 * usable humanoid contract are exported to OBJ, and creatures that do not
 * (mermaids, werewolf, horse) are not.
 */
export const VENDOR_CATALOG: readonly VendorEntry[] = [
  // --- Realistic human ---------------------------------------------------
  vendor(
    "mannequin_male",
    "Mannequin Male",
    "male_mannequin_OP_IK.fbx",
    "human",
    ["male", "mannequin", "neutral"],
  ),
  vendor(
    "realistic_woman",
    "Realistic Woman",
    "realistic_woman_OP_IK.fbx",
    "human",
    ["female", "realistic", "adult"],
  ),
  vendor(
    "realistic_muscular_male",
    "Realistic Muscular Male",
    "realistic_muscular_male_OP_IK.fbx",
    "human",
    ["male", "muscular", "realistic", "adult"],
    BRUTE_GIZMO,
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
  vendor("muscular_female", "Muscular Female", "female_musculer_OP_IK.fbx", "human", [
    "female",
    "muscular",
    "adult",
  ]),
  vendor("skinny_male", "Skinny Male", "male_skinny_OP_IK.fbx", "human", [
    "male",
    "skinny",
    "adult",
  ]),
  vendor("skinny_female", "Skinny Female", "female_skinny_OP_IK.fbx", "human", [
    "female",
    "skinny",
    "adult",
  ]),
  vendor("brute_male", "Brute Male", "male_brute_OP_IK.fbx", "human", [
    "male",
    "brute",
    "big",
  ]),
  vendor("teen_male", "Teen Fit Male", "male_teen_fit_OP_IK.fbx", "human", [
    "male",
    "teen",
  ]),
  vendor("teen_female", "Teen Fit Female", "female_teen_fit_OP_IK.fbx", "human", [
    "female",
    "teen",
  ]),
  vendor("male_young_teen", "Male Young Teen", "male_age_10_OP_IK.fbx", "human", [
    "male",
    "child",
    "young",
  ]),

  // --- Anime / stylized --------------------------------------------------
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
    "anime_curvy_female",
    "Anime Curvy Female",
    "anime_big_breast_OP_IK.fbx",
    "stylized",
    ["female", "anime"],
    ANIME_GIZMO,
  ),
  vendor(
    "anime_tall_curvy_female",
    "Anime Tall Curvy Female",
    "anime_tall_busty_female_OP_IK.fbx",
    "stylized",
    ["female", "anime", "tall"],
    ANIME_GIZMO,
  ),
  vendor(
    "anime_tall_male",
    "Anime Tall Male",
    "anime_tall_male_OP_IK.fbx",
    "stylized",
    ["male", "anime", "tall"],
    ANIME_GIZMO,
  ),
  vendor(
    "anime_child_girl",
    "Anime Child Girl",
    "anime_child_girl_OP_IK.fbx",
    "stylized",
    ["female", "anime", "child"],
    CHIBI_GIZMO,
  ),
  vendor(
    "anime_child_boy",
    "Anime Child Boy",
    "anime_child_boy_OP_IK.fbx",
    "stylized",
    ["male", "anime", "child"],
    CHIBI_GIZMO,
  ),
  vendor(
    "chibi_male",
    "Chibi Male",
    "chibi_male_OP_IK.fbx",
    "stylized",
    ["male", "chibi", "cute"],
    CHIBI_GIZMO,
  ),

  // --- Bots / skeletons --------------------------------------------------
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
  vendor(
    "skeleton",
    "Skeleton",
    "skeleton_OP_IK.fbx",
    "skeleton",
    ["skeleton", "rig"],
  ),

  // --- Creatures / animals (not humanoid) -------------------------------
  vendor(
    "zombie_alien",
    "Zombie / Alien",
    "zombie_alien_OP_IK.fbx",
    "creature",
    ["zombie", "alien", "scifi"],
  ),
  vendor(
    "werewolf",
    "Werewolf",
    "werewolf_IK.fbx",
    "creature",
    ["werewolf", "fantasy"],
    { exportable: false },
  ),
  vendor(
    "female_mermaid",
    "Female Mermaid",
    "female_mermaid_IK.fbx",
    "creature",
    ["mermaid", "fantasy", "female"],
    { exportable: false },
  ),
  vendor(
    "male_mermaid",
    "Male Mermaid",
    "male_mermaid_IK.fbx",
    "creature",
    ["mermaid", "fantasy", "male"],
    { exportable: false },
  ),
  vendor(
    "horse",
    "Horse",
    "horse.fbx",
    "animal",
    ["horse", "quadruped"],
    { exportable: false },
  ),
];

export function findVendorModel(id: string): VendorEntry | undefined {
  return VENDOR_CATALOG.find((m) => m.id === id);
}

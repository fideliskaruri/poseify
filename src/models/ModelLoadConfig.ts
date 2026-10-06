// Per-model gizmo tuning.
// Bone handle size is what makes posing "feel" different on a chibi vs a brute,
// so this is stored per model rather than as a global slider.

export interface ModelLoadConfig {
  /** Id used in the model picker and in scene files. */
  id: string;
  name: string;
  /** Human-readable family, used for picker grouping. */
  family: string;
  tags: readonly string[];
  /** Radius multiplier for body-bone gizmos. Typical body handles: 3.0-4.0. */
  boneSize: number;
  /** Radius multiplier for the 42 hand bones. Typical hand handles: 0.8-1.0. */
  handBoneSize: number;
  /** Radius multiplier for the hip/root bone. Typical hip handle: 5.0-6.0. */
  hipBoneSize: number;
  /** Whether OBJ export is permitted for this model. */
  exportable: boolean;
  /** Thumb-relative path under /public. Every shipped model has one. */
  path?: string;
}

export const DEFAULT_LOAD_CONFIG: Omit<
  ModelLoadConfig,
  "id" | "name"
> = {
  family: "mannequin",
  tags: [],
  boneSize: 3,
  handBoneSize: 1,
  hipBoneSize: 6,
  exportable: true,
};

/** Resolve the gizmo size for a specific contract bone name. */
export function gizmoSizeFor(
  config: ModelLoadConfig,
  boneName: string,
): number {
  if (boneName === "Hips") return config.hipBoneSize;
  if (/Hand/.test(boneName)) return config.handBoneSize;
  return config.boneSize;
}


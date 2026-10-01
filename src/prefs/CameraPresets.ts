// Named camera presets, persisted in preferences.
//
// A preset is a framing the artist wants to come back to. It survives reloads
// because that is the whole point: park a framing, go pose something else,
// come back to the same view without re-deriving it by eye.
//
// Validation is strict on load. These values come out of localStorage, which
// is user-editable and survives across app versions, so a NaN coordinate or a
// zero fov would otherwise reach THREE.PerspectiveCamera and produce an
// unusable or unrecoverable viewport.

import type { CameraPose } from "./CameraTypes";

/** Cap on stored presets, so a stray loop cannot grow localStorage forever. */
export const MAX_CAMERA_PRESETS = 24;

function isVec3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/**
 * Keep only presets that can actually be applied.
 *
 * A zero or negative fov is rejected rather than clamped: a clamped value would
 * silently give the artist a view they did not save, while dropping the entry
 * tells them plainly it did not load.
 */
export function validateCameraPoses(value: unknown): CameraPose[] {
  if (!Array.isArray(value)) return [];
  const out: CameraPose[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Partial<CameraPose>;
    if (typeof p.name !== "string" || p.name.trim() === "") continue;
    if (!isVec3(p.position) || !isVec3(p.target)) continue;
    if (typeof p.fov !== "number" || !Number.isFinite(p.fov) || p.fov <= 0) {
      continue;
    }
    out.push({
      name: p.name,
      position: [...p.position],
      target: [...p.target],
      fov: p.fov,
    });
    if (out.length >= MAX_CAMERA_PRESETS) break;
  }
  return out;
}

/**
 * Add a preset, replacing one of the same name.
 *
 * Replacing by name rather than appending is what makes "save this framing"
 * safe to press twice: the second press updates the first instead of leaving a
 * duplicate the artist has to delete.
 */
export function upsertPreset(
  presets: readonly CameraPose[],
  preset: CameraPose,
): CameraPose[] {
  const next = presets.filter((p) => p.name !== preset.name);
  next.push(preset);
  return validateCameraPoses(next);
}

export function removePreset(
  presets: readonly CameraPose[],
  name: string,
): CameraPose[] {
  return presets.filter((p) => p.name !== name);
}


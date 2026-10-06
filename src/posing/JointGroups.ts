// Joint groups: user-defined subsets of the contract bones.
//
// a typical pose reference tool lets an artist define a group so a chain can be posed as a unit.
// The real workflow is "rotate the whole arm" or "reset both hands", which is
// otherwise N separate clicks or a pose re-pick.
//
// Groups are stored as bone names rather than indices, so they survive a model
// swap and can be validated against whatever rig is actually loaded.

import { CORE_BONES } from "../rig/RigContract";
import type { PoseData } from "../posing/PosableSkeleton";

export interface JointGroup {
  id: string;
  name: string;
  /** Contract bone names. Filtered on save against the model that is loaded. */
  bones: readonly string[];
}

/**
 * Bones a group may reference.
 *
 * The 22 body bones rather than the full 62: finger groups are hand-pose work
 * and Phase 5 already covers them through the hand library, while a group of
 * 40 finger bones is not something an artist selects by ticking boxes.
 */
export const GROUPABLE_BONES: readonly string[] = CORE_BONES;

function isBoneName(value: unknown): value is string {
  return typeof value === "string" && GROUPABLE_BONES.includes(value);
}

/**
 * Keep only groups that are usable.
 *
 * A group with no name cannot be shown in a picker, and one with no bones does
 * nothing, so both are dropped rather than rendered as dead rows.
 */
export function validateGroups(value: unknown): JointGroup[] {
  if (!Array.isArray(value)) return [];
  const out: JointGroup[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const g = raw as Partial<JointGroup>;
    if (typeof g.id !== "string" || g.id.trim() === "") continue;
    if (typeof g.name !== "string" || g.name.trim() === "") continue;
    if (!Array.isArray(g.bones)) continue;
    const bones = g.bones.filter(isBoneName);
    if (bones.length === 0) continue;
    out.push({ id: g.id, name: g.name, bones: [...new Set(bones)] });
  }
  return out;
}

/**
 * Narrow a group to the bones a model actually has.
 *
 * Stored groups are authored against the full contract, but a model may be a
 * non-humanoid or may be missing a chain. Silently rotating a missing bone
 * would look like the group does nothing, so the caller is told which bones
 * were dropped.
 */
export function resolveGroupBones(
  group: JointGroup,
  knownBones: ReadonlySet<string>,
): { bones: string[]; missing: string[] } {
  const bones: string[] = [];
  const missing: string[] = [];
  for (const bone of group.bones) {
    if (knownBones.has(bone)) bones.push(bone);
    else missing.push(bone);
  }
  return { bones, missing };
}

/**
 * Reset every bone in a group to bind, leaving the rest of the pose alone.
 *
 * The inverse of rotate-group and the "fix both arms at once" case.
 */
export function resetGroupBones(
  group: JointGroup,
  pose: PoseData,
  knownBones: ReadonlySet<string>,
): { pose: PoseData; missing: string[] } {
  const { bones, missing } = resolveGroupBones(group, knownBones);
  const next: PoseData = { ...pose };
  for (const bone of bones) delete next[bone];
  return { pose: next, missing };
}

/** A stable id from a name, so a group saved twice updates rather than duplicates. */
export function groupIdFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "group";
}

/** Merge a group into a list, replacing one with the same id. */
export function upsertGroup(
  groups: readonly JointGroup[],
  group: JointGroup,
): JointGroup[] {
  const next = groups.filter((g) => g.id !== group.id);
  next.push(group);
  return validateGroups(next);
}

export function removeGroup(
  groups: readonly JointGroup[],
  id: string,
): JointGroup[] {
  return groups.filter((g) => g.id !== id);
}

/**
 * The bones present on a model, for building the group editor.
 *
 * Ordered by GROUPABLE_BONES rather than by BODY_BONES so the editor lists
 * exactly what validateGroups will accept, wrists included. A picker that
 * offers a bone which is then rejected on save is worse than a shorter list.
 */
export function selectableBones(knownBones: ReadonlySet<string>): string[] {
  return GROUPABLE_BONES.filter((b) => knownBones.has(b));
}


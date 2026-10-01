// Anchors: pin one bone's world transform to another bone or a prop.
//
// This is how an artist pins both hands to a prop without solving either chain.
// Anchors are the risky part of Phase 6: a naive implementation either hangs on
// a cycle or oscillates, and both look like a frozen tab rather than a bug.
//
// Two rules make it safe:
//
//   1. Cycles are rejected at *creation* time, with a message. A cycle found
//      later, during the per-frame pass, is already inside the hot loop.
//   2. The pass runs after IK and before the skeleton update, and it walks each
//      anchor chain in dependency order, so a chain always resolves in one
//      sweep.

import * as THREE from "three";
import type { PoseData } from "../posing/PosableSkeleton";

export type AnchorKind = "bone" | "prop";

/** One end of an anchor. */
export type AnchorTarget =
  | { kind: "bone"; name: string }
  | { kind: "prop"; id: string };

export interface Anchor {
  id: string;
  /** The bone that gets pinned. */
  bone: string;
  target: AnchorTarget;
  /**
   * Offset from the target's origin, in the target's local space.
   *
   * Almost every real use needs a non-zero offset: a hand grips a handle, it
   * does not sit at the prop's origin.
   */
  offset: [number, number, number];
}

export interface AnchorRejection {
  ok: false;
  reason: string;
}

/**
 * Validate an anchor before it is created.
 *
 * A self-anchor and a cycle are both rejected with a message rather than being
 * stored and discovered later, because the per-frame pass has no safe way to
 * recover once one is in the chain.
 */
export function validateAnchor(
  anchor: Anchor,
  existing: readonly Anchor[],
): { ok: true } | AnchorRejection {
  if (anchor.bone.trim() === "") {
    return { ok: false, reason: "Pick a joint to pin." };
  }
  if (anchor.target.kind === "bone" && anchor.target.name === anchor.bone) {
    return {
      ok: false,
      reason: `"${anchor.bone}" cannot be anchored to itself.`,
    };
  }
  if (
    anchor.target.kind === "prop" &&
    anchor.id === anchor.target.id
  ) {
    return { ok: false, reason: "A prop cannot be anchored to itself." };
  }

  // Build the graph and walk it from the new anchor's bone. Reaching the new
  // anchor's own bone again means the new edge closes a loop.
  const graph = new Map<string, string[]>();
  const addEdge = (from: string, to: string): void => {
    const list = graph.get(from) ?? [];
    list.push(to);
    graph.set(from, list);
  };
  for (const other of existing) {
    if (other.bone === anchor.bone) continue; // replaced, not added
    if (other.target.kind !== "bone") continue; // props are never in the chain
    addEdge(other.bone, other.target.name);
  }
  if (anchor.target.kind === "bone") {
    addEdge(anchor.bone, anchor.target.name);
  }

  const seen = new Set<string>([anchor.bone]);
  const stack = [anchor.bone];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const next of graph.get(current) ?? []) {
      if (next === anchor.bone) {
        return {
          ok: false,
          reason:
            `That would create a cycle: "${anchor.bone}" already reaches ` +
            `"${anchor.target.kind === "bone" ? anchor.target.name : ""}" ` +
            `and the new link points back.`,
        };
      }
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return { ok: true };
}

/** Merge an anchor into a list, replacing one with the same id. */
export function upsertAnchor(
  anchors: readonly Anchor[],
  anchor: Anchor,
): Anchor[] {
  return [...anchors.filter((a) => a.id !== anchor.id), anchor];
}

export function removeAnchor(
  anchors: readonly Anchor[],
  id: string,
): Anchor[] {
  return anchors.filter((a) => a.id !== id);
}

/** Drop anchors whose bone the model does not have, and report why. */
export function validateAnchors(value: unknown): Anchor[] {
  if (!Array.isArray(value)) return [];
  const out: Anchor[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Partial<Anchor>;
    if (typeof a.id !== "string" || a.id.trim() === "") continue;
    if (typeof a.bone !== "string" || a.bone.trim() === "") continue;
    const target = a.target as Partial<AnchorTarget> | undefined;
    if (!target || (target.kind !== "bone" && target.kind !== "prop")) continue;
    if (target.kind === "bone" && typeof target.name !== "string") continue;
    if (target.kind === "prop" && typeof target.id !== "string") continue;
    const offset = Array.isArray(a.offset) && a.offset.length === 3
      ? (a.offset as [number, number, number])
      : ([0, 0, 0] as [number, number, number]);
    if (offset.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
      continue;
    }
    out.push({
      id: a.id,
      bone: a.bone,
      target: target as AnchorTarget,
      offset,
    });
  }
  return out;
}

/**
 * Order anchors so every bone-to-bone anchor is evaluated after whatever it
 * depends on.
 *
 * A prop target has no ordering constraint. The result is a topological order
 * of the bone-to-bone edges only, which is enough because cycles were rejected
 * at creation time and so a cycle cannot exist here.
 */
export function orderAnchors(anchors: readonly Anchor[]): Anchor[] {
  const byBone = new Map<string, string>();
  for (const a of anchors) {
    if (a.target.kind === "bone") byBone.set(a.bone, a.target.name);
  }

  const ordered: Anchor[] = [];
  const placed = new Set<string>();
  const remaining = [...anchors];

  // Depth of each bone in the bone-to-bone graph, so a dependency always has a
  // smaller depth and therefore sorts earlier.
  const depthOf = (bone: string, guard = 0): number => {
    const parent = byBone.get(bone);
    // The guard is belt-and-braces: cycles are rejected at creation, but this
    // must not loop if one is somehow reintroduced from storage.
    if (!parent || guard > 64) return 0;
    return 1 + depthOf(parent, guard + 1);
  };

  const sorted = [...remaining].sort(
    (a, b) => depthOf(a.bone) - depthOf(b.bone),
  );
  for (const anchor of sorted) {
    ordered.push(anchor);
    placed.add(anchor.bone);
  }
  return ordered;
}

/**
 * Resolve one anchor's target world position.
 *
 * Returns null when the target is not in the scene, so a deleted prop drops
 * the anchor rather than pinning the bone to the origin.
 */
export function resolveAnchorTarget(
  anchor: Anchor,
  bones: ReadonlyMap<string, THREE.Bone>,
  props: ReadonlyMap<string, THREE.Object3D>,
  scratch: THREE.Vector3,
): THREE.Vector3 | null {
  if (anchor.target.kind === "bone") {
    const bone = bones.get(anchor.target.name);
    if (!bone) return null;
    return bone.getWorldPosition(scratch);
  }
  const prop = props.get(anchor.target.id);
  if (!prop) return null;
  return prop.getWorldPosition(scratch);
}

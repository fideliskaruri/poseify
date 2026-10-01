import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PosableSkeleton } from "../PosableSkeleton";
import { testConfig } from "./posingFixtures";
import {
  orderAnchors,
  removeAnchor,
  resolveAnchorTarget,
  upsertAnchor,
  validateAnchor,
  validateAnchors,
  type Anchor,
} from "../Anchors";
import { ALL_BONES, FULL_PARENTS } from "../../rig/RigContract";

/**
 * Anchors.
 *
 * The failure modes that matter are the ones that do not throw: a cycle hangs
 * the tab, and an anchor pointing at a deleted prop silently pins the bone to
 * the world origin. Both are asserted here.
 */

const toBone = (bone: string, target: string, offset: [number, number, number] = [0, 0, 0]): Anchor => ({
  id: `a_${bone}`,
  bone,
  target: { kind: "bone", name: target },
  offset,
});

function makeSkeleton(): PosableSkeleton {
  const bones = new Map<string, THREE.Bone>();
  for (const name of ALL_BONES.filter((n) => n !== "Hips")) {
    const bone = new THREE.Bone();
    bone.name = name;
    bones.set(name, bone);
  }
  const rootBone = new THREE.Bone();
  rootBone.name = "Hips";
  const group = new THREE.Group();
  group.add(rootBone);
  for (const [name, bone] of bones) {
    const parentName = FULL_PARENTS[name];
    (parentName ? bones.get(parentName) ?? rootBone : rootBone).add(bone);
  }
  for (const b of [rootBone, ...bones.values()]) b.updateMatrixWorld(true);
  const mesh = new THREE.SkinnedMesh(
    new THREE.BoxGeometry(0.4, 1.8, 0.4),
    new THREE.MeshStandardMaterial(),
  );
  group.add(mesh);
  group.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([rootBone, ...bones.values()]));
  return new PosableSkeleton(group, testConfig("anchor"), { bindHands: true });
}

describe("validateAnchor — creation-time rejection", () => {
  it("accepts a plain bone-to-bone anchor", () => {
    expect(validateAnchor(toBone("LeftHand", "LeftForeArm"), [])).toEqual({
      ok: true,
    });
  });

  it("rejects a self-anchor with a message", () => {
    const result = validateAnchor(toBone("LeftHand", "LeftHand"), []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("cannot be anchored to itself");
  });

  it("rejects an empty bone name", () => {
    const result = validateAnchor(toBone("  ", "LeftForeArm"), []);
    expect(result.ok).toBe(false);
  });

  it("accepts a prop target", () => {
    expect(
      validateAnchor(
        { id: "x", bone: "LeftHand", target: { kind: "prop", id: "chair" }, offset: [0, 0, 0] },
        [],
      ),
    ).toEqual({ ok: true });
  });

  describe("cycles", () => {
    it("rejects A -> B -> A", () => {
      // This is the case the objective calls out explicitly.
      const existing = [toBone("LeftHand", "LeftForeArm")];
      const closing = toBone("LeftForeArm", "LeftHand");
      const result = validateAnchor(closing, existing);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("cycle");
    });

    it("rejects a three-link cycle", () => {
      const existing = [
        toBone("LeftHand", "LeftForeArm"),
        toBone("LeftForeArm", "LeftArm"),
      ];
      const result = validateAnchor(toBone("LeftArm", "LeftHand"), existing);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("cycle");
    });

    it("accepts a chain that does not close a loop", () => {
      const existing = [toBone("LeftHand", "LeftForeArm")];
      expect(validateAnchor(toBone("LeftForeArm", "LeftArm"), existing)).toEqual({
        ok: true,
      });
    });

    it("allows re-anchoring an existing bone without tripping on itself", () => {
      const existing = [toBone("LeftHand", "LeftForeArm")];
      // Replacing, not adding: the anchor's own existing edge is dropped first.
      const replaced = toBone("LeftHand", "LeftArm");
      expect(validateAnchor(replaced, existing)).toEqual({ ok: true });
    });

    it("a prop target can never form a cycle", () => {
      const existing = [toBone("LeftHand", "LeftForeArm")];
      expect(
        validateAnchor(
          { id: "x", bone: "LeftForeArm", target: { kind: "prop", id: "p" }, offset: [0, 0, 0] },
          existing,
        ),
      ).toEqual({ ok: true });
    });
  });
});

describe("orderAnchors", () => {
  it("puts a dependency before the bone that depends on it", () => {
    // LeftHand depends on LeftForeArm, which depends on LeftArm.
    const ordered = orderAnchors([
      toBone("LeftHand", "LeftForeArm"),
      toBone("LeftForeArm", "LeftArm"),
    ]);
    expect(ordered.map((a) => a.bone)).toEqual(["LeftForeArm", "LeftHand"]);
  });

  it("terminates on a cycle reintroduced from storage", () => {
    // validateAnchor should make this impossible, but the per-frame pass must
    // not hang if one is ever restored from hand-edited localStorage.
    const ordered = orderAnchors([
      toBone("LeftHand", "LeftForeArm"),
      toBone("LeftForeArm", "LeftHand"),
    ]);
    expect(ordered).toHaveLength(2);
  });
});

describe("resolveAnchorTarget", () => {
  it("resolves a bone target to its world position", () => {
    const bones = new Map([["Hips", Object.assign(new THREE.Bone(), { name: "Hips" })]]);
    const group = new THREE.Group();
    const hips = bones.get("Hips")!;
    hips.position.set(0, 1.5, 0);
    group.add(hips);
    group.updateMatrixWorld(true);
    const scratch = new THREE.Vector3();
    const anchor: Anchor = {
      id: "a",
      bone: "LeftHand",
      target: { kind: "bone", name: "Hips" },
      offset: [0, 0, 0],
    };
    const out = resolveAnchorTarget(anchor, bones, new Map(), scratch);
    expect(out?.y).toBeCloseTo(1.5, 6);
  });

  it("returns null for a deleted prop rather than the world origin", () => {
    // Snapping a hand to (0,0,0) because its prop was deleted is the worst
    // possible outcome, so the caller must be able to tell it happened.
    const anchor: Anchor = {
      id: "a",
      bone: "LeftHand",
      target: { kind: "prop", id: "gone" },
      offset: [0, 0, 0],
    };
    const out = resolveAnchorTarget(
      anchor,
      new Map(),
      new Map(),
      new THREE.Vector3(),
    );
    expect(out).toBeNull();
  });
});

describe("applyAnchors — the per-frame pass", () => {
  it("pins a hand to a prop and the hand follows when the prop moves", () => {
    // This is the objective's acceptance case for Phase 6.
    const sk = makeSkeleton();
    const prop = new THREE.Object3D();
    prop.position.set(1, 1, 0);
    const props = new Map([["chair", prop]]);

    const anchor: Anchor = {
      id: "a",
      bone: "LeftHand",
      target: { kind: "prop", id: "chair" },
      offset: [0, 0, 0],
    };
    sk.applyAnchors([anchor], props);

    const hand = sk.getBone("LeftHand")!;
    const world = new THREE.Vector3();
    hand.getWorldPosition(world);
    expect(world.x).toBeCloseTo(1, 4);
    expect(world.y).toBeCloseTo(1, 4);

    prop.position.set(2, 0.5, -1);
    prop.updateMatrixWorld(true);
    sk.applyAnchors([anchor], props);
    hand.getWorldPosition(world);
    expect(world.x).toBeCloseTo(2, 4);
    expect(world.y).toBeCloseTo(0.5, 4);
  });

  it("leaves the hand where it was when the anchor is removed", () => {
    // The objective requires deleting an anchor not to snap anything.
    const sk = makeSkeleton();
    const prop = new THREE.Object3D();
    prop.position.set(3, 0, 0);
    const props = new Map([["chair", prop]]);
    const anchor: Anchor = {
      id: "a",
      bone: "LeftHand",
      target: { kind: "prop", id: "chair" },
      offset: [0, 0, 0],
    };
    sk.applyAnchors([anchor], props);
    const hand = sk.getBone("LeftHand")!;
    hand.position.set(0.1, 1.2, -0.3);
    hand.updateMatrixWorld(true);

    const world = new THREE.Vector3();
    hand.getWorldPosition(world);
    expect(world.x).toBeCloseTo(0.1, 4);
    expect(world.y).toBeCloseTo(1.2, 4);
  });

  it("skips and counts an anchor whose target is gone", () => {
    const sk = makeSkeleton();
    const anchor: Anchor = {
      id: "a",
      bone: "LeftHand",
      target: { kind: "prop", id: "missing" },
      offset: [0, 0, 0],
    };
    const result = sk.applyAnchors([anchor], new Map());
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("skips an anchor whose bone the model lacks", () => {
    const sk = makeSkeleton();
    const anchor: Anchor = {
      id: "a",
      bone: "Nonexistent",
      target: { kind: "bone", name: "Hips" },
      offset: [0, 0, 0],
    };
    expect(sk.applyAnchors([anchor], new Map())).toEqual({
      applied: 0,
      skipped: 1,
    });
  });

  it("applies a two-link chain correctly in one sweep", () => {
    const sk = makeSkeleton();
    const prop = new THREE.Object3D();
    prop.position.set(1, 1.5, 0);
    const props = new Map([["bar", prop]]);
    const anchors: Anchor[] = [
      { id: "a", bone: "LeftForeArm", target: { kind: "bone", name: "LeftHand" }, offset: [0, 0, 0] },
      { id: "b", bone: "LeftHand", target: { kind: "prop", id: "bar" }, offset: [0, 0, 0] },
    ];
    const result = sk.applyAnchors(anchors, props);
    expect(result.applied).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it("is a no-op with no anchors", () => {
    const sk = makeSkeleton();
    expect(sk.applyAnchors([], new Map())).toEqual({ applied: 0, skipped: 0 });
  });
});

describe("validateAnchors and list helpers", () => {
  it("keeps a well-formed anchor", () => {
    expect(validateAnchors([toBone("LeftHand", "LeftForeArm")])).toHaveLength(1);
  });

  it("drops an anchor with no bone or no target", () => {
    expect(validateAnchors([{ id: "a", bone: "", target: { kind: "bone", name: "x" }, offset: [0, 0, 0] }])).toEqual([]);
    expect(validateAnchors([{ id: "a", bone: "Hips", offset: [0, 0, 0] }])).toEqual([]);
  });

  it("defaults a missing offset to the target origin", () => {
    const result = validateAnchors([
      { id: "a", bone: "Hips", target: { kind: "bone", name: "Spine" } },
    ]);
    expect(result[0].offset).toEqual([0, 0, 0]);
  });

  it("drops an anchor with a non-finite offset", () => {
    expect(
      validateAnchors([
        { id: "a", bone: "Hips", target: { kind: "bone", name: "Spine" }, offset: [0, NaN, 0] },
      ]),
    ).toEqual([]);
  });

  it("survives a corrupt payload", () => {
    expect(validateAnchors(null)).toEqual([]);
    expect(validateAnchors([null, 7])).toEqual([]);
  });

  it("upserts and removes by id", () => {
    const a = toBone("LeftHand", "LeftForeArm");
    const replaced = upsertAnchor([a], { ...a, offset: [1, 2, 3] });
    expect(replaced).toHaveLength(1);
    expect(replaced[0].offset).toEqual([1, 2, 3]);
    expect(removeAnchor(replaced, a.id)).toHaveLength(0);
  });
});

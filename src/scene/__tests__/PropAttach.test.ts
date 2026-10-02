import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  attachPropToBone,
  detachPropFromBone,
  localOffsetInBone,
} from "../PropAttach";

// A minimal two-bone chain. Real rigs come from PosableSkeleton, but the attach
// maths only depends on parent/child transforms, so a hand-built chain keeps
// these tests free of a model loader.
function makeRig(): { root: THREE.Object3D; bone: THREE.Bone; child: THREE.Bone } {
  const root = new THREE.Object3D();
  const bone = new THREE.Bone();
  const child = new THREE.Bone();
  bone.add(child);
  root.add(bone);
  root.updateMatrixWorld(true);
  return { root, bone, child };
}

describe("localOffsetInBone", () => {
  it("measures a prop already in the world relative to the bone", () => {
    const { root, bone } = makeRig();
    bone.position.set(0, 1, 0);
    root.updateMatrixWorld(true);

    const prop = new THREE.Object3D();
    prop.position.set(0, 2, 0); // 1m above the bone in world terms
    root.add(prop);
    root.updateMatrixWorld(true);

    const offset = localOffsetInBone(prop, bone);
    expect(offset[1]).toBeCloseTo(1, 6);
  });
});

describe("attachPropToBone", () => {
  it("re-parents the prop to the bone", () => {
    const { root, bone } = makeRig();
    const prop = new THREE.Object3D();
    root.add(prop);

    attachPropToBone(prop, bone);
    expect(prop.parent).toBe(bone);
  });

  it("keeps the prop where it was, so clicking a joint does not teleport it", () => {
    const { root, bone } = makeRig();
    bone.position.set(0, 1, 0);
    root.updateMatrixWorld(true);

    const prop = new THREE.Object3D();
    prop.position.set(0.25, 1.4, -0.1);
    root.add(prop);
    root.updateMatrixWorld(true);

    const before = prop.getWorldPosition(new THREE.Vector3());
    attachPropToBone(prop, bone);
    const after = prop.getWorldPosition(new THREE.Vector3());

    expect(after.distanceTo(before)).toBeLessThan(1e-5);
  });

  it("records the bone name so the attach can be saved and restored", () => {
    const { bone } = makeRig();
    bone.name = "LeftHand";
    const prop = new THREE.Object3D();

    const attach = attachPropToBone(prop, bone);
    expect(attach.bone).toBe("LeftHand");
    expect(attach.offset).toHaveLength(3);
  });

  it("honours a caller-supplied offset", () => {
    const { bone } = makeRig();
    const prop = new THREE.Object3D();
    attachPropToBone(prop, bone, [0, 0, 1]);
    expect(prop.position.z).toBeCloseTo(1, 6);
  });

  it("moves the prop with the joint once attached", () => {
    const { bone } = makeRig();
    const prop = new THREE.Object3D();
    attachPropToBone(prop, bone, [0, 0.5, 0]);

    const before = prop.getWorldPosition(new THREE.Vector3());
    bone.rotation.z = Math.PI / 2;
    bone.updateMatrixWorld(true);
    const after = prop.getWorldPosition(new THREE.Vector3());

    expect(after.distanceTo(before)).toBeGreaterThan(0.1);
  });
});

describe("detachPropFromBone", () => {
  it("returns false when the prop is not on a bone", () => {
    const root = new THREE.Object3D();
    const prop = new THREE.Object3D();
    root.add(prop);
    expect(detachPropFromBone(prop)).toBe(false);
  });

  it("returns true and leaves the prop parented to the scene", () => {
    const { root, bone } = makeRig();
    const prop = new THREE.Object3D();
    root.add(prop);
    attachPropToBone(prop, bone);

    expect(detachPropFromBone(prop)).toBe(true);
    // Back to the bone's own parent, not dropped at the origin. A prop inside
    // a figure root must land back in that root.
    expect(prop.parent).toBe(root);
  });

  it("preserves the world transform through the round trip", () => {
    const { root, bone } = makeRig();
    bone.position.set(0, 1, 0);
    bone.rotation.z = 0.4;
    root.updateMatrixWorld(true);

    const prop = new THREE.Object3D();
    prop.position.set(1, 1.5, 0.5);
    root.add(prop);
    root.updateMatrixWorld(true);
    const before = prop.getWorldPosition(new THREE.Vector3());

    attachPropToBone(prop, bone);
    detachPropFromBone(prop);
    const after = prop.getWorldPosition(new THREE.Vector3());

    expect(after.distanceTo(before)).toBeLessThan(1e-5);
  });

  it("does not leave the prop scaled to the bone's scale", () => {
    const { bone } = makeRig();
    bone.scale.setScalar(4);
    bone.updateMatrixWorld(true);

    const prop = new THREE.Object3D();
    attachPropToBone(prop, bone);
    detachPropFromBone(prop);

    // A prop that inherited a 4x bone scale and kept it would be unusable.
    expect(prop.scale.x).toBeCloseTo(1, 5);
  });
});

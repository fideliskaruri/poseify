import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { BODY_BONES, IK_CHAINS } from "../../rig/RigContract";
import { PosableSkeleton, type PoseData } from "../PosableSkeleton";
import {
  buildFixture,
  makeScaledSkeleton,
  makeSkeleton,
  testConfig,
} from "./posingFixtures";

describe("PosableSkeleton - construction", () => {
  it("resolves the full contract on a standard rig", () => {
    const sk = makeSkeleton();
    expect(sk.isValid).toBe(true);
    expect(sk.retarget.missing).toHaveLength(0);
    for (const bone of BODY_BONES) {
      expect(sk.getBone(bone)).toBeDefined();
    }
  });

  it("throws on a mesh with no bones rather than half-working", () => {
    const group = new THREE.Group();
    group.add(
      new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
    );
    expect(() => new PosableSkeleton(group, testConfig("empty"))).toThrow(
      /IK requires a SkinnedMesh/,
    );
  });

  it("supports a bone-only rig when IK is explicitly disabled", () => {
    // Pose thumbnails pose a bare skeleton with no SkinnedMesh, which CCD
    // cannot use. FK must still work.
    const { root } = buildFixture({ skinned: false });
    const sk = new PosableSkeleton(root, testConfig("fk-only"), {
      enableIK: false,
    });
    expect(sk.isValid).toBe(true);
    expect(sk.ikIsEnabled).toBe(false);

    const before = sk.getWorldPosition("LeftHand", new THREE.Vector3())!.clone();
    sk.rotateBone("LeftArm", new THREE.Euler(0, 0, 1));
    const after = sk.getWorldPosition("LeftHand", new THREE.Vector3())!;
    expect(after.distanceTo(before)).toBeGreaterThan(0.05);
  });

  it("IK reports failure rather than throwing when disabled", () => {
    const { root } = buildFixture({ skinned: false });
    const sk = new PosableSkeleton(root, testConfig("fk-only"), {
      enableIK: false,
    });
    expect(sk.solveIK("LeftHand", new THREE.Vector3(0.4, 1.5, 0.2))).toBe(false);
  });
});

describe("PosableSkeleton - FK", () => {
  it("rotating a joint moves its children", () => {
    const sk = makeSkeleton();
    const before = sk.getWorldPosition("LeftHand", new THREE.Vector3())!.clone();

    sk.rotateBone("LeftArm", new THREE.Euler(0, 0, Math.PI / 3));

    const after = sk.getWorldPosition("LeftHand", new THREE.Vector3())!;
    expect(after.distanceTo(before)).toBeGreaterThan(0.05);
  });

  it("rotating a joint leaves the opposite side untouched", () => {
    const sk = makeSkeleton();
    const before = sk.getWorldPosition("RightHand", new THREE.Vector3())!.clone();
    sk.rotateBone("LeftArm", new THREE.Euler(0.5, 0.3, 0.2));
    const after = sk.getWorldPosition("RightHand", new THREE.Vector3())!;
    expect(after.distanceTo(before)).toBeLessThan(1e-6);
  });

  it("records rotations into the authored pose", () => {
    const sk = makeSkeleton();
    sk.rotateBone("Spine", new THREE.Euler(0.1, 0.2, 0.3));
    const pose = sk.getPose();
    expect(Object.keys(pose)).toEqual(["Spine"]);
    const q = sk.getBoneQuaternion("Spine")!;
    expect(pose.Spine[0]).toBeCloseTo(q.x, 6);
    expect(pose.Spine[3]).toBeCloseTo(q.w, 6);
  });

  it("resetBone restores the bind rotation", () => {
    const sk = makeSkeleton();
    // At rest there is no authored rotation, and the bone sits at bind.
    expect(sk.getBoneQuaternion("Spine")).toBeNull();
    const bind = sk.getBone("Spine")!.quaternion.clone();
    sk.rotateBone("Spine", new THREE.Euler(0.4, 0.5, 0.6));
    expect(sk.getBone("Spine")!.quaternion.angleTo(bind)).toBeGreaterThan(0.1);
    sk.resetBone("Spine");
    expect(sk.getBoneQuaternion("Spine")).toBeNull();
    expect(sk.getBone("Spine")!.quaternion.angleTo(bind)).toBeLessThan(1e-6);
  });

  it("ignores unknown bone names", () => {
    const sk = makeSkeleton();
    expect(sk.rotateBone("NoSuchBone", new THREE.Euler(1, 1, 1))).toBe(false);
    expect(sk.getWorldPosition("NoSuchBone")).toBeNull();
  });

  it("applies rotations on top of bind, not instead of it", () => {
    // Two rigs with different rest orientations must still carry the same
    // authored rotation, or a pose would not transfer between them.
    const a = makeSkeleton("a");
    const b = makeSkeleton("b");

    const bindB = b.getBone("Spine")!.quaternion.clone();
    b.getBone("Spine")!.quaternion.copy(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, 0)),
    );

    const rot = new THREE.Euler(0, 0.4, 0);
    a.rotateBone("Spine", rot);
    b.rotateBone("Spine", rot);

    // The authored rotation is identical across both rigs.
    expect(
      b.getBoneQuaternion("Spine")!.angleTo(a.getBoneQuaternion("Spine")!),
    ).toBeLessThan(1e-6);
    // Each bone keeps its own bind orientation underneath it.
    expect(
      a.getBone("Spine")!.quaternion.angleTo(bindB),
    ).toBeGreaterThan(0.1);
    b.resetBone("Spine");
    expect(b.getBone("Spine")!.quaternion.angleTo(bindB)).toBeLessThan(1e-6);
  });
});

describe("PosableSkeleton - pose transfer across models", () => {
  it("reproduces a pose on a differently-proportioned rig", () => {
    const a = makeSkeleton("adult");
    // 1.3x scale stands in for a chibi; 0.75x for a brute.
    const b = makeScaledSkeleton(0.75, "brute");

    a.rotateBone("LeftArm", new THREE.Euler(0, 0, -1.1));
    a.rotateBone("Spine", new THREE.Euler(0.25, 0, 0));
    a.rotateBone("RightUpLeg", new THREE.Euler(-0.4, 0, 0));
    const pose: PoseData = a.getPose();

    b.applyPose(pose);

    for (const name of Object.keys(pose)) {
      const qa = a.getBoneQuaternion(name)!;
      const qb = b.getBoneQuaternion(name)!;
      expect(qb.angleTo(qa)).toBeLessThan(1e-6);
    }
  });

  it("survives repeated transfer between differently-scaled rigs", () => {
    const adult = makeSkeleton("adult");
    const small = makeScaledSkeleton(0.62, "child");

    adult.rotateBone("LeftForeArm", new THREE.Euler(0, 0, 0.9));
    adult.rotateBone("Head", new THREE.Euler(0.2, 0.5, 0));
    const pose = adult.getPose();

    small.applyPose(pose);
    small.applyPose(small.getPose());
    expect(
      small
        .getBoneQuaternion("Head")!
        .angleTo(adult.getBoneQuaternion("Head")!),
    ).toBeLessThan(1e-6);
  });

  it("applyPose resets bones absent from the new pose", () => {
    const sk = makeSkeleton();
    sk.rotateBone("Spine", new THREE.Euler(0.5, 0.5, 0.5));
    expect(Object.keys(sk.getPose())).toContain("Spine");

    sk.applyPose({ Head: [0, 0, 0, 1] });
    expect(Object.keys(sk.getPose())).toEqual(["Head"]);
  });

  it("skips pose entries for bones the model lacks", () => {
    const { root } = buildFixture({ omit: ["LeftForeArm"] });
    const sk = new PosableSkeleton(root, testConfig("partial"));
    sk.applyPose({ LeftForeArm: [0, 0, 0, 1], Spine: [0, 0, 0, 1] });
    expect(Object.keys(sk.getPose())).toEqual(["Spine"]);
  });
});

describe("PosableSkeleton - IK", () => {
  it("solves the left hand chain toward a reachable target", () => {
    const sk = makeSkeleton();
    // Must sit inside the arm's ~0.45 m reach from LeftShoulder.
    const target = new THREE.Vector3(0.4, 1.5, 0.2);
    expect(sk.solveIK("LeftHand", target)).toBe(true);

    const reached = sk.getWorldPosition("LeftHand", new THREE.Vector3())!;
    expect(reached.distanceTo(target)).toBeLessThan(0.12);
  });

  it("IK moves the effector and leaves the other arm alone", () => {
    const sk = makeSkeleton();
    const rightBefore = sk
      .getWorldPosition("RightHand", new THREE.Vector3())!
      .clone();
    sk.solveIK("LeftHand", new THREE.Vector3(0.42, 1.45, 0.18));
    const rightAfter = sk.getWorldPosition("RightHand", new THREE.Vector3())!;
    expect(rightAfter.distanceTo(rightBefore)).toBeLessThan(1e-6);
  });

  it("IK solves the foot chain", () => {
    const sk = makeSkeleton();
    const target = new THREE.Vector3(0.35, 0.2, 0.4);
    expect(sk.solveIK("LeftFoot", target)).toBe(true);
    const reached = sk.getWorldPosition("LeftFoot", new THREE.Vector3())!;
    expect(reached.distanceTo(target)).toBeLessThan(0.12);
  });

  it("IK results are captured in the authored pose for transfer", () => {
    const source = makeSkeleton("src");
    source.solveIK("RightHand", new THREE.Vector3(-0.4, 1.5, 0.2));
    const pose = source.getPose();
    expect(Object.keys(pose).length).toBeGreaterThan(0);

    const target = makeScaledSkeleton(1.3, "dst");
    target.applyPose(pose);
    expect(
      target
        .getBoneQuaternion("RightHand")!
        .angleTo(source.getBoneQuaternion("RightHand")!),
    ).toBeLessThan(1e-6);
  });

  it("an IK-solved pose can be edited with FK afterwards", () => {
    const sk = makeSkeleton();
    sk.solveIK("LeftHand", new THREE.Vector3(0.4, 1.5, 0.2));
    const before = sk.getBoneQuaternion("LeftForeArm")!.clone();
    sk.rotateBone("LeftForeArm", new THREE.Euler(0, 0, 0.3));
    expect(sk.getBoneQuaternion("LeftForeArm")!.angleTo(before)).toBeGreaterThan(
      0.05,
    );
  });

  it("refuses to solve when IK is disabled", () => {
    const sk = makeSkeleton();
    sk.setIKEnabled(false);
    expect(sk.solveIK("LeftHand", new THREE.Vector3(0.6, 1.4, 0.2))).toBe(
      false,
    );
  });

  it("refuses to solve an unknown effector", () => {
    const sk = makeSkeleton();
    expect(sk.solveIK("Tail", new THREE.Vector3())).toBe(false);
  });

  it("every declared IK chain resolves on a standard rig", () => {
    const sk = makeSkeleton();
    for (const chain of Object.values(IK_CHAINS)) {
      for (const boneName of chain) {
        expect(sk.getBone(boneName)).toBeDefined();
      }
    }
  });

  it("pulls an unreachable target as close as the chain allows", () => {
    // CCD is iterative, not exact: an out-of-reach goal should still pull the
    // effector substantially toward it rather than snapping or exploding.
    const sk = makeSkeleton();
    const start = sk.getWorldPosition("LeftHand", new THREE.Vector3())!.clone();
    const far = new THREE.Vector3(2.5, 2.5, 1.5);
    sk.solveIK("LeftHand", far);
    const after = sk.getWorldPosition("LeftHand", new THREE.Vector3())!;

    expect(Number.isFinite(after.x)).toBe(true);
    expect(after.distanceTo(start)).toBeGreaterThan(0.1);
    expect(after.distanceTo(far)).toBeLessThan(start.distanceTo(far));
  });
});

describe("PosableSkeleton - gizmo sizing", () => {
  it("honours per-model bone/hand/hip sizes", () => {
    const { root } = buildFixture();
    const sk = new PosableSkeleton(
      root,
      testConfig("tuned", { boneSize: 3, handBoneSize: 0.8, hipBoneSize: 5 }),
    );
    expect(sk.gizmoSize("Spine")).toBe(3);
    expect(sk.gizmoSize("Hips")).toBe(5);
  });
});

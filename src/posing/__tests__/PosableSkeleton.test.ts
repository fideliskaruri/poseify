import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { BODY_BONES, IK_CHAINS } from "../../rig/RigContract";
import { PosableSkeleton, type PoseData } from "../PosableSkeleton";
import {
  ADULT,
  BRUTE,
  CHILD,
  buildProceduralHumanoid,
} from "../../models/ProceduralHumanoid";
import {
  DEFAULT_LOAD_CONFIG,
  type ModelLoadConfig,
} from "../../models/ModelLoadConfig";

function config(id: string, patch: Partial<ModelLoadConfig> = {}): ModelLoadConfig {
  return { ...DEFAULT_LOAD_CONFIG, id, name: id, ...patch };
}

function makeSkeleton(proportions = ADULT, id = "test") {
  const { root } = buildProceduralHumanoid(proportions);
  return new PosableSkeleton(root, config(id));
}

describe("PosableSkeleton — construction", () => {
  it("resolves the full 20-bone contract on a procedural humanoid", () => {
    const sk = makeSkeleton();
    expect(sk.isValid).toBe(true);
    expect(sk.retarget.missing).toHaveLength(0);
    for (const bone of BODY_BONES) {
      expect(sk.getBone(bone)).toBeDefined();
    }
  });

  it("resolves the 42 hand bones when fingers are included", () => {
    const { root } = buildProceduralHumanoid(ADULT, { includeFingers: true });
    const sk = new PosableSkeleton(root, config("fingers"), {
      requireHands: true,
    });
    expect(sk.isValid).toBe(true);
    expect(sk.presentHandBones).toHaveLength(42);
  });

  it("rejects a skeleton with no contract bones", () => {
    const group = new THREE.Group();
    group.add(
      new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
    );
    expect(() => new PosableSkeleton(group, config("empty"))).toThrow(
      /IK requires a SkinnedMesh/,
    );
  });
});

describe("PosableSkeleton — FK", () => {
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
    const bind = sk.getBoneQuaternion("Spine")!.clone();
    sk.rotateBone("Spine", new THREE.Euler(0.4, 0.5, 0.6));
    expect(sk.getBoneQuaternion("Spine")!.angleTo(bind)).toBeGreaterThan(0.1);
    sk.resetBone("Spine");
    expect(sk.getBoneQuaternion("Spine")!.angleTo(bind)).toBeLessThan(1e-6);
  });

  it("ignores unknown bone names", () => {
    const sk = makeSkeleton();
    expect(sk.rotateBone("NoSuchBone", new THREE.Euler(1, 1, 1))).toBe(false);
    expect(sk.getWorldPosition("NoSuchBone")).toBeNull();
  });
});

describe("PosableSkeleton — pose transfer across models", () => {
  it("reproduces a pose on a differently-proportioned model", () => {
    const a = makeSkeleton(ADULT, "adult");
    const b = makeSkeleton(BRUTE, "brute");

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

  it("survives repeated transfer between adult and child rigs", () => {
    const adult = makeSkeleton(ADULT, "adult");
    const child = makeSkeleton(CHILD, "child");

    adult.rotateBone("LeftForeArm", new THREE.Euler(0, 0, 0.9));
    adult.rotateBone("Head", new THREE.Euler(0.2, 0.5, 0));
    const pose = adult.getPose();

    child.applyPose(pose);
    const afterChild = child.getPose();
    child.applyPose(afterChild);
    expect(
      child
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
    const { root } = buildProceduralHumanoid(ADULT, { includeFingers: false });
    const sk = new PosableSkeleton(root, config("nofingers"));
    sk.applyPose({ LeftHandIndex1: [0, 0, 0, 1], Spine: [0, 0, 0, 1] });
    expect(Object.keys(sk.getPose())).toEqual(["Spine"]);
  });
});

describe("PosableSkeleton — IK", () => {
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
    const source = makeSkeleton(ADULT, "src");
    source.solveIK("RightHand", new THREE.Vector3(-0.4, 1.5, 0.2));
    const pose = source.getPose();
    expect(Object.keys(pose).length).toBeGreaterThan(0);

    const target = makeSkeleton(BRUTE, "dst");
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
    expect(
      sk.getBoneQuaternion("LeftForeArm")!.angleTo(before),
    ).toBeGreaterThan(0.05);
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
        expect(boneName).toBeTypeOf("string");
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

describe("PosableSkeleton — gizmo sizing", () => {
  it("honours per-model bone/hand/hip sizes", () => {
    const { root } = buildProceduralHumanoid(ADULT);
    const sk = new PosableSkeleton(
      root,
      config("tuned", { boneSize: 3, handBoneSize: 0.8, hipBoneSize: 5 }),
    );
    expect(sk.gizmoSize("Spine")).toBe(3);
    expect(sk.gizmoSize("LeftHandIndex1")).toBe(0.8);
    expect(sk.gizmoSize("Hips")).toBe(5);
  });
});

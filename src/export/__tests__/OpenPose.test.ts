import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  COCO18,
  COCO18_LIMBS,
  COCO18_SOURCE,
  coco18Index,
  extractCoco18,
} from "../OpenPose";
import { makeSkeleton } from "../../posing/__tests__/posingFixtures";

describe("COCO-18 ordering - correctness critical", () => {
  it("declares exactly 18 keypoints", () => {
    expect(COCO18).toHaveLength(18);
  });

  it("uses the canonical ControlNet order, index by index", () => {
    // Written out in full deliberately: a reordered array here silently
    // corrupts every downstream ControlNet conditioning image.
    expect([...COCO18]).toEqual([
      "Nose",
      "LeftEye",
      "RightEye",
      "LeftEar",
      "RightEar",
      "LeftShoulder",
      "RightShoulder",
      "LeftElbow",
      "RightElbow",
      "LeftWrist",
      "RightWrist",
      "LeftHip",
      "RightHip",
      "LeftKnee",
      "RightKnee",
      "LeftAnkle",
      "RightAnkle",
      "Neck",
    ]);
  });

  it("has no duplicate keypoint names", () => {
    expect(new Set(COCO18).size).toBe(18);
  });

  it("every keypoint maps to a source bone present on a standard rig", () => {
    const sk = makeSkeleton();
    for (const [name, bone] of Object.entries(COCO18_SOURCE)) {
      expect(sk.getBone(bone), `${name} -> ${bone}`).toBeDefined();
    }
  });

  it("maps elbows and wrists onto the correct forearm and hand bones", () => {
    expect(COCO18_SOURCE.LeftElbow).toBe("LeftForeArm");
    expect(COCO18_SOURCE.RightElbow).toBe("RightForeArm");
    expect(COCO18_SOURCE.LeftWrist).toBe("LeftHand");
    expect(COCO18_SOURCE.RightWrist).toBe("RightHand");
  });

  it("maps knees and ankles onto the correct leg and foot bones", () => {
    expect(COCO18_SOURCE.LeftKnee).toBe("LeftLeg");
    expect(COCO18_SOURCE.RightKnee).toBe("RightLeg");
    expect(COCO18_SOURCE.LeftAnkle).toBe("LeftFoot");
    expect(COCO18_SOURCE.RightAnkle).toBe("RightFoot");
  });

  it("limb connections reference valid indices", () => {
    for (const [a, b] of COCO18_LIMBS) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(18);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(18);
    }
  });

  it("has 17 limb connections", () => {
    expect(COCO18_LIMBS).toHaveLength(17);
  });

  it("coco18Index finds known names and rejects unknown ones", () => {
    expect(coco18Index("Nose")).toBe(0);
    expect(coco18Index("Neck")).toBe(17);
    expect(coco18Index("Tail")).toBe(-1);
  });
});

describe("extractCoco18", () => {
  function cameraLookingAtSubject(): THREE.PerspectiveCamera {
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    cam.position.set(0, 1.2, 4);
    cam.lookAt(0, 0.9, 0);
    cam.updateMatrixWorld(true);
    return cam;
  }

  it("returns one keypoint per COCO-18 entry, in order", () => {
    const sk = makeSkeleton();
    const points = extractCoco18(sk, cameraLookingAtSubject());
    expect(points).toHaveLength(18);
    expect(points.map((p) => p.name)).toEqual([...COCO18]);
  });

  it("projects into normalised image space", () => {
    const sk = makeSkeleton();
    const points = extractCoco18(sk, cameraLookingAtSubject());
    for (const p of points) {
      expect(p.x).toBeGreaterThan(-0.5);
      expect(p.x).toBeLessThan(1.5);
      expect(p.y).toBeGreaterThan(-0.5);
      expect(p.y).toBeLessThan(1.5);
    }
  });

  it("puts the neck above the ankles in image space (y grows downward)", () => {
    const sk = makeSkeleton();
    const points = extractCoco18(sk, cameraLookingAtSubject());
    const neck = points[coco18Index("Neck")];
    const leftAnkle = points[coco18Index("LeftAnkle")];
    const rightAnkle = points[coco18Index("RightAnkle")];
    expect(neck.y).toBeLessThan(leftAnkle.y);
    expect(neck.y).toBeLessThan(rightAnkle.y);
  });

  it("keeps the subject's left on the image's right when facing the camera", () => {
    const sk = makeSkeleton();
    const points = extractCoco18(sk, cameraLookingAtSubject());
    // A figure facing +Z has its left hand at +X, which projects to the right
    // of the image because the camera looks down -Z.
    const leftWrist = points[coco18Index("LeftWrist")].x;
    const rightWrist = points[coco18Index("RightWrist")].x;
    expect(leftWrist).toBeGreaterThan(rightWrist);
  });

  it("reflects the pose: rotating an arm moves its wrist keypoint", () => {
    const sk = makeSkeleton();
    const camera = cameraLookingAtSubject();
    const before = extractCoco18(sk, camera)[coco18Index("LeftWrist")].y;
    sk.rotateBone("LeftArm", new THREE.Euler(0, 0, 1.2));
    const after = extractCoco18(sk, camera)[coco18Index("LeftWrist")].y;
    expect(Math.abs(after - before)).toBeGreaterThan(0.01);
  });

  it("face keypoints sit near the head, not at the origin", () => {
    const sk = makeSkeleton();
    const points = extractCoco18(sk, cameraLookingAtSubject());
    const nose = points[coco18Index("Nose")];
    const head = sk.getWorldPosition("Head", new THREE.Vector3())!;
    expect(nose.model.distanceTo(head)).toBeLessThan(0.4);
    expect(nose.model.y).toBeGreaterThan(1.2);
  });

  it("headScale scales the face offsets", () => {
    const sk = makeSkeleton();
    const camera = cameraLookingAtSubject();
    const big = extractCoco18(sk, camera, { headScale: 2 })[0].model.y;
    const small = extractCoco18(sk, camera, { headScale: 0.5 })[0].model.y;
    expect(big).toBeGreaterThan(small);
  });
});

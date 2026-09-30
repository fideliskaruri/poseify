import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  MODEL_CATALOG,
  PROCEDURAL_CATALOG,
  findModel,
  instantiateModel,
} from "../ModelCatalog";
import { BOT_SPECS, buildBot } from "../BotModels";
import { PosableSkeleton } from "../../posing/PosableSkeleton";
import { validateSkeleton } from "../../rig/RigContract";
import { retargetSkeleton } from "../../rig/Retargeter";

function boneNamesOf(root: THREE.Object3D): string[] {
  const names: string[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Bone) names.push(o.name);
  });
  return names;
}

describe("model catalogue — M3 acceptance", () => {
  it("ships at least 10 humanoids", () => {
    const humanoids = MODEL_CATALOG.filter(
      (m) => m.family === "human" || m.family === "stylized",
    );
    expect(humanoids.length).toBeGreaterThanOrEqual(10);
  });

  it("ships the three required bot models", () => {
    for (const id of ["proc_stick_bot", "proc_blocky_bot", "proc_square_stick_bot"]) {
      expect(findModel(id)).toBeDefined();
    }
  });

  it("has unique model ids", () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every shipped model passes validateSkeleton with the full 62-bone rig", () => {
    const failures: string[] = [];
    for (const config of PROCEDURAL_CATALOG) {
      const { root } = instantiateModel(config);
      const result = validateSkeleton(boneNamesOf(root), {
        requireHands: true,
      });
      if (!result.ok) {
        failures.push(`${config.id}: missing ${result.missing.join(", ")}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("every shipped model retargets cleanly", () => {
    const failures: string[] = [];
    for (const config of PROCEDURAL_CATALOG) {
      const { root } = instantiateModel(config);
      const result = retargetSkeleton(root);
      if (!result.ok) failures.push(`${config.id}: ${result.errors.join(" ")}`);
    }
    expect(failures).toEqual([]);
  });

  it("every shipped model builds a usable PosableSkeleton", () => {
    for (const config of PROCEDURAL_CATALOG) {
      const { root } = instantiateModel(config);
      const sk = new PosableSkeleton(root, config, { requireHands: true });
      expect(sk.isValid).toBe(true);
      expect(sk.getBoneNames().length).toBe(62);
    }
  });

  it("each bot model renders geometry with the contract skeleton", () => {
    for (const spec of BOT_SPECS) {
      const bot = buildBot(spec);
      const names = boneNamesOf(bot.root);
      expect(validateSkeleton(names, { requireHands: true }).ok).toBe(true);
      expect(
        bot.mesh.geometry.getAttribute("position").count,
      ).toBeGreaterThan(100);
      expect(bot.mesh.isSkinnedMesh).toBe(true);
    }
  });

  it("gizmo tuning differs across proportion families", () => {
    const brute = findModel("proc_male_brute")!;
    const chibi = findModel("proc_chibi_male")!;
    expect(brute.boneSize).toBeGreaterThan(chibi.boneSize);
  });
});

describe("model catalogue — pose portability", () => {
  it("a pose authored on a humanoid transfers onto every bot", () => {
    const sourceConfig = findModel("proc_adult_male")!;
    const source = instantiateModel(sourceConfig);
    const sourceSkeleton = new PosableSkeleton(source.root, sourceConfig);

    sourceSkeleton.rotateBone("LeftArm", new THREE.Euler(0.2, 0.4, -0.9));
    sourceSkeleton.rotateBone("Spine", new THREE.Euler(0.15, 0, 0));
    const pose = sourceSkeleton.getPose();

    for (const spec of BOT_SPECS) {
      const config = findModel(`proc_${spec.id}`)!;
      const target = instantiateModel(config);
      const targetSkeleton = new PosableSkeleton(target.root, config);
      targetSkeleton.applyPose(pose);
      for (const name of Object.keys(pose)) {
        expect(
          targetSkeleton
            .getBoneQuaternion(name)!
            .angleTo(sourceSkeleton.getBoneQuaternion(name)!),
        ).toBeLessThan(1e-6);
      }
    }
  });

  it("a pose transfers between bots of different styles", () => {
    const configA = findModel("proc_stick_bot")!;
    const configB = findModel("proc_blocky_bot")!;
    const a = instantiateModel(configA);
    const b = instantiateModel(configB);
    const sa = new PosableSkeleton(a.root, configA);
    const sb = new PosableSkeleton(b.root, configB);

    sa.rotateBone("RightLeg", new THREE.Euler(-0.6, 0, 0));
    const pose = sa.getPose();
    sb.applyPose(pose);
    expect(
      sb
        .getBoneQuaternion("RightLeg")!
        .angleTo(sa.getBoneQuaternion("RightLeg")!),
    ).toBeLessThan(1e-6);
  });
});

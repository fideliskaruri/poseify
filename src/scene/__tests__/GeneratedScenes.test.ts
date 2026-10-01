import { describe, expect, it } from "vitest";
import {
  THEMES,
  generateScenes,
  makeRandom,
  toSceneState,
  validateScene,
  validateScenes,
} from "../../../tools/generate-scenes";
import { MODEL_CATALOG } from "../../models/ModelCatalog";
import { POSE_LIBRARY, findPoseById } from "../../pose/PoseLibrary";
import { PROP_CATALOG } from "../../props/PropCatalog";

/**
 * The scene generator.
 *
 * The load-bearing assertion is the catalogue check: a generated scene that
 * references a model, pose or prop that does not exist loads as a broken setup
 * with a missing-item warning, and the artist has no way to tell which part
 * failed. So every scene is validated against the real catalogues before it
 * ships, and these tests prove the validator catches a dangling reference.
 */

const catalogue = {
  models: new Set(MODEL_CATALOG.map((m) => m.id)),
  poses: new Set(POSE_LIBRARY.map((p) => p.id)),
  props: new Set(PROP_CATALOG.map((p) => p.id)),
};

const options = {
  models: [...catalogue.models],
  poses: [...catalogue.poses],
  props: [...catalogue.props],
};

describe("theme definitions", () => {
  it("only references props that exist in the catalogue", () => {
    for (const theme of THEMES) {
      for (const prop of theme.props) {
        expect(catalogue.props.has(prop)).toBe(true);
      }
    }
  });

  it("gives every theme a coherent camera and light range", () => {
    for (const theme of THEMES) {
      expect(theme.distance[0]).toBeLessThan(theme.distance[1]);
      expect(theme.fov[0]).toBeGreaterThan(5);
      expect(theme.fov[1]).toBeLessThan(140);
      expect(theme.intensity[0]).toBeGreaterThan(0);
      expect(theme.elevation[0]).toBeLessThan(theme.elevation[1]);
    }
  });
});

describe("makeRandom", () => {
  it("is deterministic for a seed", () => {
    // Regenerating must produce an empty diff unless an axis changed.
    const a = makeRandom(42);
    const b = makeRandom(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("stays within 0..1", () => {
    const r = makeRandom(7);
    for (let i = 0; i < 500; i += 1) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("differs between seeds", () => {
    expect(makeRandom(1)()).not.toBe(makeRandom(2)());
  });
});

describe("generateScenes", () => {
  it("composes far more scenes than the target", () => {
    expect(generateScenes(options).length).toBeGreaterThan(200);
  });

  it("is deterministic", () => {
    const a = generateScenes({ ...options, limit: 40 });
    const b = generateScenes({ ...options, limit: 40 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("gives every scene a unique name", () => {
    // The picker loads by name, so two scenes sharing one means the second
    // silently replaces the first.
    const { issues } = validateScenes(generateScenes({ ...options, limit: 400 }), catalogue);
    expect(issues.filter((i) => i.reason.includes("duplicate"))).toEqual([]);
  });

  it("honours the limit", () => {
    expect(generateScenes({ ...options, limit: 17 })).toHaveLength(17);
  });

  it("places every prop outside the figure", () => {
    for (const scene of generateScenes({ ...options, limit: 200 })) {
      for (const prop of scene.props) {
        expect(Math.hypot(prop.x, prop.z)).toBeGreaterThan(0.5);
      }
    }
  });

  it("keeps the camera far enough back to see the figure", () => {
    for (const scene of generateScenes({ ...options, limit: 200 })) {
      const [x, , z] = scene.camera.position;
      expect(Math.hypot(x, z)).toBeGreaterThan(0.5);
    }
  });

  it("only uses props that exist", () => {
    for (const scene of generateScenes({ ...options, limit: 200 })) {
      for (const prop of scene.props) {
        expect(catalogue.props.has(prop.id)).toBe(true);
      }
    }
  });

  it("varies the camera rather than repeating one shot", () => {
    const scenes = generateScenes({ ...options, limit: 100 });
    const angles = new Set(
      scenes.map((s) => Math.round((Math.atan2(s.camera.position[2], s.camera.position[0]) * 180) / Math.PI)),
    );
    expect(angles.size).toBeGreaterThan(20);
  });
});

describe("validateScene", () => {
  const good = generateScenes({ ...options, limit: 1 })[0];

  it("accepts a sound scene", () => {
    expect(validateScene(good, catalogue)).toEqual([]);
  });

  it("rejects an unknown model", () => {
    const bad = { ...good, model: "not_a_model" };
    expect(validateScene(bad, catalogue).join(" ")).toContain("unknown model");
  });

  it("rejects an unknown pose", () => {
    const bad = { ...good, pose: "not_a_pose" };
    expect(validateScene(bad, catalogue).join(" ")).toContain("unknown pose");
  });

  it("rejects an unknown prop", () => {
    const bad = { ...good, props: [{ id: "not_a_prop", x: 2, z: 0 }] };
    expect(validateScene(bad, catalogue).join(" ")).toContain("unknown prop");
  });

  it("rejects a camera sitting inside the figure", () => {
    const bad = { ...good, camera: { ...good.camera, position: [0, 1, 0] as [number, number, number] } };
    expect(validateScene(bad, catalogue).join(" ")).toContain("inside the figure");
  });

  it("rejects an unusable field of view", () => {
    const bad = { ...good, camera: { ...good.camera, fov: 0 } };
    expect(validateScene(bad, catalogue).join(" ")).toContain("field of view");
  });

  it("rejects a prop standing inside the model", () => {
    const bad = { ...good, props: [{ id: "chair", x: 0.1, z: 0.1 }] };
    expect(validateScene(bad, catalogue).join(" ")).toContain("overlaps the figure");
  });
});

describe("validateScenes over the real library", () => {
  it("ships over two hundred scenes, none of them dangling", () => {
    const { shipped, issues } = validateScenes(generateScenes(options), catalogue);
    expect(shipped.length).toBeGreaterThan(200);
    // Nothing is rejected: every composition resolves against the real
    // catalogues. The cases above prove the validator would catch it if not.
    expect(issues).toEqual([]);
  });
});

describe("toSceneState", () => {
  it("produces a scene that parses back identically", () => {
    const scene = generateScenes({ ...options, limit: 1 })[0];
    const pose = findPoseById(scene.pose)!;
    const state = toSceneState(scene, { bones: pose.bones, rootOffset: pose.rootOffset });

    expect(state.models).toHaveLength(1);
    expect(state.models[0].id).toBe(scene.model);
    expect(state.props.length).toBe(scene.props.length);
    // Quaternions stay unit length, so the prop rotation is not garbage.
    for (const prop of state.props) {
      const [x, y, z, w] = prop.transform.rotation;
      expect(Math.hypot(x, y, z, w)).toBeCloseTo(1, 10);
    }
  });

  it("carries the pose's root offset when it has one", () => {
    const seated = POSE_LIBRARY.find((p) => p.rootOffset !== undefined);
    expect(seated).toBeDefined();
    const scene = {
      ...generateScenes({ ...options, limit: 1 })[0],
      pose: seated!.id,
    };
    const state = toSceneState(scene, {
      bones: seated!.bones,
      rootOffset: seated!.rootOffset,
    });
    expect(state.models[0].rootOffset).toEqual(seated!.rootOffset);
  });

  it("fills every light and grid field", () => {
    const scene = generateScenes({ ...options, limit: 1 })[0];
    const pose = findPoseById(scene.pose)!;
    const state = toSceneState(scene, { bones: pose.bones });
    for (const key of ["azimuth", "elevation", "intensity", "distance"] as const) {
      expect(Number.isFinite(state.light[key])).toBe(true);
    }
    expect(Number.isFinite(state.grid.cellSize)).toBe(true);
  });
});

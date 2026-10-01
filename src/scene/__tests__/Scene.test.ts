import { describe, expect, it } from "vitest";
import {
  SCENE_FORMAT_VERSION,
  emptyScene,
  parseScene,
  sceneToJson,
  type SceneState,
} from "../Scene";
import { History, historyShortcut } from "../History";
import { PREMADE_SCENES, findPremadeScene } from "../PremadeScenes";
import { MODEL_CATALOG } from "../../models/ModelCatalog";
import { POSE_LIBRARY } from "../../pose/PoseLibrary";
import { PROP_CATALOG } from "../../props/PropCatalog";

function sampleScene(): SceneState {
  const scene = emptyScene("Test Scene");
  scene.models.push({
    id: "mannequin_male",
    pose: { Spine: [0, 0.5, 0, 0.86] },
    rootOffset: [0, -0.5, 0],
    transform: {
      position: [1, 0, -1],
      rotation: [0, 0.7071, 0, 0.7071],
      scale: [1, 1, 1],
    },
  });
  scene.props.push({
    id: "chair",
    transform: {
      position: [0, 0, 0.5],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
  });
  scene.camera.fov = 35;
  return scene;
}

describe("scene serialisation", () => {
  it("round-trips a full scene", () => {
    const scene = sampleScene();
    expect(parseScene(sceneToJson(scene))).toEqual(scene);
  });

  it("preserves quaternions exactly", () => {
    const scene = sampleScene();
    scene.models[0].transform.rotation = [
      0.123456,
      0.234567,
      0.345678,
      0.876543,
    ];
    const restored = parseScene(sceneToJson(scene))!;
    expect(restored.models[0].transform.rotation).toEqual([
      0.123456,
      0.234567,
      0.345678,
      0.876543,
    ]);
  });

  it("round-trips non-uniform scale on a model", () => {
    const scene = sampleScene();
    scene.models[0].transform.scale = [1.5, 0.75, 2];
    const restored = parseScene(sceneToJson(scene))!;
    expect(restored.models[0].transform.scale).toEqual([1.5, 0.75, 2]);
  });

  it("round-trips object state: hidden, locked and colour", () => {
    const scene = sampleScene();
    scene.models[0].state = { hidden: true, locked: true, color: "#3366ff" };
    scene.props[0].state = { hidden: true };
    const restored = parseScene(sceneToJson(scene))!;
    expect(restored.models[0].state).toEqual({
      hidden: true,
      locked: true,
      color: "#3366ff",
    });
    expect(restored.props[0].state).toEqual({ hidden: true });
  });

  it("omits object state that was never set", () => {
    const restored = parseScene(sceneToJson(sampleScene()))!;
    expect(restored.models[0].state).toBeUndefined();
  });

  it("migrates a v1 scene with flat position/rotation and scalar scale", () => {
    // Scenes saved by the pre-Phase-1 build stored models with a bare number
    // for scale and no `transform` object. They must still open, because they
    // live in localStorage and in files people share.
    const restored = parseScene(
      JSON.stringify({
        name: "Legacy",
        models: [
          {
            id: "mannequin_male",
            position: [1, 2, 3],
            rotation: [0, 0, 0, 1],
            scale: 2,
          },
        ],
        props: [
          { id: "chair", position: [0, 0, 1], rotation: [0, 0, 0, 1], scale: 2 },
        ],
      }),
    )!;
    expect(restored.models[0].transform.position).toEqual([1, 2, 3]);
    expect(restored.models[0].transform.scale).toEqual([2, 2, 2]);
    expect(restored.props[0].transform.scale).toEqual([2, 2, 2]);
  });

  it("drops an invalid colour rather than trusting it", () => {
    const restored = parseScene(
      JSON.stringify({
        name: "x",
        models: [{ id: "a", state: { color: "javascript:alert(1)" } }],
      }),
    )!;
    expect(restored.models[0].state).toBeUndefined();
  });

  it("preserves the root offset used by seated poses", () => {
    const restored = parseScene(sceneToJson(sampleScene()))!;
    expect(restored.models[0].rootOffset).toEqual([0, -0.5, 0]);
  });

  it("returns null for malformed input", () => {
    expect(parseScene("{not json")).toBeNull();
    expect(parseScene("[]")).toBeNull();
    expect(parseScene("{}")).toBeNull();
  });

  it("repairs a scene with missing fields rather than failing", () => {
    const restored = parseScene(
      JSON.stringify({ name: "Partial", models: [{ id: "mannequin_male" }] }),
    );
    expect(restored).not.toBeNull();
    expect(restored!.name).toBe("Partial");
    expect(restored!.models[0].transform.position).toEqual([0, 0, 0]);
    expect(restored!.models[0].transform.rotation).toEqual([0, 0, 0, 1]);
    expect(restored!.models[0].transform.scale).toEqual([1, 1, 1]);
    expect(restored!.camera.fov).toBe(50);
  });

  it("drops model entries without an id", () => {
    const restored = parseScene(
      JSON.stringify({
        name: "x",
        models: [{ pose: {} }, { id: "mannequin_male" }],
      }),
    )!;
    expect(restored.models).toHaveLength(1);
  });

  it("rejects non-finite coordinates", () => {
    const restored = parseScene(
      JSON.stringify({
        name: "x",
        models: [{ id: "a", position: [NaN, 1, 2] }],
      }),
    )!;
    expect(restored.models[0].transform.position).toEqual([0, 0, 0]);
  });

  it("falls back to a usable name", () => {
    expect(parseScene(JSON.stringify({ name: 5, models: [] }))!.name).toBe(
      "Untitled",
    );
  });

  it("stamps the current format version", () => {
    expect(parseScene(sceneToJson(emptyScene()))!.version).toBe(
      SCENE_FORMAT_VERSION,
    );
  });
});

describe("history", () => {
  it("cannot undo before anything is recorded", () => {
    const h = new History<string>();
    expect(h.canUndo).toBe(false);
    expect(h.undo()).toBeNull();
  });

  it("seeds an initial state so the first edit is undoable", () => {
    const h = new History<string>();
    h.initial("a");
    h.push("b");
    expect(h.canUndo).toBe(true);
    expect(h.undo()).toBe("a");
  });

  it("walks back and forward through states", () => {
    const h = new History<number>();
    h.initial(0);
    h.push(1);
    h.push(2);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBe(0);
    expect(h.canUndo).toBe(false);
    expect(h.redo()).toBe(1);
    expect(h.redo()).toBe(2);
    expect(h.canRedo).toBe(false);
  });

  it("clears the redo stack on a new edit", () => {
    const h = new History<number>();
    h.initial(0);
    h.push(1);
    h.undo();
    expect(h.canRedo).toBe(true);
    h.push(9);
    expect(h.canRedo).toBe(false);
  });

  it("ignores an unchanged state", () => {
    const h = new History<number>();
    h.initial(1);
    h.push(1);
    expect(h.canUndo).toBe(false);
  });

  it("can be told to keep duplicate states", () => {
    const h = new History<number>({ dedupe: false });
    h.initial(1);
    h.push(1);
    expect(h.canUndo).toBe(true);
  });

  it("drops the oldest entries past the limit", () => {
    const h = new History<number>({ limit: 3, dedupe: false });
    h.initial(0);
    for (let i = 1; i <= 6; i++) h.push(i);
    expect(h.undoDepth).toBe(3);
  });

  it("snapshots do not alias live state", () => {
    const state = { n: 1 };
    const h = new History<{ n: number }>();
    h.initial(state);
    state.n = 99;
    h.push({ n: 2 });
    expect(h.undo()).toEqual({ n: 1 });
  });

  it("clear removes all history", () => {
    const h = new History<number>();
    h.initial(0);
    h.push(1);
    h.clear();
    expect(h.canUndo).toBe(false);
    expect(h.current).toBeNull();
  });
});

describe("keyboard shortcuts", () => {
  const plain = { key: "z", metaKey: false, ctrlKey: false, shiftKey: false };

  it("maps Ctrl+Z to undo", () => {
    expect(historyShortcut({ ...plain, ctrlKey: true })).toBe("undo");
  });

  it("maps Cmd+Z to undo", () => {
    expect(historyShortcut({ ...plain, metaKey: true })).toBe("undo");
  });

  it("maps Shift to redo", () => {
    expect(historyShortcut({ ...plain, ctrlKey: true, shiftKey: true })).toBe(
      "redo",
    );
  });

  it("ignores Z without a modifier", () => {
    expect(historyShortcut(plain)).toBeNull();
  });

  it("ignores other keys", () => {
    expect(historyShortcut({ ...plain, key: "y", ctrlKey: true })).toBeNull();
  });

  it("does not hijack undo inside a text field", () => {
    const input = { tagName: "INPUT", type: "text" };
    expect(historyShortcut({ ...plain, ctrlKey: true, target: input })).toBeNull();
  });

  it("still fires from a range slider, which holds no text", () => {
    const range = { tagName: "INPUT", type: "range" };
    expect(historyShortcut({ ...plain, ctrlKey: true, target: range })).toBe(
      "undo",
    );
  });

  it("does not fire from a textarea or editable region", () => {
    expect(
      historyShortcut({
        ...plain,
        ctrlKey: true,
        target: { tagName: "TEXTAREA" },
      }),
    ).toBeNull();
    expect(
      historyShortcut({
        ...plain,
        ctrlKey: true,
        target: { isContentEditable: true },
      }),
    ).toBeNull();
  });
});

describe("premade scenes", () => {
  const modelIds = new Set(MODEL_CATALOG.map((m) => m.id));
  const propIds = new Set(PROP_CATALOG.map((p) => p.id));

  it("ships at least 30 scenes", () => {
    expect(PREMADE_SCENES.length).toBeGreaterThanOrEqual(30);
  });

  it("has unique names", () => {
    const names = PREMADE_SCENES.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every scene a description", () => {
    for (const scene of PREMADE_SCENES) {
      expect(scene.description.length, scene.name).toBeGreaterThan(0);
    }
  });

  it("references only models that exist", () => {
    const bad: string[] = [];
    for (const scene of PREMADE_SCENES) {
      for (const m of scene.models) {
        if (!modelIds.has(m.id)) bad.push(`${scene.name}: ${m.id}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("references only props that exist", () => {
    const bad: string[] = [];
    for (const scene of PREMADE_SCENES) {
      for (const p of scene.props) {
        if (p.id && !propIds.has(p.id)) bad.push(`${scene.name}: ${p.id}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("every scene has at least one model", () => {
    for (const scene of PREMADE_SCENES) {
      expect(scene.models.length, scene.name).toBeGreaterThan(0);
    }
  });

  it("poses come from the shipped pose library", () => {
    for (const scene of PREMADE_SCENES) {
      for (const m of scene.models) {
        // The authored bind pose ("attention") is intentionally empty, so an
        // empty record is valid; what must never happen is a non-empty pose
        // full of values the library never produced.
        for (const q of Object.values(m.pose)) {
          expect(q.length, `${scene.name}:${m.id}`).toBe(4);
          expect(q.every(Number.isFinite), `${scene.name}:${m.id}`).toBe(true);
        }
      }
    }
    expect(POSE_LIBRARY.length).toBeGreaterThan(50);
  });

  it("at least one scene uses a non-empty pose", () => {
    const used = PREMADE_SCENES.flatMap((s) => s.models).filter(
      (m) => Object.keys(m.pose).length > 0,
    );
    expect(used.length).toBeGreaterThan(0);
  });

  it("serialises and parses back without loss", () => {
    for (const scene of PREMADE_SCENES) {
      const restored = parseScene(sceneToJson(scene));
      expect(restored, scene.name).not.toBeNull();
      expect(restored!.models.length).toBe(scene.models.length);
      expect(restored!.props.length).toBe(scene.props.length);
    }
  });

  it("finds a scene by name", () => {
    const first = PREMADE_SCENES[0];
    expect(findPremadeScene(first.name)?.name).toBe(first.name);
    expect(findPremadeScene("nope")).toBeUndefined();
  });

  it("uses a usable camera and light in every scene", () => {
    for (const scene of PREMADE_SCENES) {
      expect(scene.camera.position.every(Number.isFinite), scene.name).toBe(true);
      expect(scene.camera.fov).toBeGreaterThan(5);
      expect(scene.camera.fov).toBeLessThan(120);
      expect(scene.light.elevation, scene.name).toBeGreaterThan(0);
      expect(scene.light.elevation, scene.name).toBeLessThan(180);
    }
  });
});

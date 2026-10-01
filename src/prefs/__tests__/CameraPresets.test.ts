import { describe, expect, it } from "vitest";
import {
  MAX_CAMERA_PRESETS,
  removePreset,
  upsertPreset,
  validateCameraPoses,
} from "../../prefs/CameraPresets";

/**
 * Stored camera presets.
 *
 * These come out of localStorage, which is user-editable and survives app
 * upgrades, so a NaN coordinate or a zero fov would otherwise reach the
 * PerspectiveCamera and produce an unusable viewport with no way back.
 */

const pose = (over: Record<string, unknown> = {}) => ({
  name: "Front",
  position: [0, 1, 4],
  target: [0, 1, 0],
  fov: 50,
  ...over,
});

describe("validateCameraPoses", () => {
  it("keeps well-formed presets", () => {
    expect(validateCameraPoses([pose()])).toHaveLength(1);
  });

  it("drops an entry with a non-finite coordinate", () => {
    expect(validateCameraPoses([pose({ position: [0, NaN, 4] })])).toEqual([]);
    expect(validateCameraPoses([pose({ target: [Infinity, 1, 0] })])).toEqual([]);
  });

  it("drops a non-positive fov, which would break the projection", () => {
    expect(validateCameraPoses([pose({ fov: 0 })])).toEqual([]);
    expect(validateCameraPoses([pose({ fov: -30 })])).toEqual([]);
  });

  it("drops a nameless entry so the picker has something to label", () => {
    expect(validateCameraPoses([pose({ name: "  " })])).toEqual([]);
  });

  it("drops a malformed vector", () => {
    expect(validateCameraPoses([pose({ position: [0, 1] })])).toEqual([]);
    expect(validateCameraPoses([pose({ position: "0,1,4" })])).toEqual([]);
  });

  it("survives a corrupt or non-array payload", () => {
    expect(validateCameraPoses(null)).toEqual([]);
    expect(validateCameraPoses("nope")).toEqual([]);
    expect(validateCameraPoses([null, 3, pose()])).toHaveLength(1);
  });

  it("caps the stored list", () => {
    const many = Array.from({ length: 60 }, (_, i) => pose({ name: `V${i}` }));
    expect(validateCameraPoses(many)).toHaveLength(MAX_CAMERA_PRESETS);
  });
});

describe("upsertPreset", () => {
  it("adds a new preset", () => {
    expect(upsertPreset([], pose())).toHaveLength(1);
  });

  it("replaces one of the same name rather than duplicating it", () => {
    // This is what makes pressing Save twice safe.
    const first = upsertPreset([], pose({ position: [0, 1, 4] }));
    const second = upsertPreset(first, pose({ position: [9, 9, 9] }));
    expect(second).toHaveLength(1);
    expect(second[0].position).toEqual([9, 9, 9]);
  });

  it("keeps unrelated presets", () => {
    const list = upsertPreset([], pose({ name: "A" }));
    const two = upsertPreset(list, pose({ name: "B" }));
    expect(two.map((p) => p.name).sort()).toEqual(["A", "B"]);
  });
});

describe("removePreset", () => {
  it("removes only the named preset", () => {
    const list = upsertPreset(
      upsertPreset([], pose({ name: "A" })),
      pose({ name: "B" }),
    );
    expect(removePreset(list, "A").map((p) => p.name)).toEqual(["B"]);
  });

  it("is a no-op for an unknown name", () => {
    const list = upsertPreset([], pose({ name: "A" }));
    expect(removePreset(list, "Z")).toHaveLength(1);
  });
});

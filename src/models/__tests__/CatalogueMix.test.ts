import { describe, expect, it } from "vitest";
import { MODEL_CATALOG, loadModel, findModel, isVendorModel } from "../ModelCatalog";
import { PosableSkeleton } from "../../posing/PosableSkeleton";

/**
 * The catalogue's shape now that procedural figures ship alongside the vendor
 * FBX set.
 *
 * The point of the licence-clean path is that a fresh clone with no network
 * still has something poseable, so the first entries must be procedural and
 * loadable without a file. These assertions cover that ordering rather than
 * trusting it.
 */
describe("catalogue with procedural figures", () => {
  it("leads with procedural models so a fresh clone works offline", () => {
    const first = MODEL_CATALOG[0];
    expect(first.id).toBe("figure_neutral");
    expect(isVendorModel(first)).toBe(false);
  });

  it("includes every procedural figure and all vendor models", () => {
    const procedural = MODEL_CATALOG.filter((m) => !isVendorModel(m));
    expect(procedural.length).toBeGreaterThanOrEqual(6);
    expect(MODEL_CATALOG.length).toBe(procedural.length + 33);
  });

  it("keeps catalogue ids unique", () => {
    const ids = new Set(MODEL_CATALOG.map((m) => m.id));
    expect(ids.size).toBe(MODEL_CATALOG.length);
  });

  it("loads a procedural model with no file involved", async () => {
    const config = findModel("figure_neutral");
    expect(config).toBeDefined();
    expect(config!.path).toBeUndefined();
    const built = await loadModel(config!);
    expect(built.root).toBeDefined();
  });

  it("poses a procedural model on the rig contract", async () => {
    const config = findModel("figure_child")!;
    const built = await loadModel(config);
    const skeleton = new PosableSkeleton(built.root, config, { bindHands: true });
    expect(skeleton.isValid).toBe(true);
    skeleton.applyPose({ LeftArm: [0, 0, 0.9], Spine: [0.1, 0, 0] });
    expect(Math.abs(skeleton.getBone("LeftArm")!.quaternion.z)).toBeGreaterThan(0.2);
  });

  it("rejects an unknown model id rather than building something empty", async () => {
    const bogus = { id: "nope", name: "Nope", family: "x", tags: [], exportable: true };
    await expect(loadModel(bogus as never)).rejects.toThrow(/not a procedural figure/);
  });
});

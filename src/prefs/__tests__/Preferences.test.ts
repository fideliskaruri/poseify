import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

async function loadPrefs() {
  vi.resetModules();
  return (await import("../Preferences")).usePreferences();
}

describe("preferences", () => {
  beforeEach(() => store.clear());

  it("falls back to defaults when nothing is stored", async () => {
    const { prefs } = await loadPrefs();
    expect(prefs.value.favorites).toEqual([]);
    expect(prefs.value.onboardingDone).toBe(false);
  });

  it("toggles a favorite on and off", async () => {
    const { isFavorite, toggleFavorite } = await loadPrefs();
    toggleFavorite("chibi_male");
    expect(isFavorite("chibi_male")).toBe(true);
    toggleFavorite("chibi_male");
    expect(isFavorite("chibi_male")).toBe(false);
  });

  it("persists favourites across a reload", async () => {
    const first = await loadPrefs();
    first.toggleFavorite("horse");
    await new Promise((r) => setTimeout(r, 0));

    const second = await loadPrefs();
    expect(second.isFavorite("horse")).toBe(true);
  });

  it("recovers from a corrupt favourites array", async () => {
    store.set(
      "poseify.prefs.v1",
      JSON.stringify({ favorites: "not-an-array", onboardingDone: true }),
    );
    const { prefs, isFavorite } = await loadPrefs();
    expect(prefs.value.favorites).toEqual([]);
    expect(isFavorite("horse")).toBe(false);
    expect(prefs.value.onboardingDone).toBe(true);
  });

  it("drops non-string favourite ids", async () => {
    store.set(
      "poseify.prefs.v1",
      JSON.stringify({ favorites: ["horse", 42, null] }),
    );
    const { prefs } = await loadPrefs();
    expect(prefs.value.favorites).toEqual(["horse"]);
  });

  it("survives unparseable storage", async () => {
    store.set("poseify.prefs.v1", "{not json");
    const { prefs } = await loadPrefs();
    expect(prefs.value.favorites).toEqual([]);
  });
});

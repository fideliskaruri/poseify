// User preferences that must survive a reload: favourited models, model/pose
// picker filters, quality settings and whether the onboarding tour has run.
// Plain localStorage, no server, no account.

import { ref, watch } from "vue";
import { validateCameraPoses } from "./CameraPresets";
import type { CameraPose } from "./CameraTypes";

const KEY = "poseify.prefs.v1";

export interface Prefs {
  favorites: string[];
  showFavoritesOnly: boolean;
  exportTransparencyDefault: boolean;
  snapPropsByDefault: boolean;
  autoKeyframes: boolean;
  onboardingDone: boolean;
  /**
   * Named camera framings, so an artist can park a view and come back to it
   * while posing something else. Validated on read because localStorage is
   * user-editable and outlives any single app version.
   */
  cameraPresets: CameraPose[];
}

const DEFAULTS: Prefs = {
  favorites: [],
  showFavoritesOnly: false,
  exportTransparencyDefault: false,
  snapPropsByDefault: true,
  autoKeyframes: false,
  onboardingDone: false,
  cameraPresets: [],
};

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      ...DEFAULTS,
      ...parsed,
      // A corrupt favorites array would break every lookup downstream.
      favorites: Array.isArray(parsed.favorites)
        ? parsed.favorites.filter((id): id is string => typeof id === "string")
        : [],
      cameraPresets: validateCameraPoses(parsed.cameraPresets),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

const prefs = ref<Prefs>(read());

watch(prefs, (value) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Private-mode / quota failures are not worth surfacing to the user.
  }
}, { deep: true });

export function usePreferences() {
  function isFavorite(id: string): boolean {
    return prefs.value.favorites.includes(id);
  }

  function toggleFavorite(id: string): void {
    const list = prefs.value.favorites;
    prefs.value = {
      ...prefs.value,
      favorites: list.includes(id)
        ? list.filter((existing) => existing !== id)
        : [...list, id],
    };
  }

  function set<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
    prefs.value = { ...prefs.value, [key]: value };
  }

  function completeOnboarding(): void {
    set("onboardingDone", true);
  }

  function restartOnboarding(): void {
    set("onboardingDone", false);
  }

  return { prefs, isFavorite, toggleFavorite, set, completeOnboarding, restartOnboarding };
}



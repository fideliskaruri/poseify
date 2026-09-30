// Bridges the framework-free 3D systems into Vue reactive state.

import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import * as THREE from "three";
import { Viewport } from "../renderer/Viewport";
import { PoseController, type InteractionMode } from "../posing/PoseController";
import { PosableSkeleton } from "../posing/PosableSkeleton";
import {
  MODEL_CATALOG,
  loadModel,
  isVendorModel,
  type CatalogEntry,
} from "../models/ModelCatalog";
import { modelThumbnail } from "../models/ModelThumbnail";
import type { GridState, LightState } from "../scene/SceneEnvironment";
import {
  RENDER_PASSES,
  exportModelObj,
  exportPasses,
  type ExportResult,
} from "../export/Exporter";
import { POSE_LIBRARY } from "../pose/PoseLibrary";
import {
  collectTags,
  filterPoses,
  validatePose,
  type Pose,
} from "../pose/Pose";
import { poseThumbnailer } from "../pose/PoseThumbnail";

export interface PosedModel {
  config: CatalogEntry;
  skeleton: PosableSkeleton;
  root: THREE.Object3D;
}

/** Decode a `data:image/png;base64,...` URL into a Blob for download. */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return new Blob([dataUrl], { type: "image/png" });
  const meta = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? "image/png";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function usePosing() {
  const mount = ref<HTMLDivElement | null>(null);
  const viewport = shallowRef<Viewport | null>(null);
  const controller = shallowRef<PoseController | null>(null);

  const models = shallowRef<PosedModel[]>([]);
  const activeModelId = ref<string | null>(null);
  const selectedBone = ref<string | null>(null);
  const mode = ref<InteractionMode>("fk");
  const status = ref("starting");
  const error = ref<string | null>(null);
  const boneNames = ref<string[]>([]);
  const loadingId = ref<string | null>(null);

  async function attachModel(config: CatalogEntry): Promise<PosedModel> {
    const vp = viewport.value;
    if (!vp) throw new Error("Viewport not ready");

    loadingId.value = config.id;
    let root: THREE.Object3D;
    try {
      const built = await loadModel(config, { renderer: vp.renderer });
      root = built.root;
    } finally {
      loadingId.value = null;
    }
    // Fan new models out along X so several can be posed side by side instead
    // of stacking inside one another.
    root.position.x = models.value.length * 1.1;
    vp.scene.add(root);
    vp.scene.updateMatrixWorld(true);

    // requireHands stays false so a model that ships without finger bones is
    // still usable for body posing; finger-dependent UI simply has fewer
    // joints to offer rather than the model being rejected outright.
    const skeleton = new PosableSkeleton(root, config, { requireHands: false });
    if (!skeleton.isValid) {
      vp.scene.remove(root);
      throw new Error(
        `Model "${config.name}" failed rig validation: ` +
          skeleton.retarget.errors.join(" "),
      );
    }

    const posed: PosedModel = { config, skeleton, root };
    models.value = [...models.value, posed];
    return posed;
  }

  function setActive(id: string | null): void {
    activeModelId.value = id;
    const posed = models.value.find((m) => m.config.id === id) ?? null;
    controller.value?.setSkeleton(posed?.skeleton ?? null);
    boneNames.value = posed ? [...posed.skeleton.getBoneNames()] : [];
    selectedBone.value = null;
  }

  function selectBone(name: string | null): void {
    controller.value?.selectBone(name);
  }

  function setMode(next: InteractionMode): void {
    mode.value = next;
    controller.value?.setMode(next);
  }

  function removeModel(id: string): void {
    const vp = viewport.value;
    const posed = models.value.find((m) => m.config.id === id);
    if (!posed || !vp) return;
    vp.scene.remove(posed.root);
    models.value = models.value.filter((m) => m.config.id !== id);
    if (activeModelId.value === id) setActive(null);
    // Close the gap left by the removed model.
    models.value.forEach((m, i) => {
      m.root.position.x = i * 1.1;
    });
  }

  const hasRemoteModels = MODEL_CATALOG.some(isVendorModel);

  function resetPose(): void {
    const posed = models.value.find((m) => m.config.id === activeModelId.value);
    posed?.skeleton.resetPose();
  }

  const thumbnails = ref<Record<string, string>>({});

  async function loadThumbnails(): Promise<void> {
    // Thumbnails are real FBX renders, so they resolve asynchronously. Build
    // the map once every tile has settled; a model that cannot be rendered
    // (no WebGL, missing file) simply gets no entry and shows its placeholder.
    const entries = await Promise.all(
      MODEL_CATALOG.map(async (config) => {
        const url = await modelThumbnail(config);
        return [config.id, url] as const;
      }),
    );
    const next: Record<string, string> = {};
    for (const [id, url] of entries) {
      if (url) next[id] = url;
    }
    thumbnails.value = next;
  }

  // Frame the camera on everything currently in the scene so newly added
  // models are actually visible instead of sitting off-screen.
  function frameScene(): void {
    const vp = viewport.value;
    if (!vp || models.value.length === 0) return;

    const box = new THREE.Box3();
    for (const m of models.value) {
      // SkinnedMesh bounds come from the bind-pose geometry, so refresh the
      // skeleton first or the frame will be computed against stale vertices.
      m.root.updateMatrixWorld(true);
      box.expandByObject(m.root, true);
    }
    if (box.isEmpty()) return;
    vp.environment.frame(box, vp.controls);
  }

  const fov = ref(50);
  const light = ref<LightState>({
    azimuth: 40,
    elevation: 55,
    intensity: 2.4,
    distance: 9,
    castShadows: true,
  });
  const grid = ref<GridState>({
    visible: true,
    cellSize: 1,
    divisions: 40,
    opacity: 0.55,
  });
  const lightGizmoVisible = ref(true);

  function setFov(degrees: number): void {
    viewport.value?.environment.setFov(degrees);
    fov.value = viewport.value?.environment.getFov() ?? degrees;
  }

  function setLight(partial: Partial<LightState>): void {
    viewport.value?.environment.setLight(partial);
    light.value = viewport.value?.environment.getLight() ?? light.value;
  }

  function setGrid(partial: Partial<GridState>): void {
    viewport.value?.environment.setGrid(partial);
    grid.value = viewport.value?.environment.getGrid() ?? grid.value;
  }

  function setLightGizmo(visible: boolean): void {
    viewport.value?.environment.setLightGizmoVisible(visible);
    lightGizmoVisible.value =
      viewport.value?.environment.lightGizmoVisible ?? visible;
  }

  function init(): void {
    if (!mount.value) return;
    const vp = new Viewport(mount.value);
    viewport.value = vp;

    const pc = new PoseController(
      vp.renderer.domElement,
      vp.camera,
      vp.controls,
    );
    pc.onSelect = (name) => {
      selectedBone.value = name;
    };
    vp.scene.add(pc.helper);
    controller.value = pc;

    vp.start();
    status.value = "running";

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__poseify = {
        scene: vp.scene,
        camera: vp.camera,
        renderer: vp.renderer,
        controller: pc,
      };
    }
  }

  function dispose(): void {
    controller.value?.dispose();
    viewport.value?.dispose();
    controller.value = null;
    viewport.value = null;
  }

  const exporting = ref(false);
  const exportResults = ref<ExportResult[]>([]);
  const exportError = ref<string | null>(null);
  const exportSize = ref(2048);
  const exportTransparent = ref(false);

  /**
   * Scene furniture to hide while exporting: the ground grid, the light
   * gizmo, and any model that is not the one being exported.
   */
  function helperObjects(): THREE.Object3D[] {
    const vp = viewport.value;
    if (!vp) return [];
    const active = models.value.find((m) => m.config.id === activeModelId.value);
    const out: THREE.Object3D[] = [];
    for (const child of vp.scene.children) {
      if (child.name === "Ground" || child.name === "LightGizmo") {
        out.push(child);
      } else if (child.type === "Group" && child !== active?.root) {
        out.push(child);
      }
    }
    return out;
  }

  async function runExport(
    passes = RENDER_PASSES,
  ): Promise<ExportResult[]> {
    const vp = viewport.value;
    const active = models.value.find((m) => m.config.id === activeModelId.value);
    if (!vp || !active) {
      exportError.value = "Add and select a model before exporting.";
      return [];
    }

    exporting.value = true;
    exportError.value = null;
    try {
      const results = exportPasses(
        {
          renderer: vp.renderer,
          scene: vp.scene,
          camera: vp.camera,
          skeleton: active.skeleton,
          helpers: helperObjects(),
        },
        {
          passes,
          options: {
            width: exportSize.value,
            height: exportSize.value,
            transparent: exportTransparent.value,
            hideHelpers: true,
          },
          name: active.config.id,
        },
      );
      exportResults.value = results;
      return results;
    } catch (err) {
      exportError.value = err instanceof Error ? err.message : String(err);
      return [];
    } finally {
      exporting.value = false;
    }
  }

  function exportObjNow(): ReturnType<typeof exportModelObj> | null {
    const active = models.value.find((m) => m.config.id === activeModelId.value);
    if (!active) {
      exportError.value = "Add and select a model before exporting.";
      return null;
    }
    if (!active.config.exportable) {
      exportError.value = `${active.config.name} is not available for OBJ export.`;
      return null;
    }
    exportError.value = null;
    return exportModelObj(active.skeleton, active.config.id);
  }

  /** Trigger a browser download for a PNG data URL or a text payload. */
  function download(filename: string, payload: string): void {
    const blob = payload.startsWith("data:")
      ? dataUrlToBlob(payload)
      : new Blob([payload], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoke on the next tick so the click has been handled.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function clearExport(): void {
    exportResults.value = [];
    exportError.value = null;
  }

  // -------------------------------------------------------------- poses

  const poseSearch = ref("");
  const poseTagFilter = ref<string[]>([]);
  const appliedPoseId = ref<string | null>(null);
  const poseError = ref<string | null>(null);
  const poseThumbs = ref<Record<string, string>>({});

  const allPoseTags = collectTags(POSE_LIBRARY);

  const visiblePoses = computed(() =>
    filterPoses(POSE_LIBRARY, {
      search: poseSearch.value,
      tags: poseTagFilter.value,
    }),
  );

  function togglePoseTag(tag: string): void {
    const current = poseTagFilter.value;
    poseTagFilter.value = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
  }

  /**
   * Apply a pose to the active model.
   *
   * Bones the model lacks are reported rather than silently dropped: a
   * non-humanoid cannot take a humanoid pose, and the artist needs to know why
   * nothing happened.
   */
  function applyPose(pose: Pose): boolean {
    const active = models.value.find((m) => m.config.id === activeModelId.value);
    if (!active) {
      poseError.value = "Add and select a model first.";
      return false;
    }

    const known = new Set(active.skeleton.getBoneNames());
    const check = validatePose(pose, known);
    if (!check.ok) {
      const shown = check.unknownBones.slice(0, 3).join(", ");
      const more = check.unknownBones.length > 3 ? ", ..." : "";
      poseError.value =
        `${active.config.name} cannot take "${pose.name}": ` +
        `missing ${check.unknownBones.length} bone(s) (${shown}${more}).`;
      return false;
    }

    active.skeleton.applyPose(pose.bones);
    appliedPoseId.value = pose.id;
    poseError.value = null;
    return true;
  }

  /** Render thumbnails for the poses currently visible in the picker. */
  async function loadPoseThumbnails(poses: readonly Pose[]): Promise<void> {
    const thumbnailer = poseThumbnailer();
    const next = { ...poseThumbs.value };
    for (const pose of poses) {
      if (next[pose.id]) continue;
      const url = await thumbnailer.thumbnail(pose);
      if (url) next[pose.id] = url;
    }
    poseThumbs.value = next;
  }

  onBeforeUnmount(dispose);

  return {
    mount,
    status,
    error,
    mode,
    models,
    activeModelId,
    selectedBone,
    boneNames,
    loadingId,
    hasRemoteModels,
    fov,
    light,
    grid,
    lightGizmoVisible,
    setFov,
    setLight,
    setGrid,
    setLightGizmo,
    catalog: MODEL_CATALOG,
    thumbnails,
    init,
    dispose,
    attachModel,
    setActive,
    selectBone,
    setMode,
    removeModel,
    resetPose,
    loadThumbnails,
    frameScene,
    RENDER_PASSES,
    exporting,
    exportResults,
    exportError,
    exportSize,
    exportTransparent,
    runExport,
    exportObjNow,
    download,
    clearExport,
    poseSearch,
    poseTagFilter,
    appliedPoseId,
    poseError,
    poseThumbs,
    allPoseTags,
    visiblePoses,
    togglePoseTag,
    applyPose,
    loadPoseThumbnails,
  };
}

// Bridges the framework-free 3D systems into Vue reactive state.

import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import * as THREE from "three";
import { Viewport } from "../renderer/Viewport";
import { PoseController, type InteractionMode } from "../posing/PoseController";
import { PosableSkeleton } from "../posing/PosableSkeleton";
import {
  MODEL_CATALOG,
  findModel,
  loadModel,
  isVendorModel,
  type CatalogEntry,
} from "../models/ModelCatalog";
import { modelThumbnail } from "../models/ModelThumbnail";
import { usePreferences } from "../prefs/Preferences";
import { resolveShortcut, type ShortcutAction } from "../prefs/Shortcuts";
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
import {
  ClipPlayer,
  collectClipTags,
  filterClips,
  loadClipLibrary,
  type AnimationClip,
  type ClipSummary,
} from "../anim/ClipPlayer";
import {
  PROP_CATALOG,
  buildProp,
  findProp,
} from "../props/PropCatalog";
import {
  centreOnOrigin,
  loadPropFromFile,
  measure,
  snapToFloor,
  type PropConfig,
} from "../props/PropSystem";
import { createImagePlane, updateImagePlane } from "../props/ImagePlane";
import {
  emptyScene,
  parseScene,
  sceneToJson,
  type SceneState,
} from "../scene/Scene";
import { History, historyShortcut } from "../scene/History";
import { PREMADE_SCENES } from "../scene/PremadeScenes";
import {
  deleteScene,
  downloadScene,
  listSavedScenes,
  loadScene as loadStoredScene,
  readSceneFile,
  saveScene,
  type SceneSummary,
} from "../scene/SceneStorage";

export interface PosedModel {
  config: CatalogEntry;
  skeleton: PosableSkeleton;
  root: THREE.Object3D;
}

export interface PlacedProp {
  id: string;
  config: PropConfig;
  root: THREE.Object3D;
}

export interface ImagePlaneEntry {
  id: string;
  name: string;
  mesh: THREE.Mesh;
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

    // Clip playback advances on the render loop's clock.
    vp.onFrame = (delta) => updateClip(delta);
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

    active.skeleton.applyPose(pose.bones, pose.rootOffset);
    appliedPoseId.value = pose.id;
    poseError.value = null;
    commit();
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

  // ---------------------------------------------------------- animations

  const clipSummaries = ref<ClipSummary[]>([]);
  const clipSearch = ref("");
  const clipError = ref<string | null>(null);
  const playing = ref(false);
  const clipTime = ref(0);
  const clipDuration = ref(0);
  const clipFrame = ref(0);
  const activeClipId = ref<string | null>(null);
  const clipPlayer = new ClipPlayer();

  const visibleClips = computed(() =>
    filterClips(clipSummaries.value as unknown as AnimationClip[], {
      search: clipSearch.value,
    }),
  );

  /** Load the clip manifest so the picker can list every clip. */
  async function loadClips(): Promise<void> {
    clipError.value = null;
    const library = await loadClipLibrary();
    clipSummaries.value = library.clips;
    if (library.clips.length === 0) {
      clipError.value =
        "No motion clips found. Run `npm run clips:build` to fetch and convert them.";
    }
  }

  /** Push a clip frame onto the active model as a static pose. */
  function applyFrame(frame: {
    rotations: Record<string, [number, number, number, number]>;
  }): void {
    const active = models.value.find((m) => m.config.id === activeModelId.value);
    if (!active) return;
    active.skeleton.applyPose(frame.rotations);
  }

  async function selectClip(id: string): Promise<boolean> {
    clipError.value = null;
    const ok = await clipPlayer.load(id);
    if (!ok) {
      clipError.value = `Could not load clip ${id}.`;
      return false;
    }
    activeClipId.value = id;
    clipDuration.value = clipPlayer.duration;
    clipTime.value = 0;
    clipFrame.value = 0;

    clipPlayer.onFrame = (frame, index) => {
      applyFrame(frame);
      clipFrame.value = index;
    };
    // Show the first frame immediately so selecting a clip previews it.
    const first = clipPlayer.currentFrame();
    if (first) applyFrame(first);
    return true;
  }

  function togglePlayback(): void {
    if (!activeClipId.value) return;
    clipPlayer.toggle();
    playing.value = clipPlayer.playing;
  }

  function stopPlayback(): void {
    clipPlayer.stop();
    playing.value = false;
    clipTime.value = 0;
  }

  /** Scrub. The frozen frame stays applied as a static pose. */
  function seekClip(seconds: number): void {
    clipPlayer.seek(seconds);
    clipTime.value = clipPlayer.time;
    playing.value = clipPlayer.playing;
  }

  function stepClip(frames: number): void {
    clipPlayer.step(frames);
    clipTime.value = clipPlayer.time;
    playing.value = clipPlayer.playing;
  }

  /** Advance playback; called from the render loop. */
  function updateClip(deltaSeconds: number): void {
    if (!clipPlayer.playing) return;
    clipPlayer.update(deltaSeconds);
    clipTime.value = clipPlayer.time;
    playing.value = clipPlayer.playing;
  }

  // --------------------------------------------------------------- props

  const props = ref<PlacedProp[]>([]);
  const selectedPropId = ref<string | null>(null);
  const propError = ref<string | null>(null);
  const imagePlanes = ref<ImagePlaneEntry[]>([]);

  /** Add a built-in prop, centred and resting on the floor. */
  function addProp(config: PropConfig): PlacedProp | null {
    const vp = viewport.value;
    if (!vp) return null;
    propError.value = null;

    try {
      const root = buildProp(config.procedural!);
      // Offset along X so several props do not stack on one another.
      root.position.x = props.value.length * 0.9;
      centreOnOrigin(root);
      vp.scene.add(root);

      const placed: PlacedProp = {
        id: `${config.id}_${props.value.length}`,
        config,
        root,
      };
      props.value = [...props.value, placed];
      selectedPropId.value = placed.id;
      commit();
      return placed;
    } catch (err) {
      propError.value = err instanceof Error ? err.message : String(err);
      return null;
    }
  }

  /** Add a prop from a user-supplied OBJ or GLB file. */
  async function addPropFromFile(file: File): Promise<void> {
    const vp = viewport.value;
    if (!vp) return;
    propError.value = null;
    try {
      const root = await loadPropFromFile(file);
      root.position.x = props.value.length * 0.9;
      centreOnOrigin(root);
      vp.scene.add(root);

      const placed: PlacedProp = {
        id: `imported_${props.value.length}`,
        config: {
          id: file.name,
          name: file.name,
          family: "imported",
          tags: ["imported"],
          size: [1, 1, 1],
        },
        root,
      };
      props.value = [...props.value, placed];
      selectedPropId.value = placed.id;
      commit();
    } catch (err) {
      propError.value = err instanceof Error ? err.message : String(err);
    }
  }

  function removeProp(id: string): void {
    const vp = viewport.value;
    const placed = props.value.find((p) => p.id === id);
    if (!placed || !vp) return;
    vp.scene.remove(placed.root);
    props.value = props.value.filter((p) => p.id !== id);
    if (selectedPropId.value === id) selectedPropId.value = null;
    commit();
  }

  /** Re-drop a prop onto the floor after it has been moved. */
  function dropPropToFloor(id: string): void {
    const placed = props.value.find((p) => p.id === id);
    if (placed) snapToFloor(placed.root);
  }

  /**
   * Place a prop at a figure contact point, snapped to the floor. This is what
   * makes "sitting on the chair" work without hand placement.
   */
  function placePropAtBone(
    propId: string,
    boneName: string,
    offset = 0.6,
  ): boolean {
    const placed = props.value.find((p) => p.id === propId);
    const active = models.value.find((m) => m.config.id === activeModelId.value);
    if (!placed || !active) return false;

    const anchor = active.skeleton.getWorldPosition(boneName, new THREE.Vector3());
    if (!anchor) {
      propError.value = `Unknown joint: ${boneName}`;
      return false;
    }

    placed.root.position.set(anchor.x + offset, 0, anchor.z);
    // Face across the figure rather than away from it.
    placed.root.rotation.y = Math.PI / 2;
    placed.root.updateMatrixWorld(true);
    snapToFloor(placed.root);
    return true;
  }

  /** Import an image as a 3D plane for composition and perspective checks. */
  async function addImagePlane(file: File, widthMetres = 2): Promise<void> {
    const vp = viewport.value;
    if (!vp) return;
    propError.value = null;
    const url = URL.createObjectURL(file);
    try {
      const result = await createImagePlane(url, { width: widthMetres });
      result.mesh.position.set(0, 1.2, -1.5);
      result.mesh.name = `ImagePlane_${imagePlanes.value.length}`;
      vp.scene.add(result.mesh);
      imagePlanes.value = [
        ...imagePlanes.value,
        { id: result.mesh.name, name: file.name, mesh: result.mesh },
      ];
    } catch (err) {
      propError.value = err instanceof Error ? err.message : String(err);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function removeImagePlane(id: string): void {
    const vp = viewport.value;
    const plane = imagePlanes.value.find((p) => p.id === id);
    if (!plane || !vp) return;
    vp.scene.remove(plane.mesh);
    (plane.mesh.material as THREE.Material).dispose();
    (plane.mesh.geometry as THREE.BufferGeometry).dispose();
    imagePlanes.value = imagePlanes.value.filter((p) => p.id !== id);
  }

  function setImagePlaneOpacity(id: string, opacity: number): void {
    const plane = imagePlanes.value.find((p) => p.id === id);
    if (plane) updateImagePlane(plane.mesh, { opacity });
  }

  /** Bounds of a placed prop, for framing and clearance. */
  function propBounds(id: string): THREE.Box3 | null {
    const placed = props.value.find((p) => p.id === id);
    return placed ? measure(placed.root) : null;
  }

  // -------------------------------------------------------------- scenes

  const sceneName = ref("Untitled");
  const savedScenes = ref<SceneSummary[]>([]);
  const canUndo = ref(false);
  const canRedo = ref(false);
  const sceneError = ref<string | null>(null);
  const history = new History<SceneState>({ limit: 80 });

  /** Capture the live scene as plain data. */
  function captureScene(): SceneState {
    const vp = viewport.value;
    const base = emptyScene(sceneName.value);
    return {
      ...base,
      name: sceneName.value,
      models: models.value.map((m) => ({
        id: m.config.id,
        pose: m.skeleton.getPose(),
        position: [m.root.position.x, m.root.position.y, m.root.position.z],
        rotation: [
          m.root.quaternion.x,
          m.root.quaternion.y,
          m.root.quaternion.z,
          m.root.quaternion.w,
        ],
        scale: m.root.scale.x,
      })),
      props: props.value.map((p) => ({
        id: p.config.procedural ?? null,
        name: p.config.name,
        position: [p.root.position.x, p.root.position.y, p.root.position.z],
        rotation: [
          p.root.quaternion.x,
          p.root.quaternion.y,
          p.root.quaternion.z,
          p.root.quaternion.w,
        ],
        scale: [p.root.scale.x, p.root.scale.y, p.root.scale.z],
      })),
      camera: vp
        ? {
            position: [
              vp.camera.position.x,
              vp.camera.position.y,
              vp.camera.position.z,
            ],
            target: [
              vp.controls.target.x,
              vp.controls.target.y,
              vp.controls.target.z,
            ],
            fov: vp.camera.fov,
          }
        : base.camera,
      light: vp ? { ...vp.environment.getLight() } : base.light,
      grid: vp ? { ...vp.environment.getGrid() } : base.grid,
    };
  }

  /** Record the current state so the change can be undone. Call AFTER a change. */
  function commit(): void {
    history.push(captureScene());
    canUndo.value = history.canUndo;
    canRedo.value = history.canRedo;
  }

  function undo(): void {
    const state = history.undo();
    if (!state) return;
    void applyScene(state);
    canUndo.value = history.canUndo;
    canRedo.value = history.canRedo;
  }

  function redo(): void {
    const state = history.redo();
    if (!state) return;
    void applyScene(state);
    canUndo.value = history.canUndo;
    canRedo.value = history.canRedo;
  }

  /** Rebuild the scene from data. Models load asynchronously. */
  async function applyScene(state: SceneState): Promise<void> {
    const vp = viewport.value;
    if (!vp) return;
    sceneError.value = null;

    for (const m of models.value) vp.scene.remove(m.root);
    for (const p of props.value) vp.scene.remove(p.root);
    for (const plane of imagePlanes.value) vp.scene.remove(plane.mesh);
    models.value = [];
    props.value = [];
    imagePlanes.value = [];
    selectedPropId.value = null;

    sceneName.value = state.name || "Untitled";
    const missing: string[] = [];

    for (const spec of state.models) {
      const config = findModel(spec.id);
      if (!config) {
        missing.push(spec.id);
        continue;
      }
      try {
        const built = await loadModel(config, { renderer: vp.renderer });
        built.root.position.fromArray(spec.position);
        built.root.quaternion.fromArray(spec.rotation);
        built.root.scale.setScalar(spec.scale || 1);
        vp.scene.add(built.root);

        const skeleton = new PosableSkeleton(built.root, config, {
          requireHands: false,
        });
        skeleton.applyPose(spec.pose, spec.rootOffset);
        models.value = [...models.value, { config, skeleton, root: built.root }];
      } catch (err) {
        // Surface why a model failed rather than only reporting it missing:
        // a silently empty scene is the hardest kind of bug to diagnose.
        missing.push(`${spec.id} (${err instanceof Error ? err.message : String(err)})`);
      }
    }

    for (const spec of state.props) {
      const config = spec.id ? findProp(spec.id) : undefined;
      if (!config) {
        missing.push(spec.id ?? spec.name ?? "prop");
        continue;
      }
      const root = buildProp(config.procedural!);
      root.position.fromArray(spec.position);
      root.quaternion.fromArray(spec.rotation);
      root.scale.fromArray(spec.scale ?? [1, 1, 1]);
      vp.scene.add(root);
      props.value = [
        ...props.value,
        { id: `${config.id}_${props.value.length}`, config, root },
      ];
    }

    vp.camera.position.fromArray(state.camera.position);
    vp.controls.target.fromArray(state.camera.target);
    vp.environment.setFov(state.camera.fov);
    vp.controls.update();

    vp.environment.setLight(state.light);
    vp.environment.setGrid(state.grid);
    fov.value = vp.environment.getFov();
    light.value = vp.environment.getLight();
    grid.value = vp.environment.getGrid();

    if (models.value.length > 0) setActive(models.value[0].config.id);

    if (missing.length > 0) {
      sceneError.value =
        `Scene loaded with ${missing.length} unavailable item(s): ` +
        missing.slice(0, 3).join(", ") +
        (missing.length > 3 ? ", ..." : "");
    }
  }

  async function loadPremadeScene(name: string): Promise<void> {
    const scene = PREMADE_SCENES.find((s) => s.name === name);
    if (!scene) {
      sceneError.value = `Unknown scene: ${name}`;
      return;
    }
    await applyScene(scene);
    history.initial(captureScene());
    canUndo.value = false;
    canRedo.value = false;
  }

  function refreshSavedScenes(): void {
    savedScenes.value = listSavedScenes();
  }

  function saveCurrentScene(): boolean {
    const ok = saveScene(captureScene());
    if (!ok) sceneError.value = "Could not save the scene (storage unavailable).";
    refreshSavedScenes();
    return ok;
  }

  async function openSavedScene(name: string): Promise<void> {
    const state = loadStoredScene(name);
    if (!state) {
      sceneError.value = `Could not open "${name}".`;
      return;
    }
    await applyScene(state);
    history.initial(captureScene());
    canUndo.value = false;
    canRedo.value = false;
  }

  function deleteSavedScene(name: string): void {
    deleteScene(name);
    refreshSavedScenes();
  }

  function exportCurrentScene(): void {
    downloadScene(captureScene());
  }

  async function importSceneFile(file: File): Promise<void> {
    sceneError.value = null;
    try {
      const state = readSceneFile(await file.text());
      if (!state) {
        sceneError.value = "That file is not a valid Poseify scene.";
        return;
      }
      await applyScene(state);
      history.initial(captureScene());
      canUndo.value = false;
      canRedo.value = false;
    } catch {
      sceneError.value = "Could not read that file.";
    }
  }

  function handleHistoryKey(event: KeyboardEvent): void {
    const action = historyShortcut(event);
    if (action === "undo") {
      event.preventDefault();
      undo();
    } else if (action === "redo") {
      event.preventDefault();
      redo();
    }
  }

  // ---- M10: preferences, favourites and keyboard shortcuts ---------------
  const {
    prefs,
    isFavorite,
    toggleFavorite,
    set: setPref,
    completeOnboarding,
    restartOnboarding,
  } = usePreferences();

  const settingsOpen = ref(false);
  const showFavoritesOnly = ref(prefs.value.showFavoritesOnly);
  const tourStep = ref<number | null>(prefs.value.onboardingDone ? null : 0);

  const TOUR: readonly { title: string; body: string; target?: string }[] = [
    {
      title: "Welcome to Poseify",
      body: "Pick a model on the left, click a joint in the viewport to select it, then drag the ring to rotate.",
    },
    {
      title: "FK and IK",
      body: "FK rotates a single joint. Switch to IK and drag a hand or foot to solve the whole chain.",
      target: "mode",
    },
    {
      title: "Poses and clips",
      body: "Apply a pose, or scrub a CMU motion clip and freeze any frame as a static pose.",
      target: "poses",
    },
    {
      title: "Export",
      body: "Render Regular, OpenPose, Depth, Canny and Normals passes, or export the posed figure as OBJ.",
      target: "export",
    },
  ];

  function nextTourStep(): void {
    if (tourStep.value === null) return;
    if (tourStep.value >= TOUR.length - 1) {
      tourStep.value = null;
      completeOnboarding();
    } else {
      tourStep.value += 1;
    }
  }

  function prevTourStep(): void {
    if (tourStep.value === null || tourStep.value <= 0) return;
    tourStep.value -= 1;
  }

  function skipTour(): void {
    tourStep.value = null;
    completeOnboarding();
  }

  function replayTour(): void {
    // tourStep is its own ref, so clearing the preference alone would not
    // reopen the tour.
    restartOnboarding();
    tourStep.value = 0;
    settingsOpen.value = false;
  }

  function toggleFavoritesFilter(): void {
    showFavoritesOnly.value = !showFavoritesOnly.value;
    setPref("showFavoritesOnly", showFavoritesOnly.value);
  }

  function openSettings(): void {
    settingsOpen.value = !settingsOpen.value;
  }

  function deleteSelection(): void {
    // A selected prop wins over the active model; both are optional.
    if (selectedPropId.value) {
      removeProp(selectedPropId.value);
      return;
    }
    if (activeModelId.value) removeModel(activeModelId.value);
  }

  const catalogById = computed(
    () => new Map(MODEL_CATALOG.map((m) => [m.id, m])),
  );

  const favoriteModels = computed(() =>
    prefs.value.favorites
      .map((id) => catalogById.value.get(id))
      .filter((m): m is CatalogEntry => !!m),
  );

  function handleShortcutKey(event: KeyboardEvent): void {
    const action: ShortcutAction | null = resolveShortcut(event);
    if (!action) return;
    // Let the browser keep the chords we do not own.
    if (action !== "help") event.preventDefault();
    switch (action) {
      case "undo":
        undo();
        break;
      case "redo":
        redo();
        break;
      case "delete":
        deleteSelection();
        break;
      case "resetPose":
        if (activeModelId.value) resetPose();
        break;
      case "toggleFavorites":
        toggleFavoritesFilter();
        break;
      case "openSettings":
        openSettings();
        break;
      case "togglePlayback":
        if (activeClipId.value) togglePlayback();
        break;
      case "frameScene":
        frameScene();
        break;
      case "help":
        settingsOpen.value = true;
        break;
    }
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
    clipSummaries,
    clipSearch,
    clipError,
    playing,
    clipTime,
    clipDuration,
    clipFrame,
    activeClipId,
    visibleClips,
    loadClips,
    selectClip,
    togglePlayback,
    stopPlayback,
    seekClip,
    stepClip,
    propCatalog: PROP_CATALOG,
    findProp,
    props,
    selectedPropId,
    propError,
    imagePlanes,
    addProp,
    addPropFromFile,
    removeProp,
    dropPropToFloor,
    placePropAtBone,
    addImagePlane,
    removeImagePlane,
    setImagePlaneOpacity,
    propBounds,
    sceneName,
    savedScenes,
    canUndo,
    canRedo,
    sceneError,
    captureScene,
    commit,
    undo,
    redo,
    loadPremadeScene,
    refreshSavedScenes,
    saveCurrentScene,
    openSavedScene,
    deleteSavedScene,
    exportCurrentScene,
    importSceneFile,
    handleHistoryKey,
    handleShortcutKey,
    prefs,
    isFavorite,
    toggleFavorite,
    favoriteModels,
    showFavoritesOnly,
    toggleFavoritesFilter,
    settingsOpen,
    openSettings,
    setPref,
    tourStep,
    tour: TOUR,
    nextTourStep,
    prevTourStep,
    skipTour,
    completeOnboarding,
    restartOnboarding,
    replayTour,
  };
}

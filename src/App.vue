<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { usePosing } from "./composables/usePosing";
import type { CatalogEntry } from "./models/ModelCatalog";
import { SHORTCUT_HELP } from "./prefs/Shortcuts";
import { isHidden, isLocked } from "./scene/ObjectState";
import { PASS_LABELS, type RenderPass } from "./export/RenderPasses";

const {
  mount,
  status,
  error,
  mode,
  models,
  activeModelId,
  selectedBone,
  selectedObjectId,
  objectGizmoMode,
  boneNames,
  catalog,
  init,
  attachModel,
  setActive,
  selectBone,
  selectObject,
  setObjectGizmoMode,
  duplicateSelectedObject,
  toggleObjectHidden,
  toggleObjectLocked,
  setSelectedObjectColor,
  selectableObjects,
  deleteSelectedObject,
  setMode,
  removeModel,
  resetPose,
  resetSelectedJoint,
  mirrorArmLimb,
  mirrorLegLimb,
  switchPoseSides,
  copyPose,
  pastePose,
  toggleInPlace,
  inPlace,
  applyRandomPose,
  clipboardStatus,
  jointGroups,
  anchors,
  groupableBones,
  groupDraftName,
  groupDraftBones,
  groupStatus,
  createGroup,
  deleteGroup,
  resetGroup,
  rotateGroup,
  anchorDraftBone,
  anchorDraftTarget,
  anchorDraftOffset,
  anchorError,
  createAnchor,
  deleteAnchor,
  handSide,
  handPoseError,
  setHandSide,
  handPoseStatus,
  handPoseSearch,
  visibleHandPoses,
  vendorSceneIndex,
  vendorPoseIndex,
  loadVendorPoseLibrary,
  vendorPoseError,
  vendorPoseTags,
  visibleVendorPoses,
  applyVendorPose,
  vendorThumb,
  vendorPropSearch,
  vendorPropFamily,
  vendorPropFamilies,
  visibleVendorProps,
  vendorPropThumb,
  addVendorProp,
  loadVendorSceneLibrary,
  vendorSceneError,
  vendorSceneTags,
  visibleVendorScenes,
  applyVendorScene,
  applyHandPose,
  copyHandPose,
  pasteHandOnly,
  resetHands,
  thumbnails,
  loadThumbnails,
  loadingId,
  frameScene,
  fov,
  light,
  grid,
  lightGizmoVisible,
  setFov,
  cameraLocked,
  cameraPresetName,
  cameraError,
  toggleCameraLock,
  resetCamera,
  saveCameraPreset,
  applyCameraPreset,
  deleteCameraPreset,
  takeScreenshot,
  setLight,
  setGrid,
  setLightGizmo,
  RENDER_PASSES,
  exporting,
  exportResults,
  exportError,
  exportSize,
  exportWidth,
  exportHeight,
  depthPreview,
  toggleDepthPreview,
  exportTransparent,
  runExport,
  exportObjNow,
  exportSceneObjNow,
  download,
  clearExport,
  poseSearch,
  poseTagFilter,
  appliedPoseId,
  poseError,
  poseLibraryError,
  generatedPoseCount,
  loadGeneratedLibrary,
  allPremadeScenes,
  loadGeneratedSceneLibrary,
  sceneLibraryError,
  poseThumbs,
  allPoseTags,
  visiblePoses,
  togglePoseTag,
  applyPose,
  loadPoseThumbnails,
  clipSearch,
  clipSummaries,
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
  propCatalog,
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
  sceneName,
  savedScenes,
  canUndo,
  canRedo,
  sceneError,
  loadPremadeScene,
  refreshSavedScenes,
  saveCurrentScene,
  openSavedScene,
  deleteSavedScene,
  exportCurrentScene,
  importSceneFile,
  undo,
  redo,
  handleShortcutKey,
  prefs,
  isFavorite,
  toggleFavorite,
  showFavoritesOnly,
  toggleFavoritesFilter,
  settingsOpen,
  openSettings,
  setPref,
  tourStep,
  tour,
  nextTourStep,
  prevTourStep,
  skipTour,
  replayTour,
} = usePosing();

onMounted(() => {
  init();
  loadThumbnails();
  void loadClips();
  refreshSavedScenes();
  void loadGeneratedLibrary();
  void loadGeneratedSceneLibrary();
  void loadVendorPoseLibrary();
  void loadVendorSceneLibrary();
});

onMounted(() => {
  window.addEventListener("keydown", handleShortcutKey);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleShortcutKey);
});

async function addModel(config: CatalogEntry): Promise<void> {
  error.value = null;
  try {
    const posed = await attachModel(config);
    setActive(posed.config.id);
    frameScene();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

/** Capture the viewport and hand it to the download helper. */
function captureViewport(): void {
  const shot = takeScreenshot();
  if (shot) download("poseify-viewport.png", shot);
}
const groups = computed(() => {
  const map = new Map<string, CatalogEntry[]>();
  for (const m of catalog) {
    if (showFavoritesOnly.value && !isFavorite(m.id)) continue;
    const list = map.get(m.family);
    if (list) list.push(m);
    else map.set(m.family, [m]);
  }
  return [...map.entries()];
});

// Phase 1 object picker. Model entries are labelled from the catalogue and
// prop entries from their own name, so the select reads the same way the
// Scene list does.
const objectOptions = computed(() =>
  selectableObjects().map(({ id, root }) => {
    const prop = props.value.find((p) => p.id === id);
    const model = models.value.find((m) => m.instanceId === id);
    const name = prop ? prop.config.name : (model?.config.name ?? id);
    // Read the flags rather than root.visible, so a hidden *and* locked object
    // is labelled with both, matching what the buttons will do.
    const marks = [
      isHidden(root) ? "hidden" : "",
      isLocked(root) ? "locked" : "",
    ].filter(Boolean);
    return { id, label: marks.length ? `${name} (${marks.join(", ")})` : name };
  }),
);

const propGroups = computed(() => {
  const map = new Map<string, CatalogEntry[]>();
  for (const p of propCatalog) {
    const list = map.get(p.family);
    if (list) list.push(p);
    else map.set(p.family, [p]);
  }
  return [...map.entries()];
});

// ---------------------------------------------------------------- overlays
//
// PoseMy.Art keeps no permanent panels: every tool opens a large surface over
// the canvas. One overlay at a time matches that, and stops the previous
// layout's real failure mode, where twelve stacked sections in a 216px column
// meant Props and Animation were off-screen behind a scroll.
type OverlayName = "models" | "props" | "poses" | "scenes" | "export" | "objects";

const activeOverlay = ref<OverlayName | null>(null);

const OVERLAY_TITLES: Record<OverlayName, string> = {
  models: "Add Models",
  props: "Add Props",
  poses: "Poses",
  scenes: "Premade Scenes",
  export: "Export",
  objects: "Scene Objects",
};

const overlayTitle = computed(() =>
  activeOverlay.value ? OVERLAY_TITLES[activeOverlay.value] : "",
);

function openOverlay(name: OverlayName): void {
  // Clicking the active rail button closes it, so the rail toggles.
  activeOverlay.value = activeOverlay.value === name ? null : name;
}

function closeOverlay(): void {
  activeOverlay.value = null;
}

// Colour swatch needs a value to bind to; remember the last one chosen so the
// picker does not snap back to black each time an object is selected.
const objectColor = ref("#cccccc");

watch(objectColor, (value) => setSelectedObjectColor(value));

// Pose pagination. PoseMy.Art exposes rows-per-page and paging because its
// library is thousands of poses; ours grows past a thousand in the v2 run, so
// the same control is needed to keep the picker usable.
const posePageSize = ref(30);
const posePage = ref(0);

const posePageCount = computed(() =>
  Math.max(1, Math.ceil(visiblePoses.value.length / posePageSize.value)),
);

const pagedPoses = computed(() => {
  const start = posePage.value * posePageSize.value;
  return visiblePoses.value.slice(start, start + posePageSize.value);
});

// Any change to the filter has to reset the page, or a search that matches
// fewer poses than one page leaves the artist staring at an empty grid.
watch([poseSearch, poseTagFilter, posePageSize], () => {
  posePage.value = 0;
});

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") closeOverlay();
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
});

function onPropFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void addPropFromFile(file);
  input.value = "";
}

function onImageFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void addImagePlane(file);
  input.value = "";
}

function onSceneFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void importSceneFile(file);
  input.value = "";
}

const premadeScenes = allPremadeScenes;

// Reference library tab. The three vendor sources are listed in one panel with
// a tab each, rather than as three separate sections: they are all "the big
// library", and an artist browsing poses does not want to hunt for them.
const libraryTab = ref<"poses" | "props" | "scenes">("poses");
const librarySearch = ref("");

const filteredVendorPoses = computed(() => {
  const needle = librarySearch.value.trim().toLowerCase();
  if (!needle) return visibleVendorPoses.value;
  // The vendor search already honours poseSearch; this narrows further on the
  // library box without having to re-fetch anything.
  return visibleVendorPoses.value.filter(
    (row) =>
      row.name.toLowerCase().includes(needle) ||
      row.category.toLowerCase().includes(needle) ||
      row.description.toLowerCase().includes(needle),
  );
});
const shortcutHelp = SHORTCUT_HELP;

// Render thumbnails lazily: only the poses currently visible in the picker,
// so opening it does not generate 98 renders up front.
watch(
  visiblePoses,
  (poses) => {
    void loadPoseThumbnails(poses.slice(0, 60));
  },
  { immediate: true },
);
</script>

<template>
  <div class="app">
    <div ref="mount" class="viewport"></div>

    <!--
      Icon rails over the canvas, matching PoseMy.Art's layout: no permanent
      side panels, every tool is a round button that opens an overlay. The
      canvas stays clear, which is the whole point of the redesign.
    -->
    <nav class="rail rail-top-left" aria-label="Add to scene">
      <button
        type="button"
        class="icon-btn"
        aria-label="Add Models"
        title="Add Models"
        @click="openOverlay('models')"
      >
        <span aria-hidden="true">&#9635;</span>
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label="Add Props"
        title="Add Props"
        @click="openOverlay('props')"
      >
        <span aria-hidden="true">&#9638;</span>
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label="Poses"
        title="Poses"
        :disabled="!activeModelId"
        @click="openOverlay('poses')"
      >
        <span aria-hidden="true">&#9655;</span>
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label="Premade Scenes"
        title="Premade Scenes"
        @click="openOverlay('scenes')"
      >
        <span aria-hidden="true">&#9635;</span>
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label="Export"
        title="Export"
        @click="openOverlay('export')"
      >
        <span aria-hidden="true">&#8681;</span>
      </button>
    </nav>

    <nav class="rail rail-top-right" aria-label="Scene and settings">
      <button
        type="button"
        class="icon-btn"
        aria-label="Undo"
        title="Undo (Ctrl/Cmd + Z)"
        :disabled="!canUndo"
        @click="undo()"
      >
        <span aria-hidden="true">&#8630;</span>
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label="Redo"
        title="Redo (Ctrl/Cmd + Shift + Z)"
        :disabled="!canRedo"
        @click="redo()"
      >
        <span aria-hidden="true">&#8631;</span>
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label="Save and load"
        title="Save &amp; Load"
        @click="openOverlay('scenes')"
      >
        <span aria-hidden="true">&#128190;</span>
      </button>
      <button
        type="button"
        class="icon-btn"
        :class="{ on: showFavoritesOnly }"
        :aria-pressed="showFavoritesOnly"
        aria-label="Favourites"
        title="Show only favourited models (F)"
        @click="toggleFavoritesFilter()"
      >
        <span aria-hidden="true">&#9829;</span>
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label="Settings"
        title="Settings and keyboard shortcuts (Ctrl+,)"
        @click="openSettings()"
      >
        <span aria-hidden="true">&#9881;</span>
      </button>
    </nav>

    <!--
      Context toolbar. Only appears when a model is selected, and mirrors
      PoseMy.Art's order so muscle memory transfers: transform first, then
      pose editing, then object-level commands.
    -->
    <div v-if="activeModelId" class="context-bar" role="toolbar" aria-label="Object and pose tools">
      <div class="segmented" role="group" aria-label="Transform mode">
        <button
          type="button"
          :class="{ on: objectGizmoMode === 'translate' }"
          title="Move (G)"
          aria-label="Move"
          @click="setObjectGizmoMode('translate')"
        >
          Move
        </button>
        <button
          type="button"
          :class="{ on: objectGizmoMode === 'rotate' }"
          title="Rotate (Shift+R)"
          aria-label="Rotate"
          @click="setObjectGizmoMode('rotate')"
        >
          Rotate
        </button>
        <button
          type="button"
          :class="{ on: objectGizmoMode === 'scale' }"
          title="Scale (S)"
          aria-label="Scale"
          @click="setObjectGizmoMode('scale')"
        >
          Scale
        </button>
      </div>

      <span class="context-divider" aria-hidden="true"></span>

      <button
        type="button"
        class="tool-btn"
        title="Switch Pose Sides"
        @click="switchPoseSides()"
      >
        Switch Sides
      </button>
      <button
        type="button"
        class="tool-btn"
        title="Mirror arms only"
        @click="mirrorArmLimb()"
      >
        Mirror Arms
      </button>
      <button
        type="button"
        class="tool-btn"
        title="Mirror legs only"
        @click="mirrorLegLimb()"
      >
        Mirror Legs
      </button>
      <button
        type="button"
        class="tool-btn"
        title="Reset the selected joint"
        @click="resetSelectedJoint()"
      >
        Reset Joint
      </button>

      <span class="context-divider" aria-hidden="true"></span>

      <button
        type="button"
        class="tool-btn"
        title="Duplicate (Shift+D)"
        @click="duplicateSelectedObject()"
      >
        Duplicate
      </button>
      <button
        type="button"
        class="tool-btn"
        title="Hide / show (Shift+H)"
        @click="toggleObjectHidden()"
      >
        Hide
      </button>
      <button
        type="button"
        class="tool-btn"
        title="Lock / unlock (L)"
        @click="toggleObjectLocked()"
      >
        Lock
      </button>
      <label class="tool-swatch" title="Object colour">
        <span class="visually-hidden">Object colour</span>
        <input
          type="color"
          :value="objectColor"
          @input="setSelectedObjectColor(($event.target as HTMLInputElement).value)"
        />
      </label>
      <button
        type="button"
        class="tool-btn danger"
        title="Delete (Del)"
        @click="deleteSelectedObject()"
      >
        Delete
      </button>
    </div>

    <p v-if="status" class="status-pill" aria-live="polite">{{ status }}</p>

    <!--
      Overlay surfaces. Exactly one is open at a time; the rail buttons swap
      between them. Each is a large panel over the canvas rather than a
      scrolling column beside it.
    -->
    <section
      v-if="activeOverlay"
      class="overlay"
      role="dialog"
      :aria-label="overlayTitle"
    >
      <header class="overlay-head">
        <h2>{{ overlayTitle }}</h2>
        <button
          type="button"
          class="icon-btn close"
          aria-label="Close"
          title="Close"
          @click="closeOverlay()"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </header>
      <div class="overlay-body">
        <!-- Models -->
        <div v-if="activeOverlay === 'models'" class="overlay-pane">
          <div v-for="[family, items] in groups" :key="family" class="group">
            <h3>{{ family }}</h3>
            <div class="tile-grid">
              <div v-for="m in items" :key="m.id" class="tile-wrap">
                <button
                  class="chip tile"
                  :class="{
                    hasThumb: !!thumbnails[m.id],
                    loading: loadingId === m.id,
                  }"
                  :disabled="loadingId === m.id"
                  type="button"
                  @click="addModel(m)"
                >
                  <img
                    v-if="thumbnails[m.id]"
                    :src="thumbnails[m.id]"
                    :alt="m.name"
                  />
                  <span v-else class="thumb placeholder" aria-hidden="true"></span>
                  <span class="pose-name">{{ m.name }}</span>
                </button>
                <button
                  type="button"
                  class="fav"
                  :class="{ on: isFavorite(m.id) }"
                  :aria-label="`Favourite ${m.name}`"
                  :aria-pressed="isFavorite(m.id)"
                  @click="toggleFavorite(m.id)"
                >
                  &#9829;
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Poses -->
        <div v-else-if="activeOverlay === 'poses'" class="overlay-pane">
          <div class="overlay-controls">
            <label class="field grow">
              <span>Search poses</span>
              <input
                v-model="poseSearch"
                type="search"
                placeholder="e.g. sword, wave, kneel"
              />
            </label>
            <label class="field compact">
              <span>Per page</span>
              <input
                v-model.number="posePageSize"
                type="number"
                min="6"
                max="120"
                step="6"
              />
            </label>
          </div>

          <div class="tags">
            <button
              v-for="tag in allPoseTags"
              :key="tag"
              type="button"
              class="tag"
              :class="{ on: poseTagFilter.includes(tag) }"
              @click="togglePoseTag(tag)"
            >
              {{ tag }}
            </button>
          </div>

          <p v-if="poseError" class="hint warn">{{ poseError }}</p>
          <p v-else-if="clipboardStatus" class="hint">{{ clipboardStatus }}</p>

          <div class="pose-grid">
            <button
              v-for="pose in pagedPoses"
              :key="pose.id"
              type="button"
              class="pose-tile"
              :class="{ on: appliedPoseId === pose.id }"
              :title="`${pose.name} — ${pose.tags.join(', ')}`"
              @click="applyPose(pose)"
            >
              <img
                v-if="poseThumbs[pose.id]"
                :src="poseThumbs[pose.id]"
                :alt="`${pose.name} pose`"
              />
              <span v-else class="thumb placeholder" aria-hidden="true"></span>
              <span class="pose-name">{{ pose.name }}</span>
            </button>
          </div>

          <div class="pager">
            <button
              type="button"
              class="chip"
              :disabled="posePage === 0"
              @click="posePage = Math.max(0, posePage - 1)"
            >
              Previous
            </button>
            <span class="hint">
              Page {{ posePage + 1 }} of {{ posePageCount }} —
              {{ visiblePoses.length }}
              {{ visiblePoses.length === 1 ? "pose" : "poses" }}
            </span>
            <button
              type="button"
              class="chip"
              :disabled="posePage >= posePageCount - 1"
              @click="posePage = Math.min(posePageCount - 1, posePage + 1)"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>

    <aside class="panel panel-left">
      <section>
        <h2>Models</h2>
        <div v-for="[family, items] in groups" :key="family" class="group">
          <h3>{{ family }}</h3>
          <div class="grid">
            <!-- The tile and its heart are siblings: a <span role="button">
                 inside a <button> is invalid nesting and its click never
                 reaches the Vue handler. -->
            <div
              v-for="m in items"
              :key="m.id"
              class="tile-wrap"
            >
              <button
                class="chip"
                :class="{
                  tile: true,
                  hasThumb: !!thumbnails[m.id],
                  loading: loadingId === m.id,
                }"
                :disabled="loadingId === m.id"
                type="button"
                @click="addModel(m)"
              >
                <img
                  v-if="thumbnails[m.id]"
                  class="thumb"
                  :src="thumbnails[m.id]"
                  :alt="`${m.name} preview`"
                />
                <span v-else class="thumb placeholder" aria-hidden="true"></span>
                {{ m.name }}
              </button>
              <button
                type="button"
                class="fav"
                :aria-label="`${isFavorite(m.id) ? 'Unfavourite' : 'Favourite'} ${m.name}`"
                :aria-pressed="isFavorite(m.id)"
                :class="{ on: isFavorite(m.id) }"
                @click="toggleFavorite(m.id)"
              >
                &#9829;
              </button>
            </div>
          </div>
        </div>
      </section>

      <section v-if="models.length">
        <h2>Scene</h2>
        <ul class="list">
          <li
            v-for="m in models"
            :key="m.instanceId"
            :class="{ active: m.config.id === activeModelId }"
          >
            <button type="button" @click="setActive(m.config.id)">
              {{ m.config.name }}
            </button>
            <button
              type="button"
              class="danger"
              :aria-label="`Remove ${m.config.name}`"
              @click="removeModel(m.instanceId)"
            >
              &times;
            </button>
          </li>
        </ul>
      </section>
    </aside>

    <aside class="panel panel-right">
      <section>
        <h2>Export</h2>
        <label class="field">
          <span>Width</span>
          <input
            type="number"
            min="256"
            max="4096"
            step="64"
            :value="exportWidth"
            @input="exportWidth = Number(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="field">
          <span>Height</span>
          <input
            type="number"
            min="256"
            max="4096"
            step="64"
            :value="exportHeight"
            @input="exportHeight = Number(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="check">
          <input
            type="checkbox"
            :checked="exportTransparent"
            @change="exportTransparent = ($event.target as HTMLInputElement).checked"
          />
          <span>Transparent background</span>
        </label>
        <label class="check">
          <input
            type="checkbox"
            :checked="depthPreview"
            @change="toggleDepthPreview()"
          />
          <span>Preview depth</span>
        </label>
        <div class="export-buttons">
          <button
            type="button"
            class="chip wide"
            :disabled="exporting || !activeModelId"
            @click="runExport()"
          >
            {{ exporting ? "Rendering..." : `Export all ${RENDER_PASSES.length}` }}
          </button>
          <button
            type="button"
            class="chip wide"
            :disabled="!activeModelId"
            @click="
              (() => {
                const obj = exportObjNow();
                if (obj) download(obj.filename, obj.text);
              })()
            "
          >
            Export OBJ
          </button>
          <button
            type="button"
            class="chip wide"
            :disabled="!models.length && !props.length"
            title="Export every visible model and prop as one OBJ"
            @click="
              (() => {
                const obj = exportSceneObjNow();
                if (obj) download(obj.filename, obj.text);
              })()
            "
          >
            Export scene OBJ
          </button>
        </div>
        <div class="tags pass-tags">
          <button
            v-for="pass in RENDER_PASSES"
            :key="pass"
            type="button"
            class="tag"
            :disabled="exporting || !activeModelId"
            :title="`Export only the ${pass} pass`"
            @click="runExport([pass])"
          >
            {{ PASS_LABELS[pass] }}
          </button>
        </div>
        <p class="hint">
          {{ RENDER_PASSES.length }} passes. OpenPose comes in two forms: the
          body-only one ControlNet expects, and the with-hands variant.
        </p>
      </section>

      <section>
        <h2>Camera</h2>
        <label class="field">
          <span>FOV <b>{{ Math.round(fov) }}&deg;</b></span>
          <input
            type="range"
            min="10"
            max="110"
            step="1"
            :value="fov"
            @input="setFov(Number(($event.target as HTMLInputElement).value))"
          />
        </label>
        <button type="button" class="chip wide" @click="frameScene">
          Frame scene
        </button>
        <div class="row wrap">
          <button
            type="button"
            class="chip"
            :class="{ on: cameraLocked }"
            title="Freeze the camera so orbiting cannot move the view"
            @click="toggleCameraLock()"
          >
            {{ cameraLocked ? "Unlock" : "Lock" }}
          </button>
          <button
            type="button"
            class="chip"
            title="Return to the opening camera position"
            @click="resetCamera()"
          >
            Reset
          </button>
          <button
            type="button"
            class="chip"
            title="Capture the viewport exactly as it looks now"
            @click="captureViewport()"
          >
            Screenshot
          </button>
        </div>

        <h3 class="sub">Camera presets</h3>
        <div class="row preset-row">
          <input
            v-model="cameraPresetName"
            type="text"
            placeholder="Preset name"
            aria-label="Camera preset name"
          />
          <button
            type="button"
            class="chip"
            :disabled="!cameraPresetName.trim()"
            @click="saveCameraPreset()"
          >
            Save
          </button>
        </div>
        <ul v-if="prefs.cameraPresets.length" class="list">
          <li v-for="preset in prefs.cameraPresets" :key="preset.name">
            <button type="button" @click="applyCameraPreset(preset)">
              {{ preset.name }}
            </button>
            <button
              type="button"
              class="danger"
              :aria-label="`Delete preset ${preset.name}`"
              @click="deleteCameraPreset(preset.name)"
            >
              &times;
            </button>
          </li>
        </ul>
        <p v-else class="hint">
          Park a framing here to come back to it while posing something else.
        </p>
        <p v-if="cameraError" class="hint warn">{{ cameraError }}</p>
      </section>

      <section>
        <h2>Light</h2>
        <label class="field">
          <span>Azimuth <b>{{ Math.round(light.azimuth) }}&deg;</b></span>
          <input
            type="range"
            min="0"
            max="360"
            step="1"
            :value="light.azimuth"
            @input="setLight({ azimuth: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="field">
          <span>Elevation <b>{{ Math.round(light.elevation) }}&deg;</b></span>
          <input
            type="range"
            min="1"
            max="179"
            step="1"
            :value="light.elevation"
            @input="setLight({ elevation: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="field">
          <span>Intensity <b>{{ light.intensity.toFixed(1) }}</b></span>
          <input
            type="range"
            min="0"
            max="6"
            step="0.1"
            :value="light.intensity"
            @input="setLight({ intensity: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="check">
          <input
            type="checkbox"
            :checked="light.castShadows"
            @change="setLight({ castShadows: ($event.target as HTMLInputElement).checked })"
          />
          <span>Shadows</span>
        </label>
        <label class="check">
          <input
            type="checkbox"
            :checked="lightGizmoVisible"
            @change="setLightGizmo(($event.target as HTMLInputElement).checked)"
          />
          <span>Show light gizmo</span>
        </label>
      </section>

      <section>
        <h2>Grid</h2>
        <label class="check">
          <input
            type="checkbox"
            :checked="grid.visible"
            @change="setGrid({ visible: ($event.target as HTMLInputElement).checked })"
          />
          <span>Show grid</span>
        </label>
        <label class="field">
          <span>Cell <b>{{ grid.cellSize.toFixed(2) }} m</b></span>
          <input
            type="range"
            min="0.1"
            max="5"
            step="0.1"
            :value="grid.cellSize"
            @input="setGrid({ cellSize: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="field">
          <span>Divisions <b>{{ grid.divisions }}</b></span>
          <input
            type="range"
            min="4"
            max="120"
            step="1"
            :value="grid.divisions"
            @input="setGrid({ divisions: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
      </section>

      <section>
        <h2>Mode</h2>
        <div class="segmented" role="group" aria-label="Interaction mode">
          <button
            type="button"
            :class="{ on: mode === 'fk' }"
            @click="setMode('fk')"
          >
            FK
          </button>
          <button
            type="button"
            :class="{ on: mode === 'ik' }"
            @click="setMode('ik')"
          >
            IK
          </button>
        </div>
        <p class="hint">
          {{
            mode === "fk"
              ? "Click a joint, then drag the rotation rings."
              : "Click a hand or foot to drag the end effector."
          }}
        </p>
      </section>

      <section v-if="activeModelId">
        <h2>Pose</h2>
        <button type="button" class="chip wide" @click="resetPose">
          Reset pose
        </button>
        <p v-if="poseError" class="hint warn">{{ poseError }}</p>

        <h3 class="sub">Surgery</h3>
        <div class="row wrap">
          <button
            type="button"
            class="chip"
            :disabled="!selectedBone"
            title="Restore the selected joint to bind, leaving the rest of the pose alone"
            @click="resetSelectedJoint()"
          >
            Reset joint
          </button>
          <button
            type="button"
            class="chip"
            title="Mirror only the arm chain"
            @click="mirrorArmLimb()"
          >
            Mirror arms
          </button>
          <button
            type="button"
            class="chip"
            title="Mirror only the leg chain"
            @click="mirrorLegLimb()"
          >
            Mirror legs
          </button>
          <button
            type="button"
            class="chip"
            title="Switch Pose Sides — mirror the whole body"
            @click="switchPoseSides()"
          >
            Switch sides
          </button>
        </div>

        <div class="row wrap">
          <button
            type="button"
            class="chip"
            title="Copy the current pose to the clipboard"
            @click="copyPose()"
          >
            Copy pose
          </button>
          <button
            type="button"
            class="chip"
            title="Paste the clipboard pose onto this model"
            @click="pastePose()"
          >
            Paste pose
          </button>
          <button
            type="button"
            class="chip"
            :class="{ on: inPlace }"
            title="Apply poses without their root drop, so the figure stays put"
            @click="toggleInPlace()"
          >
            In place
          </button>
          <button
            type="button"
            class="chip"
            title="Apply a random pose from the current filter"
            @click="applyRandomPose()"
          >
            Random
          </button>
        </div>
        <p v-if="clipboardStatus" class="hint">{{ clipboardStatus }}</p>

        <label class="field">
          <span>Search poses</span>
          <input
            v-model="poseSearch"
            type="search"
            placeholder="e.g. sword, wave, kneel"
          />
        </label>

        <div class="tags">
          <button
            v-for="tag in allPoseTags"
            :key="tag"
            type="button"
            class="tag"
            :class="{ on: poseTagFilter.includes(tag) }"
            @click="togglePoseTag(tag)"
          >
            {{ tag }}
          </button>
        </div>

        <div class="pose-grid">
          <button
            v-for="pose in visiblePoses"
            :key="pose.id"
            type="button"
            class="pose-tile"
            :class="{ on: appliedPoseId === pose.id }"
            :title="`${pose.name} — ${pose.tags.join(', ')}`"
            @click="applyPose(pose)"
          >
            <img
              v-if="poseThumbs[pose.id]"
              :src="poseThumbs[pose.id]"
              :alt="`${pose.name} pose`"
            />
            <span v-else class="thumb placeholder" aria-hidden="true"></span>
            <span class="pose-name">{{ pose.name }}</span>
          </button>
        </div>
        <p class="hint">
          {{ visiblePoses.length }}
          {{ visiblePoses.length === 1 ? "pose" : "poses" }} shown
        </p>
        <p v-if="poseLibraryError" class="hint warn">
          Generated poses unavailable: {{ poseLibraryError }}
        </p>
        <p v-else-if="generatedPoseCount" class="hint">
          Including {{ generatedPoseCount }} generated poses.
        </p>
      </section>

      <section v-if="objectOptions.length">
        <h2>Object</h2>
        <label class="field">
          <span>Selected</span>
          <select
            :value="selectedObjectId ?? ''"
            @change="selectObject(($event.target as HTMLSelectElement).value || null)"
          >
            <option value="">None</option>
            <option
              v-for="opt in objectOptions"
              :key="opt.id"
              :value="opt.id"
            >
              {{ opt.label }}
            </option>
          </select>
        </label>

        <div class="row gizmo-modes" role="group" aria-label="Object transform mode">
          <button
            type="button"
            class="chip"
            :class="{ on: objectGizmoMode === 'translate' }"
            title="Move (G)"
            @click="setObjectGizmoMode('translate')"
          >
            Move
          </button>
          <button
            type="button"
            class="chip"
            :class="{ on: objectGizmoMode === 'rotate' }"
            title="Rotate (Shift+R)"
            @click="setObjectGizmoMode('rotate')"
          >
            Rotate
          </button>
          <button
            type="button"
            class="chip"
            :class="{ on: objectGizmoMode === 'scale' }"
            title="Scale (S)"
            @click="setObjectGizmoMode('scale')"
          >
            Scale
          </button>
        </div>

        <div class="row wrap">
          <button
            type="button"
            class="chip"
            :disabled="!selectedObjectId"
            title="Duplicate (Shift+D)"
            @click="duplicateSelectedObject()"
          >
            Duplicate
          </button>
          <button
            type="button"
            class="chip"
            :disabled="!selectedObjectId"
            title="Show / hide (Shift+H)"
            @click="toggleObjectHidden()"
          >
            Hide / Show
          </button>
          <button
            type="button"
            class="chip"
            :disabled="!selectedObjectId"
            title="Lock / unlock (L)"
            @click="toggleObjectLocked()"
          >
            Lock
          </button>
          <button
            type="button"
            class="chip danger"
            :disabled="!selectedObjectId"
            title="Delete (Del)"
            @click="deleteSelectedObject()"
          >
            Delete
          </button>
        </div>

        <label class="field">
          <span>Colour</span>
          <input
            type="color"
            :disabled="!selectedObjectId"
            @input="setSelectedObjectColor(($event.target as HTMLInputElement).value)"
          />
        </label>
        <button
          type="button"
          class="chip wide"
          :disabled="!selectedObjectId"
          @click="setSelectedObjectColor(null)"
        >
          Clear colour
        </button>
        <p class="hint">
          The gizmo moves the whole object. FK still rotates a single joint.
        </p>
      </section>

      <section v-if="activeModelId">
        <h2>Joint groups</h2>
        <p class="hint">
          Group a chain so it can be posed or reset as a unit.
        </p>
        <div class="row preset-row">
          <input
            v-model="groupDraftName"
            type="text"
            placeholder="Group name"
            aria-label="Group name"
          />
          <button
            type="button"
            class="chip"
            :disabled="!groupDraftName.trim() || groupDraftBones.length === 0"
            @click="createGroup()"
          >
            Add
          </button>
        </div>
        <div class="tags bone-tags">
          <button
            v-for="bone in groupableBones"
            :key="bone"
            type="button"
            class="tag"
            :class="{ on: groupDraftBones.includes(bone) }"
            @click="
              groupDraftBones = groupDraftBones.includes(bone)
                ? groupDraftBones.filter((b) => b !== bone)
                : [...groupDraftBones, bone]
            "
          >
            {{ bone }}
          </button>
        </div>
        <ul v-if="jointGroups.length" class="list">
          <li v-for="group in jointGroups" :key="group.id">
            <button type="button" @click="resetGroup(group.id)">
              {{ group.name }}
              <small>({{ group.bones.length }})</small>
            </button>
            <button
              type="button"
              class="danger"
              :aria-label="`Delete group ${group.name}`"
              @click="deleteGroup(group.id)"
            >
              &times;
            </button>
          </li>
        </ul>
        <p v-else class="hint">No groups yet.</p>
        <p v-if="groupStatus" class="hint">{{ groupStatus }}</p>
      </section>

      <section v-if="activeModelId">
        <h2>Anchors</h2>
        <p class="hint">
          Pin a joint to another joint or a prop. Cycles are refused.
        </p>
        <label class="field">
          <span>Joint</span>
          <select v-model="anchorDraftBone">
            <option :value="null">Pick a joint</option>
            <option v-for="bone in groupableBones" :key="bone" :value="bone">
              {{ bone }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>Pin to</span>
          <select v-model="anchorDraftTarget">
            <option :value="null">Pick a target</option>
            <optgroup label="Joints">
              <option
                v-for="bone in groupableBones"
                :key="bone"
                :value="{ kind: 'bone', name: bone }"
              >
                {{ bone }}
              </option>
            </optgroup>
            <optgroup v-if="props.length" label="Props">
              <option
                v-for="prop in props"
                :key="prop.id"
                :value="{ kind: 'prop', id: prop.id }"
              >
                {{ prop.config.name }}
              </option>
            </optgroup>
          </select>
        </label>
        <div class="row wrap">
          <label class="field inline-field">
            <span>Offset X</span>
            <input v-model.number="anchorDraftOffset[0]" type="number" step="0.05" />
          </label>
          <label class="field inline-field">
            <span>Offset Y</span>
            <input v-model.number="anchorDraftOffset[1]" type="number" step="0.05" />
          </label>
          <label class="field inline-field">
            <span>Offset Z</span>
            <input v-model.number="anchorDraftOffset[2]" type="number" step="0.05" />
          </label>
        </div>
        <button
          type="button"
          class="chip wide"
          :disabled="!anchorDraftBone || !anchorDraftTarget"
          @click="createAnchor()"
        >
          Add anchor
        </button>
        <p v-if="anchorError" class="hint warn">{{ anchorError }}</p>
        <ul v-if="anchors.length" class="list">
          <li v-for="anchor in anchors" :key="anchor.id">
            <button type="button" disabled>
              {{ anchor.bone }} &rarr;
              {{ anchor.target.kind === "bone"
                ? anchor.target.name
                : (props.find((p) => p.id === anchor.target.id)?.config.name
                  ?? anchor.target.id) }}
            </button>
            <button
              type="button"
              class="danger"
              :aria-label="`Remove anchor on ${anchor.bone}`"
              @click="deleteAnchor(anchor.id)"
            >
              &times;
            </button>
          </li>
        </ul>
        <p v-else class="hint">No anchors yet.</p>
      </section>

      <section v-if="activeModelId" class="vendor-lib">
        <h2>Reference library</h2>
        <p class="hint">
          {{ vendorPoseIndex.length.toLocaleString() }} reference poses,
          {{ visibleVendorProps.length.toLocaleString() }} props and
          {{ vendorSceneIndex.length.toLocaleString() }} scenes, fetched from the
          local asset library on demand.
        </p>
        <p v-if="vendorPoseError" class="hint warn">
          Reference poses unavailable: {{ vendorPoseError }}
        </p>

        <div class="row wrap">
          <button
            type="button"
            class="chip"
            :class="{ on: libraryTab === 'poses' }"
            @click="libraryTab = 'poses'"
          >
            Poses
          </button>
          <button
            type="button"
            class="chip"
            :class="{ on: libraryTab === 'props' }"
            @click="libraryTab = 'props'"
          >
            Props
          </button>
          <button
            type="button"
            class="chip"
            :class="{ on: libraryTab === 'scenes' }"
            @click="libraryTab = 'scenes'"
          >
            Scenes
          </button>
        </div>

        <label class="field">
          <span>Search library</span>
          <input v-model="librarySearch" type="search" placeholder="e.g. sword, dance, chair" />
        </label>

        <template v-if="libraryTab === 'poses'">
          <p v-if="!vendorPoseIndex.length" class="hint">No reference poses loaded.</p>
          <div v-else class="pose-grid vendor-grid">
            <button
              v-for="row in filteredVendorPoses"
              :key="row.id"
              type="button"
              class="pose-tile"
              :title="`${row.name} — ${row.category}`"
              @click="applyVendorPose(row)"
            >
              <img
                v-if="vendorThumb(row)"
                :src="vendorThumb(row)!"
                :alt="`${row.name} reference`"
                loading="lazy"
              />
              <span v-else class="thumb placeholder" aria-hidden="true"></span>
              <span class="pose-name">{{ row.name }}</span>
            </button>
          </div>
          <p class="hint">
            {{ filteredVendorPoses.length.toLocaleString() }} of
            {{ vendorPoseIndex.length.toLocaleString() }} poses
          </p>
        </template>

        <template v-else-if="libraryTab === 'props'">
          <label class="field">
            <span>Family</span>
            <select v-model="vendorPropFamily">
              <option :value="null">All families</option>
              <option v-for="f in vendorPropFamilies" :key="f" :value="f">{{ f }}</option>
            </select>
          </label>
          <div class="prop-grid vendor-grid">
            <button
              v-for="prop in visibleVendorProps"
              :key="prop.id"
              type="button"
              class="prop-tile"
              :title="prop.name"
              @click="addVendorProp(prop)"
            >
              <img
                v-if="vendorPropThumb(prop)"
                :src="vendorPropThumb(prop)!"
                :alt="`${prop.name} prop`"
                loading="lazy"
              />
              <span v-else class="thumb placeholder" aria-hidden="true"></span>
              <span class="pose-name">{{ prop.name.trim() }}</span>
            </button>
          </div>
          <p class="hint">{{ visibleVendorProps.length.toLocaleString() }} props</p>
        </template>

        <template v-else>
          <p v-if="vendorSceneError" class="hint warn">{{ vendorSceneError }}</p>
          <p v-else-if="!vendorSceneIndex.length" class="hint">No reference scenes loaded.</p>
          <ul v-else class="list vendor-list">
            <li v-for="row in visibleVendorScenes" :key="row.id">
              <button type="button" :title="row.description" @click="applyVendorScene(row)">
                {{ row.name }}
              </button>
            </li>
          </ul>
          <p class="hint">{{ visibleVendorScenes.length.toLocaleString() }} scenes</p>
        </template>
      </section>

      <section v-if="activeModelId">
        <h2>Hand poses</h2>
        <p class="hint">
          Hands transfer independently of the body, so a finished pose keeps its
          articulation while you refine the hands.
        </p>
        <div class="row wrap">
          <button
            type="button"
            class="chip"
            :class="{ on: handSide === 'Left' }"
            @click="setHandSide('Left')"
          >
            Left
          </button>
          <button
            type="button"
            class="chip"
            :class="{ on: handSide === 'Right' }"
            @click="setHandSide('Right')"
          >
            Right
          </button>
        </div>
        <div class="row wrap">
          <button type="button" class="chip" @click="copyHandPose()">
            Copy pose (and hand)
          </button>
          <button type="button" class="chip" @click="pasteHandOnly()">
            Paste hand only
          </button>
          <button type="button" class="chip" @click="resetHands()">
            Reset hands
          </button>
        </div>
        <p v-if="handPoseStatus" class="hint">{{ handPoseStatus }}</p>
        <p v-if="handPoseError" class="hint warn">{{ handPoseError }}</p>

        <label class="field">
          <span>Search hand poses</span>
          <input
            v-model="handPoseSearch"
            type="search"
            placeholder="e.g. grip, point, fist"
          />
        </label>
        <div class="pose-grid">
          <button
            v-for="pose in visibleHandPoses"
            :key="pose.id"
            type="button"
            class="pose-tile hand-tile"
            :title="`${pose.name} — ${pose.tags.join(', ')}`"
            @click="applyHandPose(pose)"
          >
            <span class="thumb placeholder hand-thumb" aria-hidden="true"></span>
            <span class="pose-name">{{ pose.name }}</span>
          </button>
        </div>
        <p class="hint">
          {{ visibleHandPoses.length }}
          {{ visibleHandPoses.length === 1 ? "hand pose" : "hand poses" }}
        </p>
      </section>

      <section v-if="activeModelId">
        <h2>Animation</h2>
        <p v-if="clipError" class="hint warn">{{ clipError }}</p>
        <p v-else-if="clipSummaries.length === 0" class="hint">
          Loading clips...
        </p>
        <template v-else>
          <label class="field">
            <span>Search clips</span>
            <input v-model="clipSearch" type="search" placeholder="clip id" />
          </label>

          <div class="clip-list">
            <button
              v-for="clip in visibleClips.slice(0, 40)"
              :key="clip.id"
              type="button"
              class="clip-row"
              :class="{ on: clip.id === activeClipId }"
              @click="selectClip(clip.id)"
            >
              {{ clip.name }}
              <span class="clip-meta">{{ clip.durationSeconds.toFixed(1) }}s</span>
            </button>
          </div>

          <div v-if="activeClipId" class="transport">
            <div class="transport-buttons">
              <button
                type="button"
                class="chip small"
                title="Previous frame"
                @click="stepClip(-1)"
              >
                &#9664;&#9646;
              </button>
              <button type="button" class="chip small wide" @click="togglePlayback">
                {{ playing ? "Pause" : "Play" }}
              </button>
              <button
                type="button"
                class="chip small"
                title="Next frame"
                @click="stepClip(1)"
              >
                &#9654;&#9646;
              </button>
              <button
                type="button"
                class="chip small"
                title="Stop"
                @click="stopPlayback"
              >
                &#9632;
              </button>
            </div>
            <input
              class="scrub"
              type="range"
              min="0"
              :max="clipDuration"
              step="0.01"
              :value="clipTime"
              @input="seekClip(Number(($event.target as HTMLInputElement).value))"
            />
            <p class="hint">
              frame {{ clipFrame }} &middot;
              {{ clipTime.toFixed(2) }}s / {{ clipDuration.toFixed(2) }}s
            </p>
          </div>
        </template>
      </section>

      <section>
        <h2>Props</h2>
        <p v-if="propError" class="hint warn">{{ propError }}</p>

        <div v-for="[family, items] in propGroups" :key="family" class="group">
          <h3>{{ family }}</h3>
          <div class="grid">
            <button
              v-for="p in items"
              :key="p.id"
              type="button"
              class="chip"
              @click="addProp(p)"
            >
              {{ p.name }}
            </button>
          </div>
        </div>

        <label class="file-btn">
          Import .obj / .glb
          <input
            type="file"
            accept=".obj,.glb,.gltf"
            hidden
            @change="onPropFile"
          />
        </label>

        <div v-if="props.length" class="prop-list">
          <div
            v-for="placed in props"
            :key="placed.id"
            class="prop-row"
            :class="{ on: placed.id === selectedPropId }"
          >
            <span
              class="prop-name"
              role="button"
              tabindex="0"
              @click="selectedPropId = placed.id"
            >
              {{ placed.config.name }}
            </span>
            <span class="prop-actions">
              <button
                type="button"
                class="chip tiny"
                title="Drop to floor"
                @click="dropPropToFloor(placed.id)"
              >
                v
              </button>
              <button
                type="button"
                class="chip tiny"
                title="Place at the figure's feet"
                @click="placePropAtBone(placed.id, 'LeftFoot')"
              >
                @
              </button>
              <button
                type="button"
                class="chip tiny danger"
                :aria-label="`Remove ${placed.config.name}`"
                @click="removeProp(placed.id)"
              >
                &times;
              </button>
            </span>
          </div>
        </div>
      </section>

      <section>
        <h2>Image planes</h2>
        <p v-if="imagePlanes.length === 0" class="hint">
          Import an image to compose and check perspective against it.
        </p>
        <div class="prop-list">
          <div v-for="plane in imagePlanes" :key="plane.id" class="prop-row">
            <span class="prop-name">{{ plane.name }}</span>
            <button
              type="button"
              class="chip tiny danger"
              :aria-label="`Remove ${plane.name}`"
              @click="removeImagePlane(plane.id)"
            >
              &times;
            </button>
          </div>
        </div>
        <label class="file-btn">
          {{ imagePlanes.length ? "Add another" : "Add image plane" }}
          <input type="file" accept="image/*" hidden @change="onImageFile" />
        </label>
      </section>

      <section>
        <h2>Scene</h2>
        <p v-if="sceneError" class="hint warn">{{ sceneError }}</p>

        <label class="field">
          <span>Name</span>
          <input v-model="sceneName" type="text" placeholder="Untitled" />
        </label>

        <div class="transport-buttons">
          <button
            type="button"
            class="chip small"
            :disabled="!canUndo"
            title="Undo (Ctrl+Z)"
            @click="undo()"
          >
            Undo
          </button>
          <button
            type="button"
            class="chip small"
            :disabled="!canRedo"
            title="Redo (Ctrl+Shift+Z)"
            @click="redo()"
          >
            Redo
          </button>
        </div>

        <div class="scene-buttons">
          <button type="button" class="chip wide" @click="saveCurrentScene()">
            Save
          </button>
          <button type="button" class="chip wide" @click="exportCurrentScene()">
            Export file
          </button>
        </div>

        <label class="file-btn">
          Import scene file
          <input type="file" accept=".json,application/json" hidden @change="onSceneFile" />
        </label>

        <h3 class="sub">Premade</h3>
        <div class="scene-list">
          <button
            v-for="s in premadeScenes"
            :key="s.name"
            type="button"
            class="scene-row"
            :title="s.description"
            @click="loadPremadeScene(s.name)"
          >
            {{ s.name }}
          </button>
        </div>

        <template v-if="savedScenes.length">
          <h3 class="sub">Saved</h3>
          <div class="scene-list">
            <div v-for="s in savedScenes" :key="s.name" class="scene-row saved">
              <span class="scene-name" @click="openSavedScene(s.name)">
                {{ s.name }}
              </span>
              <button
                type="button"
                class="chip tiny danger"
                :aria-label="`Delete ${s.name}`"
                @click="deleteSavedScene(s.name)"
              >
                &times;
              </button>
            </div>
          </div>
        </template>
      </section>

      <section v-if="activeModelId">
        <h2>Joints</h2>
        <p class="hint">
          {{
            selectedBone
              ? `Selected: ${selectedBone}`
              : "No joint selected"
          }}
        </p>
        <div class="grid bones">
          <button
            v-for="b in boneNames"
            :key="b"
            type="button"
            class="chip small"
            :class="{ on: b === selectedBone }"
            @click="selectBone(b)"
          >
            {{ b }}
          </button>
        </div>
      </section>
    </aside>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="exportError" class="error" role="alert">{{ exportError }}</p>

    <section v-if="exportResults.length" class="export-strip">
      <div class="export-head">
        <span>Exported {{ exportResults.length }} passes</span>
        <button type="button" class="chip small" @click="clearExport">
          Dismiss
        </button>
      </div>
      <div class="export-grid">
        <figure v-for="r in exportResults" :key="r.pass">
          <img :src="r.dataUrl" :alt="`${r.pass} pass`" />
          <figcaption>
            <span>{{ r.pass }}</span>
            <button
              type="button"
              class="chip small"
              @click="download(r.filename, r.dataUrl)"
            >
              Save
            </button>
          </figcaption>
        </figure>
      </div>
    </section>

    <div v-if="settingsOpen" class="modal" @click.self="openSettings()">
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Settings">
        <header>
          <h2>Settings</h2>
          <button type="button" class="chip" @click="openSettings()">&times;</button>
        </header>

        <section>
          <h3>Preferences</h3>
          <label class="toggle">
            <input
              type="checkbox"
              :checked="prefs.exportTransparencyDefault"
              @change="setPref('exportTransparencyDefault', ($event.target as HTMLInputElement).checked)"
            />
            <span>Transparent background by default</span>
          </label>
          <label class="toggle">
            <input
              type="checkbox"
              :checked="prefs.snapPropsByDefault"
              @change="setPref('snapPropsByDefault', ($event.target as HTMLInputElement).checked)"
            />
            <span>Snap new props to the floor</span>
          </label>
          <label class="toggle">
            <input
              type="checkbox"
              :checked="prefs.autoKeyframes"
              @change="setPref('autoKeyframes', ($event.target as HTMLInputElement).checked)"
            />
            <span>Record a keyframe on every pose change</span>
          </label>
        </section>

        <section>
          <h3>Keyboard shortcuts</h3>
          <dl class="shortcuts">
            <template v-for="s in shortcutHelp" :key="s.keys">
              <dt>{{ s.keys }}</dt>
              <dd>{{ s.label }}</dd>
            </template>
          </dl>
          <button type="button" class="chip wide" @click="replayTour()">
            Replay the tour
          </button>
        </section>
      </div>
    </div>

    <div v-if="tourStep !== null" class="tour">
      <div class="tour-card" role="dialog" aria-modal="true">
        <h3>{{ tour[tourStep].title }}</h3>
        <p>{{ tour[tourStep].body }}</p>
        <footer>
          <span class="tour-dots">
            <i
              v-for="(t, i) in tour"
              :key="t.title"
              :class="{ on: i === tourStep }"
            ></i>
          </span>
          <button type="button" class="chip" @click="skipTour()">Skip</button>
          <button
            type="button"
            class="chip"
            :disabled="tourStep === 0"
            @click="prevTourStep()"
          >
            Back
          </button>
          <button type="button" class="chip primary" @click="nextTourStep()">
            {{ tourStep >= tour.length - 1 ? "Done" : "Next" }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  position: relative;
  height: 100%;
}

.viewport {
  position: fixed;
  inset: 0;
}

.topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 40px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border-bottom: 1px solid var(--poseify-border);
  background: color-mix(in srgb, var(--poseify-panel) 92%, transparent);
  backdrop-filter: blur(6px);
  z-index: 2;
}

.brand {
  font-weight: 600;
  letter-spacing: 0.02em;
}

.status {
  color: var(--poseify-text-dim);
  font-size: 12px;
}

.panel {
  position: fixed;
  top: 48px;
  bottom: 12px;
  width: 216px;
  padding: 10px 12px;
  border: 1px solid var(--poseify-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--poseify-panel) 94%, transparent);
  backdrop-filter: blur(6px);
  overflow-y: auto;
  z-index: 2;
}

.panel-left {
  left: 12px;
}

.panel-right {
  right: 12px;
}

.panel h2 {
  margin: 10px 0 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--poseify-text-dim);
}

.panel h3 {
  margin: 8px 0 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--poseify-text-dim);
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.grid.bones {
  grid-template-columns: 1fr;
  max-height: 260px;
  overflow-y: auto;
}

button.chip {
  padding: 5px 6px;
  border: 1px solid var(--poseify-border);
  border-radius: 6px;
  background: #232833;
  color: var(--poseify-text);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
}

button.chip:hover {
  border-color: var(--poseify-accent);
}

button.chip.on {
  border-color: var(--poseify-accent);
  background: color-mix(in srgb, var(--poseify-accent) 26%, #232833);
}

button.chip.small {
  font-size: 10px;
  padding: 3px 6px;
}

button.chip.wide {
  width: 100%;
  text-align: center;
}

/* Phase 1 object toolbar: a segmented control for the gizmo mode and a
   wrapping row of the per-object commands. */
.row {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.row.wrap {
  flex-wrap: wrap;
}

/* Camera preset name field sits beside its Save button. */
.preset-row input[type="text"] {
  flex: 1 1 auto;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid var(--poseify-border);
  border-radius: 6px;
  background: #1b1f27;
  color: var(--poseify-text);
  font-size: 11px;
}

.vendor-grid {
  max-height: 320px;
  overflow-y: auto;
}

.vendor-grid .pose-tile img,
.vendor-grid .prop-tile img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 5px;
  background: #101319;
}

.vendor-list {
  max-height: 320px;
  overflow-y: auto;
}

.bone-tags {
  max-height: 120px;
  overflow-y: auto;
}

.inline-field {
  flex: 1 1 0;
  min-width: 0;
}

.inline-field input {
  width: 100%;
  padding: 3px 5px;
  border: 1px solid var(--poseify-border);
  border-radius: 6px;
  background: #1b1f27;
  color: var(--poseify-text);
  font-size: 11px;
}

.hand-tile {
  align-items: stretch;
}

.hand-thumb {
  aspect-ratio: 3 / 4;
}

.gizmo-modes button.chip {
  flex: 1 1 0;
  text-align: center;
}

button.chip.danger {
  color: var(--poseify-danger, #ff8080);
}

button.chip.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 4px;
  text-align: center;
  width: 100%;
  height: 100%;
}

.tile-wrap {
  position: relative;
}

button.chip.tile.hasThumb {
  padding: 3px 3px 5px;
}

.thumb {
  width: 100%;
  height: 58px;
  object-fit: contain;
  border-radius: 4px;
  background: linear-gradient(180deg, #1b1f27, #14171d);
}

.thumb.placeholder {
  display: block;
}

button.chip.tile.loading {
  border-color: var(--poseify-accent);
  opacity: 0.6;
}

/* ------------------------------------------------------- PoseMy.Art shell
 *
 * Round icon buttons on two rails, a contextual toolbar, and overlays over
 * the canvas. No permanent side panels: the 3D view is the app, the chrome
 * floats on it. 46px matches PoseMy.Art's button size so the muscle memory
 * transfers.
 */
.rail {
  position: fixed;
  top: 10px;
  z-index: 3;
  display: flex;
  gap: 2px;
}

.rail-top-left {
  left: 4px;
}

.rail-top-right {
  right: 4px;
}

.icon-btn {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--poseify-panel) 86%, transparent);
  backdrop-filter: blur(8px);
  color: var(--poseify-text);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background 120ms ease, transform 120ms ease;
}

.icon-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--poseify-accent) 34%, var(--poseify-panel));
  transform: translateY(-1px);
}

.icon-btn:active:not(:disabled) {
  transform: translateY(0);
}

.icon-btn.on {
  background: color-mix(in srgb, var(--poseify-accent) 60%, var(--poseify-panel));
}

.icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.icon-btn.close {
  width: 32px;
  height: 32px;
  font-size: 20px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.status-pill {
  position: fixed;
  left: 60px;
  top: 16px;
  z-index: 2;
  margin: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--poseify-panel) 80%, transparent);
  color: var(--poseify-text-dim);
  font-size: 12px;
  pointer-events: none;
}

/* Contextual toolbar for the selected object. Sits just under the rails so it
 * never overlaps them, and scrolls horizontally on a narrow window rather
 * than wrapping into the canvas. */
.context-bar {
  position: fixed;
  top: 66px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: calc(100vw - 24px);
  padding: 6px 8px;
  border: 1px solid var(--poseify-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--poseify-panel) 92%, transparent);
  backdrop-filter: blur(10px);
  overflow-x: auto;
  scrollbar-width: thin;
}

.context-bar .segmented {
  display: flex;
  gap: 2px;
  grid-template-columns: none;
}

.context-bar .segmented button {
  padding: 6px 12px;
  white-space: nowrap;
}

.context-divider {
  width: 1px;
  height: 22px;
  background: var(--poseify-border);
  flex: 0 0 auto;
}

.tool-btn {
  padding: 7px 12px;
  border: 1px solid var(--poseify-border);
  border-radius: 8px;
  background: #232833;
  color: var(--poseify-text);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}

.tool-btn:hover {
  border-color: var(--poseify-accent);
}

.tool-btn.danger {
  color: #ff8080;
}

.tool-swatch {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--poseify-border);
  border-radius: 8px;
  background: #232833;
  cursor: pointer;
  flex: 0 0 auto;
}

.tool-swatch input {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

/* Overlay surface: large, centred, and offset from the rails so it never
 * covers the buttons that opened it. */
.overlay {
  position: fixed;
  z-index: 4;
  top: 66px;
  left: 60px;
  right: 60px;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--poseify-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--poseify-panel) 96%, transparent);
  backdrop-filter: blur(12px);
  box-shadow: 0 18px 50px rgb(0 0 0 / 45%);
  overflow: hidden;
}

.overlay-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--poseify-border);
}

.overlay-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.overlay-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.overlay-pane {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* The original two-column panels are superseded by the rails and overlays.
 * They stay in the template for now so each section can be ported into its
 * overlay pane without losing markup, but they must not render: two panels
 * plus the new chrome is the layout problem this change is fixing.
 * Remove the aside elements once every section has been ported.
 */
.panel-left,
.panel-right {
  display: none;
}

.overlay-controls {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.overlay-controls .grow {
  flex: 1;
}

.overlay-controls .compact {
  width: 110px;
}

.overlay-controls input[type="number"] {
  width: 100%;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 4px 0 2px;
}

.pager .hint {
  margin: 0;
  min-width: 200px;
  text-align: center;
}

/* The pose grid's own rule is 2 columns with a 320px cap, sized for the old
 * 216px rail. Inside the overlay it has the full width, so it becomes an
 * auto-fill grid and gives up the inner scroll — the overlay body scrolls
 * instead, which keeps the pager reachable.
 */
.overlay-pane .pose-grid {
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 8px;
  max-height: none;
  overflow-y: visible;
  margin-top: 0;
}

/* Model tiles go from 2-up in a 216px rail to 5-up across the overlay, which
 * is what makes the renders readable. */
.tile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.segmented button {
  padding: 6px;
  border: 1px solid var(--poseify-border);
  border-radius: 6px;
  background: #232833;
  color: var(--poseify-text);
  font-size: 12px;
  cursor: pointer;
}

.segmented button.on {
  border-color: var(--poseify-accent);
  background: color-mix(in srgb, var(--poseify-accent) 30%, #232833);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.list li {
  display: flex;
  align-items: stretch;
  gap: 3px;
}

.list li button:first-child {
  flex: 1;
  padding: 5px 6px;
  border: 1px solid var(--poseify-border);
  border-radius: 6px;
  background: #232833;
  color: var(--poseify-text);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
}

.list li.active button:first-child {
  border-color: var(--poseify-accent);
}

.list li button.danger {
  width: 24px;
  border: 1px solid var(--poseify-border);
  border-radius: 6px;
  background: #232833;
  color: var(--poseify-text-dim);
  cursor: pointer;
}

.hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--poseify-text-dim);
}

.field {
  display: block;
  margin: 6px 0;
}

.field > span {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--poseify-text-dim);
  margin-bottom: 3px;
}

.field b {
  color: var(--poseify-text);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.field input[type="range"] {
  width: 100%;
  height: 16px;
  accent-color: var(--poseify-accent);
  cursor: pointer;
}

.check {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 5px 0;
  font-size: 11px;
  color: var(--poseify-text-dim);
  cursor: pointer;
}

.check input {
  accent-color: var(--poseify-accent);
  cursor: pointer;
}

.hint.warn {
  color: #f0b4b4;
}

.field input[type="search"] {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid var(--poseify-border);
  border-radius: 5px;
  background: #1a1e26;
  color: var(--poseify-text);
  font-size: 11px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin: 6px 0;
}

button.tag {
  padding: 2px 6px;
  border: 1px solid var(--poseify-border);
  border-radius: 10px;
  background: transparent;
  color: var(--poseify-text-dim);
  font-size: 10px;
  cursor: pointer;
}

button.tag.on {
  border-color: var(--poseify-accent);
  background: color-mix(in srgb, var(--poseify-accent) 28%, transparent);
  color: var(--poseify-text);
}

.pose-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  max-height: 320px;
  overflow-y: auto;
  margin-top: 6px;
}

.pose-tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--poseify-border);
  border-radius: 5px;
  background: #232833;
  color: var(--poseify-text);
  cursor: pointer;
  text-align: center;
}

.pose-tile:hover {
  border-color: var(--poseify-accent);
}

.pose-tile.on {
  border-color: var(--poseify-accent);
  background: color-mix(in srgb, var(--poseify-accent) 24%, #232833);
}

.pose-tile img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  border-radius: 3px;
  background: #0e1014;
}

.pose-name {
  font-size: 9px;
  line-height: 1.2;
  color: var(--poseify-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clip-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 160px;
  overflow-y: auto;
  margin: 6px 0;
}

.clip-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 4px 6px;
  border: 1px solid var(--poseify-border);
  border-radius: 5px;
  background: #232833;
  color: var(--poseify-text);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
}

.clip-row:hover {
  border-color: var(--poseify-accent);
}

.clip-row.on {
  border-color: var(--poseify-accent);
  background: color-mix(in srgb, var(--poseify-accent) 24%, #232833);
}

.clip-meta {
  color: var(--poseify-text-dim);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.transport {
  margin-top: 6px;
}

.transport-buttons {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 3px;
}

.transport-buttons .chip.wide {
  grid-column: span 2;
}

.scrub {
  width: 100%;
  height: 18px;
  margin-top: 4px;
  accent-color: var(--poseify-accent);
  cursor: pointer;
}

.file-btn {
  display: block;
  margin-top: 6px;
  padding: 5px 6px;
  border: 1px dashed var(--poseify-border);
  border-radius: 6px;
  color: var(--poseify-text-dim);
  font-size: 11px;
  text-align: center;
  cursor: pointer;
}

.file-btn:hover {
  border-color: var(--poseify-accent);
  color: var(--poseify-text);
}

.prop-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 6px;
}

.prop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 4px 6px;
  border: 1px solid var(--poseify-border);
  border-radius: 5px;
  background: #232833;
  font-size: 11px;
}

.prop-row.on {
  border-color: var(--poseify-accent);
  background: color-mix(in srgb, var(--poseify-accent) 22%, #232833);
}

.prop-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.prop-actions {
  display: flex;
  gap: 2px;
}

button.chip.tiny {
  padding: 1px 5px;
  font-size: 10px;
  line-height: 1.3;
}

button.chip.tiny.danger {
  color: #f0b4b4;
}

.scene-buttons {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 4px;
}

.panel h3.sub {
  margin: 8px 0 3px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--poseify-text-dim);
}

.scene-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 180px;
  overflow-y: auto;
}

button.scene-row,
.scene-row.saved {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  width: 100%;
  padding: 4px 6px;
  border: 1px solid var(--poseify-border);
  border-radius: 5px;
  background: #232833;
  color: var(--poseify-text);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

button.scene-row:hover,
.scene-row.saved:hover {
  border-color: var(--poseify-accent);
}

.scene-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.error {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  margin: 0;
  padding: 8px 12px;
  border: 1px solid #7a3030;
  border-radius: 6px;
  background: #2a1a1a;
  color: #f0b4b4;
  font-size: 12px;
  z-index: 3;
}

.export-buttons {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
}

button.chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.export-strip {
  position: fixed;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  max-width: min(92vw, 860px);
  padding: 8px 10px;
  border: 1px solid var(--poseify-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--poseify-panel) 95%, transparent);
  backdrop-filter: blur(6px);
  z-index: 4;
}

.export-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--poseify-text-dim);
}

.export-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.export-grid figure {
  margin: 0;
}

.export-grid img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  border-radius: 4px;
  background: #0e1014;
}

.export-grid figcaption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-top: 3px;
  font-size: 10px;
  color: var(--poseify-text-dim);
}

/* ---- M10: favourites, settings and onboarding tour ---- */
.fav {
  position: absolute;
  top: 4px;
  right: 6px;
  padding: 0 2px;
  border: 0;
  background: none;
  font-size: 14px;
  line-height: 1;
  color: rgba(255, 255, 255, 0.45);
  cursor: pointer;
  user-select: none;
}

.fav.on {
  color: #ff5c7a;
}

.modal {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  background: rgba(6, 8, 14, 0.68);
}

.sheet {
  width: min(460px, 92vw);
  max-height: 84vh;
  overflow: auto;
  padding: 16px 18px 20px;
  border-radius: 10px;
  background: #14171f;
  border: 1px solid #262b36;
  color: #e6e8ee;
}

.sheet header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sheet h2 {
  margin: 0 0 8px;
  font-size: 16px;
}

.sheet h3 {
  margin: 14px 0 6px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #8f97a8;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  cursor: pointer;
}

.shortcuts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 12px;
  margin: 0 0 12px;
  font-size: 13px;
}

.shortcuts dt {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #9fd0ff;
  white-space: nowrap;
}

.shortcuts dd {
  margin: 0;
  color: #c3c8d4;
}

.tour {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 70;
  display: flex;
  justify-content: center;
  padding: 18px;
  pointer-events: none;
}

.tour-card {
  pointer-events: auto;
  width: min(520px, 94vw);
  padding: 14px 16px;
  border-radius: 10px;
  background: #171b24;
  border: 1px solid #2b3140;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.45);
  color: #e6e8ee;
}

.tour-card h3 {
  margin: 0 0 6px;
  font-size: 15px;
}

.tour-card p {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
  color: #c3c8d4;
}

.tour-card footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tour-dots {
  display: flex;
  gap: 5px;
  margin-right: auto;
}

.tour-dots i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #3a4152;
}

.tour-dots i.on {
  background: #6fb4ff;
}
</style>












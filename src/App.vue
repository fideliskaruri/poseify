<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { usePosing } from "./composables/usePosing";
import type { CatalogEntry } from "./models/ModelCatalog";
import { PREMADE_SCENES } from "./scene/PremadeScenes";
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

const premadeScenes = PREMADE_SCENES;
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

    <header class="topbar">
      <span class="brand">Poseify</span>
      <span class="status">{{ status }}</span>
      <button
        type="button"
        class="chip"
        :class="{ active: showFavoritesOnly }"
        :aria-pressed="showFavoritesOnly"
        title="Show only favourited models (F)"
        @click="toggleFavoritesFilter()"
      >
        &#9829;
      </button>
      <button
        type="button"
        class="chip"
        :aria-expanded="settingsOpen"
        title="Settings and keyboard shortcuts (Ctrl+,)"
        @click="openSettings()"
      >
        Settings
      </button>
    </header>

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








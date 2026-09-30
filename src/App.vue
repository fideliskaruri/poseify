<script setup lang="ts">
import { computed, onMounted } from "vue";
import { usePosing } from "./composables/usePosing";
import type { CatalogEntry } from "./models/ModelCatalog";

const {
  mount,
  status,
  error,
  mode,
  models,
  activeModelId,
  selectedBone,
  boneNames,
  catalog,
  init,
  attachModel,
  setActive,
  selectBone,
  setMode,
  removeModel,
  resetPose,
  thumbnails,
  loadThumbnails,
  loadingId,
  frameScene,
  fov,
  light,
  grid,
  lightGizmoVisible,
  setFov,
  setLight,
  setGrid,
  setLightGizmo,
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
} = usePosing();

onMounted(() => {
  init();
  loadThumbnails();
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

const groups = computed(() => {
  const map = new Map<string, CatalogEntry[]>();
  for (const m of catalog) {
    const list = map.get(m.family);
    if (list) list.push(m);
    else map.set(m.family, [m]);
  }
  return [...map.entries()];
});
</script>

<template>
  <div class="app">
    <div ref="mount" class="viewport"></div>

    <header class="topbar">
      <span class="brand">Poseify</span>
      <span class="status">{{ status }}</span>
    </header>

    <aside class="panel panel-left">
      <section>
        <h2>Models</h2>
        <div v-for="[family, items] in groups" :key="family" class="group">
          <h3>{{ family }}</h3>
          <div class="grid">
            <button
              v-for="m in items"
              :key="m.id"
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
          </div>
        </div>
      </section>

      <section v-if="models.length">
        <h2>Scene</h2>
        <ul class="list">
          <li
            v-for="m in models"
            :key="m.config.id"
            :class="{ active: m.config.id === activeModelId }"
          >
            <button type="button" @click="setActive(m.config.id)">
              {{ m.config.name }}
            </button>
            <button
              type="button"
              class="danger"
              :aria-label="`Remove ${m.config.name}`"
              @click="removeModel(m.config.id)"
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
          <span>Resolution <b>{{ exportSize }}&times;{{ exportSize }}</b></span>
          <input
            type="range"
            min="512"
            max="2048"
            step="256"
            :value="exportSize"
            @input="exportSize = Number(($event.target as HTMLInputElement).value)"
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
        <div class="export-buttons">
          <button
            type="button"
            class="chip wide"
            :disabled="exporting || !activeModelId"
            @click="runExport()"
          >
            {{ exporting ? "Rendering..." : "Export all 5" }}
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
        </div>
        <p class="hint">
          {{ RENDER_PASSES.length }} passes: regular, OpenPose, depth, canny,
          normals.
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

button.chip.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 4px;
  text-align: center;
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
</style>

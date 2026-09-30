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
} = usePosing();

onMounted(init);

function addModel(config: CatalogEntry): void {
  error.value = null;
  try {
    const posed = attachModel(config);
    setActive(posed.config.id);
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
              type="button"
              @click="addModel(m)"
            >
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
</style>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { Viewport } from "./renderer/Viewport";

const mount = ref<HTMLDivElement | null>(null);
const viewport = shallowRef<Viewport | null>(null);
const status = ref("starting");

onMounted(() => {
  if (!mount.value) return;
  const vp = new Viewport(mount.value);
  viewport.value = vp;
  vp.start();
  status.value = "running";
});

onBeforeUnmount(() => {
  viewport.value?.dispose();
  viewport.value = null;
});
</script>

<template>
  <div class="poseify-app">
    <div ref="mount" class="poseify-viewport"></div>
    <div class="poseify-hud" role="status">{{ status }}</div>
  </div>
</template>

<style scoped>
.poseify-app {
  position: relative;
  height: 100%;
}

.poseify-hud {
  position: fixed;
  left: 12px;
  bottom: 12px;
  padding: 6px 10px;
  border: 1px solid var(--poseify-border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--poseify-panel) 88%, transparent);
  color: var(--poseify-text-dim);
  font-size: 12px;
  pointer-events: none;
}
</style>

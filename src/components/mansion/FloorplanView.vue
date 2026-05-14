<script setup lang="ts">
import { computed } from 'vue';
import type { GameEngine } from '../../engine';
import { SCENE_HEIGHT, SCENE_WIDTH } from '../../engine/layout';
import type { SceneObject } from '../../types';
import NarrationPanel from '../NarrationPanel.vue';

const props = defineProps<{
  engine: GameEngine;
}>();

const scene = computed(() => props.engine.currentScene.value);
const rooms = computed(() => props.engine.visibleObjects.value);
const inDialog = computed(() => props.engine.state.dialogState !== null);

const backgroundStyle = computed(() => {
  const bg = scene.value.background;
  return bg ? { background: bg } : { background: '#1a1722' };
});

function rectStyle(obj: SceneObject) {
  const r = obj.rect ?? { x: 0, y: 0, w: 100, h: 100 };
  return {
    left: `${r.x}%`,
    top: `${r.y}%`,
    width: `${r.w}%`,
    height: `${r.h}%`,
  };
}

function click(obj: SceneObject) {
  if (inDialog.value) return;
  void props.engine.fireTrigger(obj, 'onClick');
}

function hover(obj: SceneObject) {
  if (inDialog.value) return;
  void props.engine.fireTrigger(obj, 'onHover');
}
</script>

<template>
  <div class="floorplan" :style="{ width: `${SCENE_WIDTH}px` }">
    <div class="map" :style="{ height: `${SCENE_HEIGHT}px`, ...backgroundStyle }">
      <div class="grid-overlay" aria-hidden="true" />
      <div class="map-frame" :class="{ disabled: inDialog }">
        <button
          v-for="obj in rooms"
          :key="obj.id"
          type="button"
          class="room"
          :style="rectStyle(obj)"
          :aria-label="obj.name"
          :disabled="inDialog"
          @click="click(obj)"
          @mouseenter="hover(obj)"
        >
          <span class="room-name">{{ obj.name }}</span>
        </button>
      </div>
      <div class="map-title">{{ scene.name }}</div>
    </div>
    <NarrationPanel :engine="engine" />
  </div>
</template>

<style scoped>
.floorplan {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 0 0 auto;
}

.map {
  position: relative;
  border: 1px solid var(--accent-dim);
  overflow: hidden;
}

.grid-overlay {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(220, 200, 160, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(220, 200, 160, 0.05) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
}

.map-frame {
  position: absolute;
  inset: 0;
}

.room {
  position: absolute;
  background: rgba(120, 100, 80, 0.10);
  border: 1px dashed rgba(220, 200, 160, 0.45);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0.5rem;
  transition: background 120ms, border-color 120ms, color 120ms;
}

.room:hover:not(:disabled) {
  background: rgba(255, 200, 120, 0.15);
  border-color: var(--hot);
  color: var(--hot);
}

.room:disabled {
  cursor: default;
  opacity: 0.55;
}

.room-name {
  font-size: 0.9rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.map-title {
  position: absolute;
  left: 0.75rem;
  bottom: 0.5rem;
  font-size: 0.85rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-dim);
  background: rgba(0, 0, 0, 0.45);
  padding: 0.15rem 0.5rem;
  pointer-events: none;
}

.floorplan > :deep(.narration) {
  height: 200px;
}
</style>

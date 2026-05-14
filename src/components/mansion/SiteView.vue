<script setup lang="ts">
import { computed } from 'vue';
import type { GameEngine } from '../../engine';
import { SCENE_HEIGHT, SCENE_WIDTH } from '../../engine/layout';
import type { SiteLocation } from '../../types';
import NarrationPanel from '../NarrationPanel.vue';

const props = defineProps<{
  engine: GameEngine;
}>();

const site = computed(() => props.engine.currentSite.value);
const locations = computed(() => props.engine.visibleLocations.value);

const backgroundStyle = computed(() => {
  const bg = site.value?.background;
  return bg ? { background: bg } : { background: '#1a1722' };
});

function rectStyle(loc: SiteLocation) {
  const r = loc.rect;
  return {
    left: `${r.x}%`,
    top: `${r.y}%`,
    width: `${r.w}%`,
    height: `${r.h}%`,
  };
}

function click(id: string) {
  void props.engine.clickLocation(id);
}
</script>

<template>
  <div class="site" :style="{ width: `${SCENE_WIDTH}px` }">
    <div class="map" :style="{ height: `${SCENE_HEIGHT}px`, ...backgroundStyle }">
      <div class="grid-overlay" aria-hidden="true" />
      <div class="map-frame">
        <button
          v-for="entry in locations"
          :key="entry.id"
          type="button"
          class="room"
          :class="{ 'is-transition': !!entry.location.target }"
          :style="rectStyle(entry.location)"
          :aria-label="entry.location.name"
          @click="click(entry.id)"
        >
          <span class="room-name">{{ entry.location.name }}</span>
        </button>
      </div>
      <div class="map-title">{{ site?.name }}</div>
    </div>
    <NarrationPanel :engine="engine" />
  </div>
</template>

<style scoped>
.site {
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
  background: rgba(120, 100, 80, 0.1);
  border: 1px dashed rgba(220, 200, 160, 0.45);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0.5rem;
  transition:
    background 120ms,
    border-color 120ms,
    color 120ms;
}

.room:hover {
  background: rgba(255, 200, 120, 0.15);
  border-color: var(--hot);
  color: var(--hot);
}

.room.is-transition {
  background: rgba(120, 180, 220, 0.08);
  border-style: dotted;
}

.room.is-transition:hover {
  background: rgba(160, 220, 255, 0.15);
  border-color: #9dc8ff;
  color: #9dc8ff;
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

.site > :deep(.narration) {
  height: 200px;
}
</style>

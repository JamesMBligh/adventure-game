<script setup lang="ts">
import { computed, ref } from 'vue';
import type { GameEngine } from '../../engine';
import { SCENE_HEIGHT, SCENE_WIDTH } from '../../engine/layout';
import { isUrlLike, resolveAssetUrl } from '../../engine/assets';
import type { SiteLocation, SiteLocationIcon } from '../../types';
import NarrationPanel from '../NarrationPanel.vue';

const props = defineProps<{
  engine: GameEngine;
}>();

const site = computed(() => props.engine.currentSite.value);
const locations = computed(() => props.engine.visibleLocations.value);

const backgroundStyle = computed(() => {
  const bg = site.value?.background;
  if (!bg) return { background: '#1a1722' };
  if (!isUrlLike(bg)) return { background: bg };
  return {
    backgroundImage: `url(${resolveAssetUrl(bg)})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
});

const iconUrls: Record<SiteLocationIcon, string> = {
  standard: resolveAssetUrl('main/location-icon.png'),
  left: resolveAssetUrl('main/travel-icon-left.png'),
  up: resolveAssetUrl('main/travel-icon-up.png'),
  down: resolveAssetUrl('main/travel-icon-down.png'),
  right: resolveAssetUrl('main/travel-icon-right.png'),
};

function pointStyle(loc: SiteLocation) {
  return {
    left: `${loc.x}%`,
    top: `${loc.y}%`,
  };
}

function iconFor(loc: SiteLocation): string {
  return iconUrls[loc.icon ?? 'standard'];
}

const FADE_MS = 300;
const isFading = ref(false);

async function click(id: string) {
  const loc = site.value?.locations?.[id];
  if (loc?.target) {
    isFading.value = true;
    await new Promise<void>((resolve) => setTimeout(resolve, FADE_MS));
    await props.engine.clickLocation(id);
    isFading.value = false;
  } else {
    void props.engine.clickLocation(id);
  }
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
          class="location"
          :class="{ 'is-transition': !!entry.location.target }"
          :style="pointStyle(entry.location)"
          :aria-label="entry.location.name"
          @click="click(entry.id)"
        >
          <span class="location-tooltip">{{ entry.location.name }}</span>
          <img class="location-icon" :src="iconFor(entry.location)" alt="" aria-hidden="true" />
        </button>
      </div>
      <div class="map-title">{{ site?.name }}</div>
      <div class="fade-overlay" :class="{ active: isFading }" aria-hidden="true" />
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

.location {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 56px;
  height: 56px;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: filter 120ms, transform 120ms;
}

.location-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55));
}

.location:hover,
.location:focus-visible {
  filter: drop-shadow(0 0 6px rgba(240, 192, 96, 0.6));
  transform: translate(-50%, -50%) scale(1.08);
  outline: none;
}

.location-tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  background: rgba(0, 0, 0, 0.78);
  color: var(--ink);
  font-size: 0.8rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.2rem 0.55rem;
  border: 1px solid var(--accent-dim);
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms;
}

.location:hover .location-tooltip,
.location:focus-visible .location-tooltip {
  opacity: 1;
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

.fade-overlay {
  position: absolute;
  inset: 0;
  background: #000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 300ms ease;
  z-index: 10;
}

.fade-overlay.active {
  opacity: 1;
  pointer-events: auto;
}
</style>

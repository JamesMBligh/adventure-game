<script setup lang="ts">
import { computed } from 'vue';
import type { GameEngine } from '../../engine';
import { SCENE_HEIGHT, SCENE_WIDTH } from '../../engine/layout';
import { isUrlLike, resolveAssetUrl } from '../../engine/assets';
import NarrationPanel from '../NarrationPanel.vue';

const props = defineProps<{
  engine: GameEngine;
}>();

const scene = computed(() => props.engine.currentScene.value);

const backgroundStyle = computed(() => {
  const bg = scene.value.background;
  if (!bg) return { background: '#1a1722' };
  if (!isUrlLike(bg)) return { background: bg };
  return {
    backgroundImage: `url(${resolveAssetUrl(bg)})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
});
</script>

<template>
  <div class="location" :style="{ width: `${SCENE_WIDTH}px` }">
    <div class="image" :style="{ height: `${SCENE_HEIGHT}px`, ...backgroundStyle }">
      <div class="ambient" aria-hidden="true">
        <div class="glow" />
        <div class="vignette" />
      </div>
      <div class="room-label">{{ scene.name }}</div>
    </div>
    <NarrationPanel :engine="engine" />
  </div>
</template>

<style scoped>
.location {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 0 0 auto;
}

.image {
  position: relative;
  border: 1px solid var(--accent-dim);
  overflow: hidden;
}

.ambient {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.glow {
  position: absolute;
  inset: -20%;
  background: radial-gradient(closest-side, rgba(255, 200, 120, 0.20), rgba(255, 200, 120, 0) 60%);
  filter: blur(24px);
  animation: glow-pulse 6s ease-in-out infinite;
}

.vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.55) 100%);
  animation: vignette-flicker 7.3s ease-in-out infinite;
}

@keyframes glow-pulse {
  0%, 100% { opacity: 0.55; transform: translate(-2%, -1%); }
  50% { opacity: 0.95; transform: translate(2%, 1%); }
}

@keyframes vignette-flicker {
  0%, 100% { opacity: 0.75; }
  47% { opacity: 0.55; }
  53% { opacity: 0.90; }
}

.room-label {
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

.location > :deep(.narration) {
  height: 280px;
}
</style>

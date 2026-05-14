<script setup lang="ts">
import { computed } from 'vue';
import type { GameEngine } from '../../engine';
import { SCENE_HEIGHT, SCENE_WIDTH } from '../../engine/layout';
import { isUrlLike, resolveAssetUrl } from '../../engine/assets';
import NarrationPanel from '../NarrationPanel.vue';

const props = defineProps<{
  engine: GameEngine;
}>();

const interaction = computed(() => props.engine.activeInteraction.value);
const site = computed(() => props.engine.currentSite.value);

const backgroundStyle = computed(() => {
  const bg = interaction.value?.background ?? site.value?.background;
  if (!bg) return { background: '#1a1722' };
  if (!isUrlLike(bg)) return { background: bg };
  return {
    backgroundImage: `url(${resolveAssetUrl(bg)})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
});

const animationClasses = computed(() => {
  const list = interaction.value?.animations ?? [];
  return list.map((name) => `anim-${name}`);
});

const locationLabel = computed(() => {
  const it = interaction.value;
  if (!it) return '';
  const loc = site.value?.locations?.[it.location];
  return loc?.name ?? it.location;
});
</script>

<template>
  <div class="interaction" :style="{ width: `${SCENE_WIDTH}px` }">
    <div
      class="image"
      :class="animationClasses"
      :style="{ height: `${SCENE_HEIGHT}px`, ...backgroundStyle }"
    >
      <div class="ambient" aria-hidden="true">
        <div class="layer glow" />
        <div class="layer vignette" />
        <div class="layer rain" />
        <div class="layer lamp" />
      </div>
      <div class="room-label">{{ locationLabel }}</div>
    </div>
    <NarrationPanel :engine="engine" />
  </div>
</template>

<style scoped>
.interaction {
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

.layer {
  position: absolute;
  inset: 0;
  opacity: 0;
}

.layer.glow {
  inset: -20%;
  background: radial-gradient(closest-side, rgba(255, 200, 120, 0.2), rgba(255, 200, 120, 0) 60%);
  filter: blur(24px);
}

.layer.vignette {
  background: radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.55) 100%);
}

.layer.lamp {
  background: radial-gradient(
    closest-side at 75% 35%,
    rgba(255, 190, 110, 0.35),
    rgba(255, 190, 110, 0) 70%
  );
  mix-blend-mode: screen;
}

.layer.rain {
  background-image: repeating-linear-gradient(
    105deg,
    rgba(180, 200, 220, 0.18) 0 1px,
    transparent 1px 5px
  );
  mix-blend-mode: screen;
}

.image.anim-glow-pulse .layer.glow {
  opacity: 0.7;
  animation: glow-pulse 6s ease-in-out infinite;
}
.image.anim-vignette-flicker .layer.vignette {
  opacity: 0.75;
  animation: vignette-flicker 7.3s ease-in-out infinite;
}
.image.anim-dim .layer.vignette {
  opacity: 0.9;
}
.image.anim-lamp-flicker .layer.lamp {
  opacity: 0.85;
  animation: lamp-flicker 4.5s ease-in-out infinite;
}
.image.anim-rain .layer.rain {
  opacity: 0.45;
  animation: rain-fall 1.2s linear infinite;
}

@keyframes glow-pulse {
  0%,
  100% {
    opacity: 0.55;
    transform: translate(-2%, -1%);
  }
  50% {
    opacity: 0.95;
    transform: translate(2%, 1%);
  }
}
@keyframes vignette-flicker {
  0%,
  100% {
    opacity: 0.75;
  }
  47% {
    opacity: 0.55;
  }
  53% {
    opacity: 0.9;
  }
}
@keyframes lamp-flicker {
  0%,
  100% {
    opacity: 0.8;
  }
  20% {
    opacity: 0.92;
  }
  40% {
    opacity: 0.7;
  }
  60% {
    opacity: 0.95;
  }
  80% {
    opacity: 0.78;
  }
}
@keyframes rain-fall {
  from {
    background-position: 0 0;
  }
  to {
    background-position: -40px 80px;
  }
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

.interaction > :deep(.narration) {
  height: 280px;
}
</style>

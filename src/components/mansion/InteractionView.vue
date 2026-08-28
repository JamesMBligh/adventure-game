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
  // Runtime override (set via setInteractionVisuals) takes precedence over the
  // interaction's authored background. Falls through to site background if neither
  // is set, then to the default dark fill.
  const override = props.engine.state.interactionBackgroundOverride;
  const bg = override ?? interaction.value?.background ?? site.value?.background;
  if (!bg) return { background: '#1a1722' };
  if (!isUrlLike(bg)) return { background: bg };
  return {
    backgroundImage: `url(${resolveAssetUrl(bg)})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
});

const animationClasses = computed(() => {
  const override = props.engine.state.interactionAnimationsOverride;
  const list = override ?? interaction.value?.animations ?? [];
  return list.map((name) => `anim-${name}`);
});

const overlays = computed(() => {
  const override = props.engine.state.interactionOverlaysOverride;
  const list = override ?? interaction.value?.overlays ?? [];
  // Sort by z ascending (lower behind, higher in front). Stable: equal-z
  // overlays keep their list order so `addOverlay` lands above same-z
  // siblings added earlier — matches the intuition that adding paints on top.
  // We attach the original index to each item before sorting so `Array.sort`
  // doesn't reorder equal-z entries on engines that aren't stable by spec.
  return list
    .map((o, i) => ({ o, i }))
    .sort((a, b) => (a.o.z ?? 0) - (b.o.z ?? 0) || a.i - b.i)
    .map((entry) => entry.o);
});

function overlayStyle(o: {
  rect?: { x: number; y: number; w: number; h: number };
  place?: { top: number; left: number; scale?: number };
}): Record<string, string> {
  if (o.place) {
    const scale = o.place.scale ?? 100;
    const style: Record<string, string> = {
      top: `${o.place.top}%`,
      left: `${o.place.left}%`,
      transformOrigin: 'top left',
    };
    if (scale !== 100) style.transform = `scale(${scale / 100})`;
    return style;
  }
  const r = o.rect ?? { x: 0, y: 0, w: 100, h: 100 };
  return {
    left: `${r.x}%`,
    top: `${r.y}%`,
    width: `${r.w}%`,
    height: `${r.h}%`,
  };
}

const locationLabel = computed(() => {
  const it = interaction.value;
  if (!it) return '';
  const loc = site.value?.locations?.[it.location];
  return loc?.name ?? it.location;
});

// ─── Rain drops ────────────────────────────────────────────────────────────
//
// Port of the Arickle XKjMZY pen (CodePen) — front row + back row of drops
// with stem and splat. The original generated HTML strings via jQuery; here
// we build two arrays of style descriptors and Vue v-fors them. Drops are
// generated once per component mount (component remounts on each interaction
// transition, so the random seed naturally varies between encounters).

interface RainDrop {
  idx: number;
  style: Record<string, string>;
  innerStyle: Record<string, string>;
}

function makeRain(): { front: RainDrop[]; back: RainDrop[] } {
  const front: RainDrop[] = [];
  const back: RainDrop[] = [];
  let position = 0;
  let idx = 0;
  while (position < 100) {
    const randHundo = Math.floor(Math.random() * 98) + 1; // 1..98
    const randFiver = Math.floor(Math.random() * 4) + 2; // 2..5
    position += randFiver;
    const bottom = `${randFiver * 2 - 1 + 100}%`;
    const animationDelay = `0.${randHundo}s`;
    const animationDuration = `0.5${randHundo}s`;
    const innerStyle = { animationDelay, animationDuration };
    front.push({
      idx,
      style: { left: `${position}%`, bottom, animationDelay, animationDuration },
      innerStyle,
    });
    back.push({
      idx,
      style: { right: `${position}%`, bottom, animationDelay, animationDuration },
      innerStyle,
    });
    idx++;
  }
  return { front, back };
}

const { front: frontDrops, back: backDrops } = makeRain();
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
        <div class="layer lamp" />
      </div>
      <TransitionGroup
        name="overlay-fade"
        tag="div"
        class="overlays"
        aria-hidden="true"
      >
        <img
          v-for="o in overlays"
          :key="o.id"
          class="overlay"
          :class="{ 'overlay-rect': !o.place, 'overlay-place': !!o.place }"
          :src="resolveAssetUrl(o.image)"
          :style="overlayStyle(o)"
          alt=""
        />
      </TransitionGroup>
      <div class="rain-container" aria-hidden="true">
        <div class="rain front-row">
          <div
            v-for="d in frontDrops"
            :key="`f${d.idx}`"
            class="drop"
            :style="d.style"
          >
            <div class="stem" :style="d.innerStyle" />
            <div class="splat" :style="d.innerStyle" />
          </div>
        </div>
        <div class="rain back-row">
          <div
            v-for="d in backDrops"
            :key="`b${d.idx}`"
            class="drop"
            :style="d.style"
          >
            <div class="stem" :style="d.innerStyle" />
            <div class="splat" :style="d.innerStyle" />
          </div>
        </div>
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

/* Image overlays layered between the ambient effects and the rain. Each
 * overlay covers the interaction image (cover-sized, centred). Enter/leave
 * via the `overlay-fade` Vue transition. */
.overlays {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}
.overlay {
  position: absolute;
  pointer-events: none;
  /* No max-width/height: place-mode overlays render at the image's natural
   * pixel dimensions (then `transform: scale(N)` adjusts). */
}
.overlay-rect {
  /* width/height set inline from the rect — contain preserves aspect inside it. */
  object-fit: contain;
  object-position: center;
}
.overlay-place {
  /* Natural pixel dimensions; transform-origin set inline to top-left so
   * `transform: scale(N)` grows/shrinks from the placed anchor point. */
}
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 500ms ease;
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

/* Rain — port of Arickle's "XKjMZY" CodePen, sized for the 540px interaction
 * canvas (the original was viewport-sized via `90vh`). Two rows of drops,
 * each drop = stem (falling streak) + splat (ripple). Activated by the
 * `anim-rain` class on the parent `.image`. */
.rain-container {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  opacity: 0;
  transition: opacity 200ms;
}
.image.anim-rain .rain-container {
  opacity: 1;
}

.rain {
  position: absolute;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
}
.rain.back-row {
  z-index: 1;
  bottom: 30px;
  opacity: 0.5;
}

.drop {
  position: absolute;
  bottom: 100%;
  width: 15px;
  height: 80px;
  pointer-events: none;
  animation: rain-drop 0.5s linear infinite;
}

@keyframes rain-drop {
  0% {
    transform: translateY(0);
  }
  75% {
    transform: translateY(500px);
  }
  100% {
    transform: translateY(500px);
  }
}

.stem {
  width: 1px;
  height: 60%;
  margin-left: 7px;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.25));
  animation: rain-stem 0.5s linear infinite;
}

@keyframes rain-stem {
  0% {
    opacity: 1;
  }
  65% {
    opacity: 1;
  }
  75% {
    opacity: 0;
  }
  100% {
    opacity: 0;
  }
}

.splat {
  width: 15px;
  height: 8px;
  border-top: 2px dotted rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  opacity: 1;
  transform: scale(0);
  animation: rain-splat 0.5s linear infinite;
}

@keyframes rain-splat {
  0% {
    opacity: 1;
    transform: scale(0);
  }
  80% {
    opacity: 1;
    transform: scale(0);
  }
  90% {
    opacity: 0.5;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1.5);
  }
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
  height: 260px;
}
</style>

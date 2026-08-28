<script setup lang="ts">
import { computed } from 'vue';
import type { GameEngine } from '../engine';

const props = defineProps<{ engine: GameEngine }>();

// A single Archimedean spiral, thick-stroked so the stroke width equals half
// the radial spacing between consecutive turns. The line and the gaps between
// it on adjacent turns then form perfectly alternating black/white bands —
// the classic hypnotic spiral. Rotation gives the illusion of motion toward
// or away from the centre.
const TURNS = 12;
const SEGMENTS_PER_TURN = 96;
const MAX_R = 1.5; // overflow the viewBox so the spiral covers the corners
// Half the inter-turn radial spacing → 50/50 stroke-to-gap ratio.
const STROKE_WIDTH = MAX_R / (2 * TURNS);

function spiralPath(thetaOffset: number): string {
  const points = TURNS * SEGMENTS_PER_TURN;
  const parts: string[] = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points; // 0..1
    const theta = t * TURNS * Math.PI * 2 + thetaOffset;
    const r = t * MAX_R;
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(3)} ${y.toFixed(3)}`);
  }
  return parts.join(' ');
}

const spiralArm = spiralPath(0);

const transition = computed(() => props.engine.dreamTransition.value);
const isVisible = computed(() => transition.value !== null);
const direction = computed(() => transition.value?.direction ?? null);
const phase = computed(() => transition.value?.phase ?? null);
</script>

<template>
  <Teleport to="body">
    <div
      class="dream-transition"
      :class="[
        isVisible ? 'active' : '',
        direction ? `dir-${direction}` : '',
        phase ? `phase-${phase}` : '',
      ]"
      aria-hidden="true"
    >
      <svg
        class="spiral"
        viewBox="-1 -1 2 2"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
        aria-hidden="true"
      >
        <rect class="backdrop" x="-2" y="-2" width="4" height="4" />
        <g class="spinner">
          <path :d="spiralArm" :stroke-width="STROKE_WIDTH" />
        </g>
      </svg>
    </div>
  </Teleport>
</template>

<style scoped>
/* Timing here must stay in sync with `dreamTransitionFadeMs` in engine.ts
 * (currently 350ms). The phase classes drive opacity; the engine awaits the
 * same duration before progressing to the next phase. */
.dream-transition {
  position: fixed;
  inset: 0;
  z-index: 300;
  pointer-events: none;
  opacity: 0;
  transition: opacity 350ms ease;
  overflow: hidden;
  /* Hide entirely when idle so SVG paint cost is zero between transitions. */
  visibility: hidden;
}

.dream-transition.active {
  visibility: visible;
  pointer-events: all;
}

.dream-transition.phase-in {
  opacity: 1;
}

.dream-transition.phase-hold {
  opacity: 1;
  transition: none;
}

.dream-transition.phase-out {
  opacity: 0;
}

/* Theme by direction. Stark black/white alternation in both cases — the
 * spiral's stroke equals half the inter-turn spacing, so the painted line
 * and the unpainted gap between consecutive turns form 50/50 alternating
 * bands. Reversing the colour roles between entering and exiting keeps the
 * two halves of the journey visually distinct. */
.dream-transition.dir-entering .backdrop {
  fill: #ffffff;
}
.dream-transition.dir-entering .spinner path {
  stroke: #000000;
}

.dream-transition.dir-exiting .backdrop {
  fill: #000000;
}
.dream-transition.dir-exiting .spinner path {
  stroke: #ffffff;
}

.spiral {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.spinner {
  transform-origin: 0 0;
  /* Period tuned to the new ~1.3s total visibility: at 3s/rev the spiral
   * rotates ~155° while on screen — clearly readable as motion without
   * feeling frantic. */
  animation: dream-spin 3s linear infinite;
}

.spinner path {
  fill: none;
  /* stroke-width is bound on the element from a script constant so the math
   * stays in one place. The line caps / joins are round so the inner end of
   * the spiral tapers cleanly into the centre. */
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Exiting spins the other way so the two halves of the journey feel distinct. */
.dream-transition.dir-exiting .spinner {
  animation-direction: reverse;
  animation-duration: 2.5s;
}

@keyframes dream-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Respect reduced-motion: still cover the cut with the same backdrop and
 * (static) spiral, just don't rotate. The fade in/out is gentle enough to
 * keep without flagging as motion-sensitive content. */
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>

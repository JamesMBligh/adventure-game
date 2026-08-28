<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { GameEngine } from '../engine/engine';
import {
  effectiveHit,
  evaluateCondition,
  pointInEllipse,
  pointInPolygon,
  runActions,
  type HitShape,
} from '../engine';
import { SCENE_HEIGHT, SCENE_WIDTH } from '../engine/layout';
import { isUrlLike, resolveAssetUrl } from '../engine/assets';
import type { SceneObject, SceneObjectMenuItem } from '../types';
import SceneObjectView from './SceneObjectView.vue';
import SceneObjectDisplay from './SceneObjectDisplay.vue';

const props = defineProps<{
  engine: GameEngine;
}>();

const scene = computed(() => props.engine.currentScene.value);
const objects = computed(() => props.engine.visibleObjects.value);

const backgroundStyle = computed(() => {
  const bg = scene.value?.background;
  if (!bg) return { background: '#1a1722' };
  if (!isUrlLike(bg)) return { background: bg };
  return {
    backgroundImage: `url(${resolveAssetUrl(bg)})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
});

// ---------------------------------------------------------------------------
// Two-layer render: display siblings (no interaction) + hit siblings (buttons)
// ---------------------------------------------------------------------------

interface HitEntry {
  object: SceneObject;
  shape: HitShape;
}

// Display layer: any object whose display block is set (either rect or place
// mode). SceneObjectDisplay decides its own positioning from the block.
const displayObjects = computed<SceneObject[]>(() => {
  return objects.value.filter((o) => !!o.display);
});

const hitEntries = computed<HitEntry[]>(() => {
  const out: HitEntry[] = [];
  for (const obj of objects.value) {
    const shape = effectiveHit(obj);
    if (shape) out.push({ object: obj, shape });
  }
  return out;
});

// ---------------------------------------------------------------------------
// Cursor tracking + hover state (geometry-driven)
//
// Hit-test the cursor against each visible object's effective hit rect on
// every mousemove. This guarantees the tooltip clears the instant the cursor
// crosses out of the rect, without relying on per-button mouseenter/leave.
// ---------------------------------------------------------------------------

const sceneEl = ref<HTMLDivElement | null>(null);
const cursor = ref({ x: 0, y: 0 });
const hoveredObject = ref<SceneObject | null>(null);

function findObjectAtCursor(x: number, y: number): SceneObject | null {
  const xPct = (x / SCENE_WIDTH) * 100;
  const yPct = (y / SCENE_HEIGHT) * 100;
  const entries = hitEntries.value;
  // Walk back-to-front so the visually topmost object wins overlaps.
  for (let i = entries.length - 1; i >= 0; i--) {
    const { object, shape } = entries[i];
    if (shape.kind === 'rect') {
      const r = shape.rect;
      if (xPct >= r.x && xPct <= r.x + r.w && yPct >= r.y && yPct <= r.y + r.h) {
        return object;
      }
    } else if (shape.kind === 'path') {
      // Precise point-in-polygon against the resolved polygon vertices.
      if (pointInPolygon({ x: xPct, y: yPct }, shape.points)) {
        return object;
      }
    } else {
      // ellipsis: point-in-ellipse against the inscribed-rect bounds.
      if (pointInEllipse({ x: xPct, y: yPct }, shape.rect)) {
        return object;
      }
    }
  }
  return null;
}

function onMouseMove(e: MouseEvent) {
  if (!sceneEl.value) return;
  const rect = sceneEl.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  cursor.value = { x, y };
  const next = findObjectAtCursor(x, y);
  if (next !== hoveredObject.value) hoveredObject.value = next;
}

function onSceneLeave() {
  hoveredObject.value = null;
}

// Fire `onHover` triggers when the hovered object changes.
watch(hoveredObject, (next, prev) => {
  if (next && next !== prev) {
    void props.engine.fireTrigger(next, 'onHover');
  }
});

// The tooltip appears just above the cursor, clamped to the scene canvas.
const TOOLTIP_OFFSET_Y = 18;
const tooltipStyle = computed(() => {
  const x = clamp(cursor.value.x, 8, SCENE_WIDTH - 8);
  const y = Math.max(8, cursor.value.y - TOOLTIP_OFFSET_Y);
  return { left: `${x}px`, top: `${y}px` };
});

const tooltipVisible = computed(
  () => hoveredObject.value !== null && !!hoveredObject.value.name && menuObject.value === null,
);
const tooltipText = computed(() => hoveredObject.value?.name ?? '');

// ---------------------------------------------------------------------------
// Click menu
// ---------------------------------------------------------------------------

const menuObject = ref<SceneObject | null>(null);
const menuPosition = ref({ x: 0, y: 0 });

const activeMenuItems = computed<SceneObjectMenuItem[]>(() => {
  const obj = menuObject.value;
  if (!obj?.menu) return [];
  return obj.menu.filter((item) =>
    evaluateCondition(item.visibleIf, { engine: props.engine, object: obj }),
  );
});

const MENU_WIDTH_ESTIMATE = 200;
const MENU_HEIGHT_ESTIMATE = 36;

const menuStyle = computed(() => {
  const x = menuPosition.value.x;
  const y = menuPosition.value.y;
  const w = MENU_WIDTH_ESTIMATE;
  const h = MENU_HEIGHT_ESTIMATE * Math.max(1, activeMenuItems.value.length);
  const left = Math.min(x, SCENE_WIDTH - w - 8);
  const top = Math.min(y, SCENE_HEIGHT - h - 8);
  return { left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` };
});

function openMenuFor(obj: SceneObject) {
  menuPosition.value = { ...cursor.value };
  menuObject.value = obj;
  hoveredObject.value = null;
}

function closeMenu() {
  menuObject.value = null;
}

async function pickMenuItem(item: SceneObjectMenuItem) {
  const obj = menuObject.value;
  closeMenu();
  if (!obj) return;
  await runActions(item.actions, { engine: props.engine, object: obj, trigger: 'menu' });
}

function onObjectClick(obj: SceneObject) {
  const items = (obj.menu ?? []).filter((item) =>
    evaluateCondition(item.visibleIf, { engine: props.engine, object: obj }),
  );
  if (items.length > 0) {
    openMenuFor(obj);
    return;
  }
  void props.engine.fireTrigger(obj, 'onClick');
}

function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && menuObject.value !== null) {
    e.preventDefault();
    closeMenu();
  }
}

onMounted(() => window.addEventListener('keydown', handleEscape));
onUnmounted(() => window.removeEventListener('keydown', handleEscape));

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
</script>

<template>
  <div
    ref="sceneEl"
    class="scene"
    :style="{ width: `${SCENE_WIDTH}px`, height: `${SCENE_HEIGHT}px`, ...backgroundStyle }"
    @mousemove="onMouseMove"
    @mouseleave="onSceneLeave"
  >
    <div class="scene-frame">
      <!-- Display layer: paints visuals, no interaction. The component picks
           between rect-mode and place-mode positioning from the object's
           display block. -->
      <SceneObjectDisplay
        v-for="obj in displayObjects"
        :key="`d-${obj.id}`"
        :object="obj"
      />
      <!-- Hit layer: transparent buttons that catch clicks. The shape may be
           a rect or a polygon path — SceneObjectView handles both. -->
      <SceneObjectView
        v-for="entry in hitEntries"
        :key="`h-${entry.object.id}`"
        :object="entry.object"
        :shape="entry.shape"
        @click="onObjectClick"
      />
    </div>

    <div
      v-if="tooltipVisible"
      class="object-tooltip"
      :style="tooltipStyle"
      aria-hidden="true"
    >
      {{ tooltipText }}
    </div>

    <template v-if="menuObject !== null">
      <div class="menu-backdrop" @click="closeMenu" />
      <div
        class="object-menu"
        :style="menuStyle"
        role="menu"
        :aria-label="`Actions for ${menuObject.name ?? menuObject.id}`"
      >
        <button
          v-for="(item, i) in activeMenuItems"
          :key="item.label + i"
          type="button"
          role="menuitem"
          class="menu-item"
          @click.stop="pickMenuItem(item)"
        >
          {{ item.label }}
        </button>
      </div>
    </template>

    <div class="scene-title">{{ scene?.name }}</div>
  </div>
</template>

<style scoped>
.scene {
  position: relative;
  flex: 0 0 auto;
  background-color: #1a1722;
  border: 1px solid var(--accent-dim);
  overflow: hidden;
}

.scene-frame {
  position: absolute;
  inset: 0;
}

.scene-title {
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

.object-tooltip {
  position: absolute;
  transform: translate(-50%, -100%);
  background: rgba(0, 0, 0, 0.82);
  color: var(--ink);
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  padding: 0.2rem 0.55rem;
  border: 1px solid var(--accent-dim);
  pointer-events: none;
  white-space: nowrap;
  z-index: 40;
}

.menu-backdrop {
  position: absolute;
  inset: 0;
  background: transparent;
  z-index: 45;
  cursor: default;
}

.object-menu {
  position: absolute;
  z-index: 50;
  min-width: 160px;
  background: var(--panel);
  border: 1px solid var(--accent-dim);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  padding: 0.2rem 0;
}

.menu-item {
  background: transparent;
  border: none;
  color: var(--ink);
  text-align: left;
  padding: 0.45rem 0.85rem;
  font-size: 0.9rem;
  cursor: pointer;
  font-family: inherit;
}

.menu-item:hover,
.menu-item:focus-visible {
  background: rgba(255, 255, 255, 0.06);
  color: var(--hot);
  outline: none;
}
</style>

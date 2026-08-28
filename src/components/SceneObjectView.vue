<script setup lang="ts">
import { computed } from 'vue';
import type { HitShape } from '../engine';
import type { SceneObject } from '../types';

const props = defineProps<{
  object: SceneObject;
  /** Resolved hit region — rect, polygon path, or ellipse. */
  shape: HitShape;
}>();

defineEmits<{
  (e: 'click', object: SceneObject): void;
}>();

// The button is always positioned at the bounding box of the hit shape.
// For rect / ellipsis that IS the rect. For path-mode it's the polygon's
// bbox, and a `clip-path: polygon(...)` further restricts clicks to inside
// the polygon. For ellipse-mode a `clip-path: ellipse(...)` does the same.
const bbox = computed(() => {
  const s = props.shape;
  if (s.kind === 'rect') return s.rect;
  if (s.kind === 'path') return s.bbox;
  return s.rect; // ellipsis
});

const isPath = computed(() => props.shape.kind === 'path');
const isEllipsis = computed(() => props.shape.kind === 'ellipsis');

const bboxStyle = computed(() => ({
  left: `${bbox.value.x}%`,
  top: `${bbox.value.y}%`,
  width: `${bbox.value.w}%`,
  height: `${bbox.value.h}%`,
}));

// CSS `clip-path` for non-rectangular shapes. Coordinates are converted from
// scene-absolute % to %-of-bounding-box so clip-path tracks the button's
// local box. Without clip-path, the button would catch clicks anywhere in
// the bbox — including outside the actual shape.
const clipPath = computed(() => {
  const s = props.shape;
  if (s.kind === 'path') {
    const b = s.bbox;
    const parts = s.points.map((p) => {
      const px = b.w === 0 ? 0 : ((p.x - b.x) / b.w) * 100;
      const py = b.h === 0 ? 0 : ((p.y - b.y) / b.h) * 100;
      return `${px.toFixed(3)}% ${py.toFixed(3)}%`;
    });
    return `polygon(${parts.join(', ')})`;
  }
  if (s.kind === 'ellipsis') {
    // The ellipse fills its bounding box → centre 50%, radii 50%.
    return 'ellipse(50% 50% at 50% 50%)';
  }
  return undefined;
});

// SVG-points string for the polygon outline overlay (in viewBox 0..100 space,
// same conversion as clip-path). Empty for non-path modes.
const svgPolygonPoints = computed(() => {
  if (props.shape.kind !== 'path') return '';
  const b = props.shape.bbox;
  return props.shape.points
    .map((p) => {
      const px = b.w === 0 ? 0 : ((p.x - b.x) / b.w) * 100;
      const py = b.h === 0 ? 0 : ((p.y - b.y) / b.h) * 100;
      return `${px.toFixed(3)},${py.toFixed(3)}`;
    })
    .join(' ');
});

const buttonStyle = computed(() => {
  const style: Record<string, string> = { ...bboxStyle.value };
  if (clipPath.value) style.clipPath = clipPath.value;
  return style;
});

// An object is interactive (and gets a pointer cursor) if it has either a
// menu OR onClick triggers. Authoring intent — the visibility of individual
// menu items is decided in the parent at click time.
const interactive = computed(() => {
  if ((props.object.menu?.length ?? 0) > 0) return true;
  if ((props.object.triggers?.onClick?.length ?? 0) > 0) return true;
  return false;
});

const highlighted = computed(() => props.object.hit?.highlight === true);
// For rect-mode highlight we use a CSS outline (already on the button). For
// non-rectangular shapes (path, ellipsis) the boundary is not axis-aligned,
// so we render an SVG sibling stroked along the shape.
const showShapeOutline = computed(
  () => highlighted.value && (isPath.value || isEllipsis.value),
);
</script>

<template>
  <button
    class="scene-object"
    :class="{
      clickable: interactive,
      highlighted: highlighted && !isPath && !isEllipsis,
    }"
    :style="buttonStyle"
    :aria-label="object.name ?? object.id"
    type="button"
    @click="$emit('click', object)"
  />
  <svg
    v-if="showShapeOutline"
    class="hit-shape-outline"
    :style="bboxStyle"
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <polygon
      v-if="isPath"
      :points="svgPolygonPoints"
      fill="none"
      stroke="var(--hot)"
      stroke-width="1"
      stroke-dasharray="3 2"
      vector-effect="non-scaling-stroke"
    />
    <ellipse
      v-else-if="isEllipsis"
      cx="50"
      cy="50"
      rx="50"
      ry="50"
      fill="none"
      stroke="var(--hot)"
      stroke-width="1"
      stroke-dasharray="3 2"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>

<style scoped>
.scene-object {
  position: absolute;
  background: transparent;
  border: none;
  padding: 0;
  cursor: default;
  /* Transparent click-catcher. The visual lives in a sibling
   * SceneObjectDisplay element positioned at the display rect. */
}

.scene-object.clickable {
  cursor: pointer;
}

.scene-object:focus-visible {
  outline: 2px solid var(--hot);
  outline-offset: 2px;
}

/* Rect-mode `hit.highlight: true` — always-on dashed boundary via CSS outline. */
.scene-object.highlighted {
  outline: 2px dashed var(--hot);
  outline-offset: 3px;
}

/* Non-rect highlight (path / ellipsis) — SVG sibling renders the shape's
 * outline. Pointer events disabled so clicks pass through to the button
 * beneath (which has its own clip-path restricting the click area to the
 * shape interior). Stroke uses `vector-effect="non-scaling-stroke"` so it
 * stays a constant pixel width regardless of how the viewBox is stretched
 * to fit the bounding box. */
.hit-shape-outline {
  position: absolute;
  pointer-events: none;
  overflow: visible;
}
</style>

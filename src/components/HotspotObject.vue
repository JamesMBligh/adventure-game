<script setup lang="ts">
import { computed } from 'vue';
import { getImageNaturalSize, resolveAssetUrl } from '../engine/assets';
import type { SceneObject } from '../types';

const props = defineProps<{
  object: SceneObject;
}>();

const hotspotStyle = computed(() =>
  props.object.display?.color ? { background: props.object.display.color } : undefined,
);

const imageSrc = computed(() =>
  props.object.display?.image ? resolveAssetUrl(props.object.display.image) : undefined,
);

const hasImage = computed(() => !!props.object.display?.image);

// Place-mode: parent SceneObjectDisplay container has no explicit size and
// is transform-scaled. The image must render at natural pixel dimensions so
// the scale math works out — no width: 100% / object-fit fill.
const isPlace = computed(() => !!props.object.display?.place);

// SVGs authored with only a `viewBox` (no `width`/`height` attributes) have
// no intrinsic pixel size when loaded via <img>, so browsers fall back to
// 300×150 — usually wrong for place-mode rendering. The asset loader
// pre-parses authored SVGs and `getImageNaturalSize` returns the resolved
// dimensions; we apply them as explicit width/height in place-mode so the
// SVG renders at its viewBox size before the parent's `transform: scale(N)`
// is applied. Raster images (PNG/WebP/etc.) carry their own intrinsic size
// and don't need this — `getImageNaturalSize` returns null for them.
const placeNaturalSize = computed(() => {
  if (!isPlace.value) return null;
  const img = props.object.display?.image;
  if (!img) return null;
  return getImageNaturalSize(img);
});

const imageStyle = computed(() => {
  const ns = placeNaturalSize.value;
  if (!ns) return undefined;
  return { width: `${ns.width}px`, height: `${ns.height}px` };
});
</script>

<template>
  <div
    class="hotspot"
    :class="{ 'has-image': hasImage, 'place-mode': isPlace }"
    :style="hotspotStyle"
  >
    <img v-if="imageSrc" :src="imageSrc" :alt="object.name ?? object.id" :style="imageStyle" />
  </div>
</template>

<style scoped>
.hotspot {
  width: 100%;
  height: 100%;
  background: transparent;
}

.hotspot img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

/* Place-mode: render at natural pixel dimensions so the parent's
 * `transform: scale(N)` is what controls final size. For SVGs we hand an
 * explicit `style="width: …; height: …"` from script via `getImageNaturalSize`
 * so the SVG's viewBox is the natural size — otherwise the browser would
 * fall back to its replaced-element default (~300×150). Raster images come
 * with their own intrinsic dimensions and the `width: auto; height: auto`
 * fallback below handles them. */
.hotspot.place-mode {
  width: auto;
  height: auto;
}

.hotspot.place-mode img {
  width: auto;
  height: auto;
  object-fit: initial;
}
</style>

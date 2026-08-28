<script setup lang="ts">
import { computed, markRaw } from 'vue';
import type { Component } from 'vue';
import type { SceneObject } from '../types';
import { effectiveDisplayPlace, effectiveDisplayRect } from '../engine/sceneObjects';
import { objectComponentRegistry } from '../engine/registry';
import HotspotObject from './HotspotObject.vue';

const props = defineProps<{ object: SceneObject }>();

// Compute positioning from the object's display block. Mutually exclusive
// modes — the validator rejects both being set.
const rectResolved = computed(() => effectiveDisplayRect(props.object));
const placeResolved = computed(() => effectiveDisplayPlace(props.object));

const rectStyle = computed(() => {
  const r = rectResolved.value;
  if (!r) return undefined;
  return {
    left: `${r.x}%`,
    top: `${r.y}%`,
    width: `${r.w}%`,
    height: `${r.h}%`,
  };
});

const placeStyle = computed(() => {
  const p = placeResolved.value;
  if (!p) return undefined;
  const style: Record<string, string> = {
    left: `${p.left}%`,
    top: `${p.top}%`,
    transformOrigin: 'top left',
  };
  if (p.scale !== 100) style.transform = `scale(${p.scale / 100})`;
  return style;
});

const objectComponent = computed<Component>(() => {
  const type = props.object.type ?? 'hotspot';
  const registered = objectComponentRegistry.get(type);
  return registered ?? markRaw(HotspotObject);
});
</script>

<template>
  <div
    v-if="rectStyle"
    class="scene-object-display rect-mode"
    :style="rectStyle"
    aria-hidden="true"
  >
    <component :is="objectComponent" :object="object" />
  </div>
  <div
    v-else-if="placeStyle"
    class="scene-object-display place-mode"
    :style="placeStyle"
    aria-hidden="true"
  >
    <component :is="objectComponent" :object="object" />
  </div>
</template>

<style scoped>
.scene-object-display {
  position: absolute;
  pointer-events: none;
}

.scene-object-display.place-mode {
  /* No width/height — the image inside renders at natural pixel dimensions
   * and `transform: scale(N)` from the inline style grows/shrinks it from
   * the placed anchor point. Mirrors the mansion overlay `.overlay-place`. */
}
</style>

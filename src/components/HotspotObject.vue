<script setup lang="ts">
import { computed } from 'vue';
import { resolveAssetUrl } from '../engine/assets';
import type { SceneObject } from '../types';

const props = defineProps<{
  object: SceneObject;
}>();

const hotspotStyle = computed(() =>
  props.object.color ? { background: props.object.color } : undefined,
);

const imageSrc = computed(() =>
  props.object.image ? resolveAssetUrl(props.object.image) : undefined,
);
</script>

<template>
  <div class="hotspot" :class="{ 'has-image': !!object.image }" :style="hotspotStyle">
    <img v-if="imageSrc" :src="imageSrc" :alt="object.name ?? object.id" />
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
</style>

<script setup lang="ts">
import { computed } from 'vue';
import type { GameEngine } from '../../engine';
import LocationView from './LocationView.vue';
import FloorplanView from './FloorplanView.vue';

const props = defineProps<{
  engine: GameEngine;
}>();

const kind = computed(() => props.engine.currentScene.value.kind);
</script>

<template>
  <FloorplanView v-if="kind === 'floorplan'" :engine="engine" />
  <LocationView v-else :engine="engine" />
</template>

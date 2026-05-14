<script setup lang="ts">
import { computed } from 'vue';
import type { GameEngine } from '../../engine';
import InteractionView from './InteractionView.vue';
import SiteView from './SiteView.vue';

const props = defineProps<{
  engine: GameEngine;
}>();

const inInteraction = computed(() => props.engine.state.activeInteractionId !== null);
</script>

<template>
  <InteractionView v-if="inInteraction" :engine="engine" />
  <SiteView v-else :engine="engine" />
</template>

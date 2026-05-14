<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue';
import type { Adventure } from '../types';
import { GameEngine, ensureBuiltInsRegistered, attachAutosave, type SavedGame } from '../engine';
import { SCENE_WIDTH } from '../engine/layout';
import SceneView from './SceneView.vue';
import NarrationPanel from './NarrationPanel.vue';
import SidePanel from './SidePanel.vue';
import MansionView from './mansion/MansionView.vue';

const props = defineProps<{
  adventure: Adventure;
  adventureId: string;
  resumeFrom?: SavedGame | null;
}>();

defineEmits<{
  (e: 'exit'): void;
}>();

ensureBuiltInsRegistered();

const engine = shallowRef<GameEngine>(new GameEngine(props.adventure));
attachAutosave(engine.value, props.adventureId);

onMounted(async () => {
  if (props.resumeFrom && engine.value.restore(props.resumeFrom.snapshot)) {
    // Resume: state is restored; persist hook re-armed by attachAutosave already.
    return;
  }
  await engine.value.start();
});

const scene = computed(() => engine.value.currentScene.value);
const isDream = computed(() => scene.value.kind === 'dream');
const isMansion = computed(() => {
  const k = scene.value.kind;
  return k === 'location' || k === 'floorplan';
});
const activePatient = computed(() => {
  const id = engine.value.state.activePatientId;
  if (!id) return null;
  return props.adventure.patients?.[id] ?? null;
});
const sessionsCompleted = computed(() => {
  const id = engine.value.state.activePatientId;
  if (!id) return 0;
  return engine.value.state.patientState[id]?.sessionsCompleted ?? 0;
});

const headerTitle = computed(() => {
  if (isDream.value && activePatient.value) {
    const lastName = activePatient.value.name.split(/\s+/).pop() ?? activePatient.value.name;
    return `${lastName} — Session ${sessionsCompleted.value}`;
  }
  return scene.value.name ?? props.adventure.title;
});

const sceneColStyle = { width: `${SCENE_WIDTH}px` };
</script>

<template>
  <div class="game" :class="{ 'mode-dream': isDream }">
    <header class="game-header">
      <button class="back" type="button" aria-label="Back to menu" @click="$emit('exit')">
        ← Menu
      </button>
      <h1>{{ headerTitle }}</h1>
      <span v-if="isDream" class="mode-tag" aria-label="Inside a dream">in-dream</span>
      <span v-else-if="adventure.author" class="author">by {{ adventure.author }}</span>
    </header>

    <div class="stage">
      <MansionView v-if="isMansion" :engine="engine" />
      <template v-else>
        <div class="scene-column" :style="sceneColStyle">
          <SceneView :engine="engine" />
          <NarrationPanel :engine="engine" />
        </div>
        <SidePanel :engine="engine" :hide-case-files="isDream" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.game {
  margin: 0 auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: max-content;
}

.game-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.back {
  align-self: center;
  font-size: 0.85rem;
  padding: 0.25rem 0.6rem;
}

.game-header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--hot);
  letter-spacing: 0.04em;
}

.author {
  color: var(--ink-dim);
  font-size: 0.9rem;
}

.mode-tag {
  color: #b6a8d6;
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  border: 1px solid #6a5d8a;
  padding: 0.05rem 0.4rem;
}

.stage {
  display: flex;
  align-items: stretch;
  gap: 0.75rem;
}

.scene-column {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 0 0 auto;
}

.scene-column > :deep(.narration) {
  height: 280px;
}

.mode-dream :deep(.narration .line.kind-narration) {
  color: #d6c9f0;
}

.mode-dream :deep(.scene) {
  box-shadow: inset 0 0 80px rgba(110, 90, 160, 0.25);
}
</style>

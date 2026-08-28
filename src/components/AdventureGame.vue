<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import type { Adventure } from '../types';
import { GameEngine, ensureBuiltInsRegistered, attachAutosave, type SavedGame } from '../engine';
import { SCENE_WIDTH } from '../engine/layout';
import SceneView from './SceneView.vue';
import NarrationPanel from './NarrationPanel.vue';
import SidePanel from './SidePanel.vue';
import CaseFilesModal from './CaseFilesModal.vue';
import DreamTransition from './DreamTransition.vue';
import MansionView from './mansion/MansionView.vue';

const props = defineProps<{
  adventure: Adventure;
  adventureId: string;
  resumeFrom?: SavedGame | null;
  /** When true, the autosave hook is not attached — used for throwaway
   *  debug-profile sessions so they don't clobber a real save. */
  noAutosave?: boolean;
}>();

defineEmits<{
  (e: 'exit'): void;
}>();

ensureBuiltInsRegistered();

const engine = shallowRef<GameEngine>(new GameEngine(props.adventure));
if (!props.noAutosave) {
  attachAutosave(engine.value, props.adventureId);
}

// Restore synchronously in setup (not in onMounted) so the narration log is
// already populated when NarrationPanel mounts — its onMounted then marks all
// existing entries as fully revealed, skipping the word-by-word animation
// for restored history. Otherwise the entries arrive after NarrationPanel's
// mount and get fed to the reveal loop instead.
const resumed =
  props.resumeFrom !== null &&
  props.resumeFrom !== undefined &&
  engine.value.restore(props.resumeFrom.snapshot);

onMounted(async () => {
  if (resumed) return;
  await engine.value.start();
});

const scene = computed(() => engine.value.currentScene.value);
const site = computed(() => engine.value.currentSite.value);
const interaction = computed(() => engine.value.activeInteraction.value);
const isMansion = computed(
  () =>
    engine.value.state.currentSiteId !== null || engine.value.state.activeInteractionId !== null,
);
const isDream = computed(() => !isMansion.value && scene.value?.kind === 'dream');
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
  if (interaction.value) {
    const loc = site.value?.locations?.[interaction.value.location];
    return loc?.name ?? site.value?.name ?? props.adventure.title;
  }
  if (site.value) {
    return site.value.name ?? props.adventure.title;
  }
  return scene.value?.name ?? props.adventure.title;
});

const sceneColStyle = { width: `${SCENE_WIDTH}px` };

const caseModalOpen = ref(false);
const hasAvailableCases = computed(
  () => engine.value.availableCaseFiles.value.length > 0,
);

// "Click to continue" handling: when the `wait` action is suspended, the
// engine sets continueWaitId. We capture clicks via a transparent overlay
// (so clicks don't double-fire on underlying scene objects / location markers)
// and keyboard input via a document listener (any key continues).
const isWaitingForContinue = computed(() => engine.value.continueWaitId.value !== null);

function continueWait() {
  engine.value.continueWait();
}

function handleKey(e: KeyboardEvent) {
  // While waiting for the player to dismiss a `wait` prompt, ANY key advances.
  if (isWaitingForContinue.value) {
    engine.value.continueWait();
    return;
  }
  // Spacebar otherwise → skip the current text reveal (both the UI animation
  // and the engine's awaitTextReveal timer).
  if (e.code !== 'Space') return;
  // Don't hijack space when a button, link, or input has focus — the player is
  // likely about to activate it.
  const target = e.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === 'BUTTON' ||
      target.tagName === 'A' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable)
  ) {
    return;
  }
  e.preventDefault(); // suppress page-scroll behaviour
  engine.value.skipReveal();
}

onMounted(() => document.addEventListener('keydown', handleKey));
onUnmounted(() => document.removeEventListener('keydown', handleKey));
</script>

<template>
  <div class="game" :class="{ 'mode-dream': isDream }">
    <header class="game-header">
      <button class="back" type="button" aria-label="Back to menu" @click="$emit('exit')">
        ← Menu
      </button>
      <h1>{{ headerTitle }}</h1>
      <span v-if="isDream" class="mode-tag" aria-label="Inside a dream">in-dream</span>
      <button
        v-if="hasAvailableCases"
        type="button"
        class="case-files-tab"
        :aria-pressed="caseModalOpen"
        @click="caseModalOpen = !caseModalOpen"
      >
        Case Files
      </button>
    </header>

    <div class="stage">
      <MansionView v-if="isMansion" :engine="engine" />
      <template v-else>
        <div class="scene-column" :style="sceneColStyle">
          <SceneView :engine="engine" />
          <NarrationPanel :engine="engine" />
        </div>
        <SidePanel :engine="engine" />
      </template>
    </div>

    <CaseFilesModal
      :engine="engine"
      :open="caseModalOpen"
      @close="caseModalOpen = false"
    />

    <DreamTransition :engine="engine" />

    <!-- Full-viewport click trap when a `wait` action is suspended. -->
    <div
      v-if="isWaitingForContinue"
      class="continue-overlay"
      aria-hidden="true"
      @click="continueWait"
    />
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
  /* Establish a stacking context above .continue-overlay (z-index 100) so the
   * Menu button stays clickable while a `wait` is suspended. */
  position: relative;
  z-index: 101;
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

.mode-tag {
  color: #b6a8d6;
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  border: 1px solid #6a5d8a;
  padding: 0.05rem 0.4rem;
}

.case-files-tab {
  margin-left: auto;
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  background: transparent;
  border: 1px solid var(--accent-dim);
  color: var(--ink);
  padding: 0.25rem 0.75rem;
  cursor: pointer;
}

.case-files-tab:hover,
.case-files-tab[aria-pressed='true'] {
  border-color: var(--hot);
  color: var(--hot);
}

.stage {
  display: flex;
  align-items: stretch;
  gap: 0.75rem;
}

.continue-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  cursor: pointer;
  background: transparent;
}

.scene-column {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 0 0 auto;
}

.scene-column > :deep(.narration) {
  height: 260px;
}

.mode-dream :deep(.narration .line.kind-narration) {
  color: #d6c9f0;
}

.mode-dream :deep(.scene) {
  box-shadow: inset 0 0 80px rgba(110, 90, 160, 0.25);
}
</style>

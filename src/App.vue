<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import type { Adventure } from './types';
import StartPage from './components/StartPage.vue';
import AdventureGame from './components/AdventureGame.vue';
import type { AdventureCatalogEntry } from './adventures';
import type { SavedGame } from './engine';

const activeAdventure = shallowRef<Adventure | null>(null);
const activeEntry = shallowRef<AdventureCatalogEntry | null>(null);
const resumeFrom = shallowRef<SavedGame | null>(null);
const sessionKey = ref(0);

function handleStart(adventure: Adventure, entry: AdventureCatalogEntry, resume?: SavedGame) {
  activeAdventure.value = adventure;
  activeEntry.value = entry;
  resumeFrom.value = resume ?? null;
  sessionKey.value += 1;
}

function handleExit() {
  activeAdventure.value = null;
  activeEntry.value = null;
  resumeFrom.value = null;
}
</script>

<template>
  <StartPage v-if="!activeAdventure" @start="handleStart" />
  <AdventureGame
    v-else
    :key="sessionKey"
    :adventure="activeAdventure"
    :adventure-id="activeEntry?.id ?? 'unknown'"
    :resume-from="resumeFrom"
    @exit="handleExit"
  />
</template>

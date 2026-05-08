<script setup lang="ts">
import { ref, computed } from 'vue';
import { mainAdventure, adventureCatalog, type AdventureCatalogEntry } from '../adventures';
import type { Adventure } from '../types';
import {
  ensureBuiltInsRegistered,
  validateAdventure,
  formatValidationErrors,
  loadGame,
  clearSave,
  type SavedGame,
} from '../engine';

const emit = defineEmits<{
  (e: 'start', adventure: Adventure, entry: AdventureCatalogEntry, resumeFrom?: SavedGame): void;
}>();

const loadingId = ref<string | null>(null);
const error = ref<string | null>(null);
const showAbout = ref(false);

const existingSave = ref<SavedGame | null>(loadGame());
const canContinue = computed(() => existingSave.value?.adventureId === mainAdventure.id);
const savedWhen = computed(() => {
  if (!existingSave.value) return '';
  try {
    return new Date(existingSave.value.savedAt).toLocaleString();
  } catch {
    return existingSave.value.savedAt;
  }
});

const devEntries = computed(() => adventureCatalog.filter((e) => e.devOnly));

async function load(entry: AdventureCatalogEntry, resumeFrom?: SavedGame) {
  if (loadingId.value) return;
  loadingId.value = entry.id;
  error.value = null;
  try {
    const adventure = await entry.load();
    ensureBuiltInsRegistered();
    const issues = validateAdventure(adventure);
    if (issues.length > 0) {
      console.error(
        `[adventure-engine] "${entry.title}" failed validation:\n${formatValidationErrors(issues)}`,
      );
      error.value = `"${entry.title}" has ${issues.length} validation issue${issues.length === 1 ? '' : 's'}. See console for details.`;
      return;
    }
    emit('start', adventure, entry, resumeFrom);
  } catch (err) {
    console.error(err);
    error.value = `Failed to load "${entry.title}".`;
  } finally {
    loadingId.value = null;
  }
}

function newGame() {
  if (canContinue.value) {
    const ok = window.confirm(
      'A saved game exists. Starting a new game will overwrite it. Continue?',
    );
    if (!ok) return;
    clearSave();
    existingSave.value = null;
  }
  void load(mainAdventure);
}

function continueGame() {
  if (!existingSave.value) return;
  void load(mainAdventure, existingSave.value);
}
</script>

<template>
  <main class="start">
    <header class="hero">
      <h1>{{ mainAdventure.title }}</h1>
      <p class="tagline">{{ mainAdventure.description }}</p>
    </header>

    <section class="actions" aria-label="Start">
      <button
        type="button"
        class="primary"
        :disabled="loadingId !== null"
        @click="continueGame"
        v-if="canContinue"
      >
        {{ loadingId === mainAdventure.id ? 'Loading…' : 'Continue' }}
      </button>
      <button
        type="button"
        :class="{ primary: !canContinue }"
        :disabled="loadingId !== null"
        @click="newGame"
      >
        {{ loadingId === mainAdventure.id ? 'Loading…' : 'New Game' }}
      </button>
      <button
        type="button"
        class="ghost"
        :disabled="loadingId !== null"
        @click="showAbout = !showAbout"
      >
        About
      </button>
      <p v-if="canContinue" class="save-meta">Last saved {{ savedWhen }}</p>
    </section>

    <section v-if="showAbout" class="about" aria-label="About">
      <h2>About</h2>
      <p>
        A point-and-click adventure about an apprentice walking into other people's dreams. The
        protagonist, Ashley, is referred to with they/them pronouns throughout; descriptive detail
        is kept ambiguous so anyone can map themselves onto Ashley.
      </p>
      <p>
        <strong>Content note.</strong> The game deals with grief, trauma, deception, and
        institutional harm. It is not graphic, but it is not light. If you are looking for cosy,
        this is not it.
      </p>
      <p>
        Saves live in this browser's <code>localStorage</code>. There is no account, no server, and
        nothing leaves the page.
      </p>
    </section>

    <section v-if="devEntries.length > 0" class="dev" aria-label="Developer tools">
      <h3>Dev fixtures</h3>
      <ul>
        <li v-for="entry in devEntries" :key="entry.id">
          <button type="button" class="ghost" :disabled="loadingId !== null" @click="load(entry)">
            {{ entry.title }}
          </button>
          <span class="dev-desc">{{ entry.description }}</span>
        </li>
      </ul>
    </section>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </main>
</template>

<style scoped>
.start {
  max-width: 760px;
  margin: 0 auto;
  padding: 4rem 1.5rem;
}

.hero {
  text-align: center;
  margin-bottom: 2.5rem;
}

.hero h1 {
  margin: 0;
  font-size: 2.6rem;
  letter-spacing: 0.04em;
  color: var(--hot);
}

.tagline {
  color: var(--ink-dim);
  margin: 0.75rem auto 0;
  max-width: 38rem;
  line-height: 1.5;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  justify-content: center;
}

.actions button {
  min-width: 9rem;
}

.actions button.primary {
  background: var(--hot);
  color: #1a1722;
  border: none;
}

.actions button.ghost {
  background: transparent;
}

.save-meta {
  flex-basis: 100%;
  text-align: center;
  color: var(--ink-dim);
  font-size: 0.85rem;
  margin: 0.25rem 0 0;
}

.about {
  margin-top: 2.5rem;
  padding: 1.25rem 1.4rem;
  background: var(--panel);
  border: 1px solid var(--accent-dim);
  line-height: 1.55;
}

.about h2 {
  margin: 0 0 0.6rem 0;
  font-size: 1rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-dim);
}

.about p {
  margin: 0 0 0.7rem;
}

.about p:last-child {
  margin-bottom: 0;
}

.dev {
  margin-top: 2.5rem;
  padding: 1rem 1.25rem;
  border: 1px dashed var(--accent-dim);
}

.dev h3 {
  margin: 0 0 0.5rem 0;
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-dim);
}

.dev ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.dev li {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.dev-desc {
  color: var(--ink-dim);
  font-size: 0.85rem;
}

.error {
  margin-top: 1.5rem;
  text-align: center;
  color: #f08080;
}
</style>

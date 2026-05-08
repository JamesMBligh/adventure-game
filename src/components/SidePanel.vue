<script setup lang="ts">
import { computed, ref } from 'vue';
import type { GameEngine } from '../engine';
import type { PatientId, PatientStatus } from '../types';

const props = defineProps<{
  engine: GameEngine;
  /** Hide the Case Files tab, e.g. while inside a dream. */
  hideCaseFiles?: boolean;
}>();

type Tab = 'inventory' | 'cases';

const tab = ref<Tab>('inventory');
const openFileId = ref<PatientId | null>(null);

const inventoryEntries = computed(() => {
  return props.engine.state.inventory.map((id) => {
    const def = props.engine.adventure.items?.[id];
    return { id, name: def?.name ?? id, description: def?.description };
  });
});

const VISIBLE_STATUSES: PatientStatus[] = ['inResidence', 'improving', 'healed'];

const caseFiles = computed(() => {
  const patients = props.engine.adventure.patients ?? {};
  const state = props.engine.state.patientState;
  return Object.entries(patients)
    .filter(([id]) => VISIBLE_STATUSES.includes(state[id]?.status ?? 'pending'))
    .map(([id, def]) => ({
      id,
      name: def.name,
      presenting: def.presenting,
      file: def.file,
      status: state[id]?.status ?? 'pending',
      sessionsCompleted: state[id]?.sessionsCompleted ?? 0,
      notes: state[id]?.notes ?? [],
    }));
});

const openedFile = computed(() => caseFiles.value.find((c) => c.id === openFileId.value));

function statusLabel(s: PatientStatus): string {
  switch (s) {
    case 'inResidence':
      return 'in residence';
    case 'improving':
      return 'improving';
    case 'healed':
      return 'healed';
    default:
      return s;
  }
}
</script>

<template>
  <aside class="side-panel" aria-label="Side panel">
    <div class="tabs" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'inventory'"
        :class="{ active: tab === 'inventory' }"
        @click="tab = 'inventory'"
      >
        Inventory
      </button>
      <button
        v-if="!hideCaseFiles"
        type="button"
        role="tab"
        :aria-selected="tab === 'cases'"
        :class="{ active: tab === 'cases' }"
        @click="
          tab = 'cases';
          openFileId = null;
        "
      >
        Case Files
      </button>
    </div>

    <div class="panel-body">
      <div v-if="tab === 'inventory'">
        <p v-if="inventoryEntries.length === 0" class="placeholder">Nothing carried.</p>
        <ul v-else class="inventory">
          <li v-for="entry in inventoryEntries" :key="entry.id" :title="entry.description">
            <span class="item-name">{{ entry.name }}</span>
            <span v-if="entry.description" class="item-desc">{{ entry.description }}</span>
          </li>
        </ul>
      </div>

      <div v-else-if="tab === 'cases' && !hideCaseFiles">
        <p v-if="caseFiles.length === 0" class="placeholder">No active cases.</p>
        <ul v-else-if="!openedFile" class="cases">
          <li v-for="c in caseFiles" :key="c.id">
            <button type="button" class="case-row" @click="openFileId = c.id">
              <span class="case-name">{{ c.name }}</span>
              <span class="case-status">{{ statusLabel(c.status) }}</span>
              <span class="case-presenting">{{ c.presenting }}</span>
            </button>
          </li>
        </ul>

        <div v-else class="case-file">
          <button type="button" class="back-link" @click="openFileId = null">← Cases</button>
          <h4>{{ openedFile.name }}</h4>
          <p class="case-meta">
            <span>{{ statusLabel(openedFile.status) }}</span>
            <span v-if="openedFile.sessionsCompleted > 0">
              · {{ openedFile.sessionsCompleted }} session{{
                openedFile.sessionsCompleted === 1 ? '' : 's'
              }}
            </span>
          </p>
          <p class="case-presenting">{{ openedFile.presenting }}</p>
          <pre class="case-text">{{ openedFile.file }}</pre>
          <div v-if="openedFile.notes.length > 0" class="notes">
            <h5>Session notes</h5>
            <ul>
              <li v-for="n in openedFile.notes" :key="n">{{ n }}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.side-panel {
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--accent-dim);
  width: 280px;
  flex: 0 0 280px;
  min-height: 0;
}

.tabs {
  display: flex;
  border-bottom: 1px solid var(--accent-dim);
}

.tabs button {
  flex: 1 1 auto;
  background: transparent;
  border: none;
  color: var(--ink-dim);
  padding: 0.55rem 0.6rem;
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  cursor: pointer;
}

.tabs button.active {
  color: var(--hot);
  border-bottom: 2px solid var(--hot);
}

.panel-body {
  flex: 1 1 auto;
  padding: 0.75rem 0.85rem;
  overflow-y: auto;
}

.placeholder {
  margin: 0;
  color: var(--ink-dim);
  font-style: italic;
}

.inventory {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.inventory li {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.item-name {
  color: var(--ink);
}

.item-desc {
  color: var(--ink-dim);
  font-size: 0.85rem;
}

.cases {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.case-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.15rem 0.5rem;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid var(--accent-dim);
  color: var(--ink);
  padding: 0.45rem 0.55rem;
  cursor: pointer;
}

.case-row:hover {
  border-color: var(--hot);
}

.case-name {
  color: var(--hot);
  font-weight: 600;
}

.case-status {
  color: var(--ink-dim);
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.case-presenting {
  grid-column: 1 / -1;
  color: var(--ink-dim);
  font-size: 0.85rem;
  line-height: 1.4;
}

.case-file {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.back-link {
  align-self: flex-start;
  background: transparent;
  border: none;
  color: var(--ink-dim);
  font-size: 0.8rem;
  padding: 0;
  cursor: pointer;
}

.case-file h4 {
  margin: 0;
  color: var(--hot);
}

.case-meta {
  margin: 0;
  display: flex;
  gap: 0.4rem;
  color: var(--ink-dim);
  font-size: 0.8rem;
}

.case-file .case-presenting {
  margin: 0.2rem 0;
}

.case-text {
  margin: 0.4rem 0 0;
  white-space: pre-wrap;
  font-family: inherit;
  color: var(--ink);
  line-height: 1.5;
}

.notes h5 {
  margin: 0.5rem 0 0.3rem;
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-dim);
}

.notes ul {
  list-style: disc inside;
  margin: 0;
  padding: 0;
  color: var(--ink);
  font-size: 0.9rem;
}
</style>

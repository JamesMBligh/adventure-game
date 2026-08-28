<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import type { GameEngine } from '../engine';
import type { CaseFile } from '../types';
import MarkdownView from './MarkdownView.vue';

const props = defineProps<{ engine: GameEngine; open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const openCaseId = ref<string | null>(null);
const openDocId = ref<string | null>(null);

const cases = computed<CaseFile[]>(() => props.engine.availableCaseFiles.value);
const openCase = computed(() => cases.value.find((c) => c.id === openCaseId.value) ?? null);
const visibleDocs = computed(() => {
  const c = openCase.value;
  if (!c) return [];
  return c.documents.filter((d) => props.engine.isDocumentAvailable(d));
});
const openDoc = computed(() => visibleDocs.value.find((d) => d.id === openDocId.value) ?? null);
const isOpenCaseStillAvailable = computed(() => openCase.value !== null);

watch(openCaseId, (id) => {
  if (id === null) {
    openDocId.value = null;
    return;
  }
  // Auto-select the first available doc so the right pane isn't empty.
  const first = visibleDocs.value[0];
  openDocId.value = first ? first.id : null;
});

// Reset selection each time the modal opens so it starts at the case list.
watch(
  () => props.open,
  (open) => {
    if (open) {
      openCaseId.value = null;
      openDocId.value = null;
    }
  },
);

function close() {
  emit('close');
}

function selectCase(id: string) {
  openCaseId.value = id;
}

function backToList() {
  openCaseId.value = null;
}

function handleKey(e: KeyboardEvent) {
  if (props.open && e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

onMounted(() => window.addEventListener('keydown', handleKey));
onUnmounted(() => window.removeEventListener('keydown', handleKey));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="case-modal" role="dialog" aria-modal="true" @click.self="close">
      <div class="case-modal-panel">
        <button class="modal-close" type="button" aria-label="Close case files" @click="close">
          ×
        </button>
        <aside class="case-sidebar">
          <template v-if="!openCase">
            <h2 class="modal-title">Case Files</h2>
            <p v-if="cases.length === 0" class="placeholder">No active cases.</p>
            <ul v-else class="case-list">
              <li v-for="c in cases" :key="c.id">
                <button type="button" class="case-row" @click="selectCase(c.id)">
                  <span class="case-name">{{ c.label }}</span>
                  <span v-if="c.subtitle" class="case-subtitle">{{ c.subtitle }}</span>
                </button>
              </li>
            </ul>
          </template>

          <template v-else>
            <button type="button" class="back-link" @click="backToList">← All cases</button>
            <h2 class="modal-title">{{ openCase.label }}</h2>
            <p v-if="openCase.subtitle" class="case-subtitle">{{ openCase.subtitle }}</p>
            <ul v-if="visibleDocs.length > 0" class="doc-list">
              <li v-for="d in visibleDocs" :key="d.id">
                <button
                  type="button"
                  class="doc-row"
                  :class="{ active: openDocId === d.id }"
                  @click="openDocId = d.id"
                >
                  {{ d.label }}
                </button>
              </li>
            </ul>
            <p v-else class="placeholder">No documents available yet.</p>
          </template>
        </aside>

        <main class="case-content">
          <p v-if="!isOpenCaseStillAvailable && openCaseId !== null" class="placeholder">
            This case is no longer available.
          </p>
          <p v-else-if="!openCase" class="placeholder">Select a case from the list.</p>
          <p v-else-if="!openDoc" class="placeholder">Select a document.</p>
          <MarkdownView v-else :source="openDoc.content" />
        </main>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.case-modal {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(8, 6, 14, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.case-modal-panel {
  position: relative;
  display: flex;
  width: min(1100px, 95vw);
  height: min(720px, 90vh);
  background: var(--panel);
  border: 1px solid var(--accent-dim);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
}

.modal-close {
  position: absolute;
  top: 0.4rem;
  right: 0.6rem;
  background: transparent;
  border: none;
  color: var(--ink-dim);
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.2rem 0.5rem;
  z-index: 1;
}

.modal-close:hover {
  color: var(--hot);
}

.case-sidebar {
  flex: 0 0 280px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.1rem 1rem;
  border-right: 1px solid var(--accent-dim);
  overflow-y: auto;
}

.case-content {
  flex: 1 1 auto;
  padding: 1.4rem 1.6rem;
  overflow-y: auto;
}

.modal-title {
  margin: 0 0 0.5rem;
  color: var(--hot);
  font-size: 1.1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.back-link {
  align-self: flex-start;
  background: transparent;
  border: none;
  color: var(--ink-dim);
  font-size: 0.8rem;
  padding: 0;
  cursor: pointer;
  margin-bottom: 0.3rem;
}

.back-link:hover {
  color: var(--hot);
}

.placeholder {
  margin: 0;
  color: var(--ink-dim);
  font-style: italic;
}

.case-list,
.doc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.case-row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid var(--accent-dim);
  color: var(--ink);
  padding: 0.55rem 0.65rem;
  cursor: pointer;
}

.case-row:hover {
  border-color: var(--hot);
}

.case-name {
  color: var(--hot);
  font-weight: 600;
}

.case-subtitle {
  color: var(--ink-dim);
  font-size: 0.85rem;
  line-height: 1.4;
}

.doc-row {
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  color: var(--ink);
  padding: 0.4rem 0.55rem;
  cursor: pointer;
  border-left: 2px solid var(--accent-dim);
}

.doc-row:hover {
  background: rgba(255, 255, 255, 0.04);
  border-left-color: var(--hot);
}

.doc-row.active {
  background: rgba(255, 255, 255, 0.06);
  border-left-color: var(--hot);
  color: var(--hot);
}
</style>

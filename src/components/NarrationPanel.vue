<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { GameEngine } from '../engine';

const props = defineProps<{
  engine: GameEngine;
}>();

const entries = computed(() => props.engine.state.narration);
const choices = computed(() => props.engine.availableChoices.value);
const inDialog = computed(() => props.engine.state.dialogState !== null);

const scroller = ref<HTMLElement | null>(null);

watch([() => entries.value.length, () => choices.value.length], async () => {
  await nextTick();
  if (scroller.value) {
    scroller.value.scrollTop = scroller.value.scrollHeight;
  }
});

function pick(index: number) {
  void props.engine.chooseDialogOption(index);
}
</script>

<template>
  <section class="narration" aria-label="Narration log">
    <header class="narration-header">Log</header>
    <div ref="scroller" class="narration-scroll">
      <p v-for="entry in entries" :key="entry.id" class="line" :class="`kind-${entry.kind}`">
        <span v-if="entry.speaker" class="speaker">{{ entry.speaker }}:</span>
        <span class="text">{{ entry.text }}</span>
      </p>
      <p v-if="entries.length === 0 && !inDialog" class="empty">…</p>

      <ul v-if="inDialog && choices.length > 0" class="choices" aria-label="Dialog choices">
        <li v-for="(c, i) in choices" :key="i">
          <button type="button" @click="pick(i)">{{ c.text }}</button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.narration {
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--accent-dim);
  height: 100%;
  min-height: 0;
}

.narration-header {
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-dim);
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--accent-dim);
}

.narration-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0.75rem 1rem;
  scroll-behavior: smooth;
}

.line {
  margin: 0 0 0.6rem 0;
  line-height: 1.45;
}

.line.kind-system {
  color: var(--accent);
  font-style: italic;
}

.line.kind-dialog {
  color: #fff5d6;
}

.line .speaker {
  color: var(--hot);
  margin-right: 0.4rem;
  font-weight: bold;
}

.empty {
  color: var(--ink-dim);
  font-style: italic;
}

.choices {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.choices button {
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid var(--accent-dim);
  color: var(--ink);
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  line-height: 1.4;
}

.choices button:hover {
  border-color: var(--hot);
  color: var(--hot);
}
</style>

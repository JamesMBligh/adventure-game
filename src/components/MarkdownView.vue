<script setup lang="ts">
import { computed } from 'vue';
import { renderMarkdown } from './markdown';

const props = defineProps<{ source: string }>();
const html = computed(() => renderMarkdown(props.source));
</script>

<template>
  <div class="markdown" v-html="html" />
</template>

<style scoped>
.markdown {
  color: var(--ink);
  line-height: 1.55;
  font-size: 0.95rem;
}

.markdown :deep(h1) {
  font-size: 1.5rem;
  margin: 0 0 0.5rem;
  color: var(--hot);
  letter-spacing: 0.04em;
}

.markdown :deep(h2) {
  font-size: 1.2rem;
  margin: 1.2rem 0 0.4rem;
  color: var(--hot);
}

.markdown :deep(h3) {
  font-size: 1rem;
  margin: 1rem 0 0.3rem;
  color: var(--hot);
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.markdown :deep(p) {
  margin: 0 0 0.8rem;
}

.markdown :deep(ul),
.markdown :deep(ol) {
  margin: 0 0 0.8rem;
  padding-left: 1.3rem;
}

.markdown :deep(li) {
  margin: 0.15rem 0;
}

.markdown :deep(blockquote) {
  margin: 0 0 0.8rem;
  padding: 0.2rem 0.9rem;
  border-left: 2px solid var(--accent-dim);
  color: var(--ink-dim);
  font-style: italic;
}

.markdown :deep(blockquote p) {
  margin: 0.2rem 0;
}

.markdown :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
  background: rgba(255, 255, 255, 0.05);
  padding: 0 0.25rem;
  border-radius: 2px;
}

.markdown :deep(hr) {
  border: none;
  border-top: 1px solid var(--accent-dim);
  margin: 1.2rem 0;
}

.markdown :deep(strong) {
  color: var(--ink);
  font-weight: 600;
}

.markdown :deep(em) {
  font-style: italic;
}

.markdown :deep(a) {
  color: var(--hot);
  text-decoration: underline;
}

/* Fenced ``` … ``` blocks render as discussion transcripts. Speaker labels
 * (lines of the form `Name: text`) get the speaker wrapped in `.speaker` so
 * the name can be coloured / weighted separately from the speech. */
.markdown :deep(.transcript) {
  margin: 1rem 0;
  padding: 0.6rem 0.9rem;
  background: rgba(255, 255, 255, 0.04);
  border-left: 2px solid var(--accent-dim);
  font-size: 0.92rem;
}

.markdown :deep(.transcript p) {
  /* Each speaker turn is its own paragraph; give them breathing room so a
   * back-and-forth reads as a sequence of distinct statements rather than a
   * dense wall of text. */
  margin: 0.75rem 0;
}

.markdown :deep(.transcript p:first-child) {
  margin-top: 0;
}

.markdown :deep(.transcript p:last-child) {
  margin-bottom: 0;
}

.markdown :deep(.transcript .speaker) {
  color: var(--hot);
  font-weight: 600;
  margin-right: 0.35rem;
}
</style>

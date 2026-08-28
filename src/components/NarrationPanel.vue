<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { getWordRevealMs, type GameEngine } from '../engine';

const props = defineProps<{
  engine: GameEngine;
}>();

const entries = computed(() => props.engine.state.narration);
const choices = computed(() => props.engine.availableChoices.value);
const inDialog = computed(() => props.engine.state.dialogState !== null);

const scroller = ref<HTMLElement | null>(null);

// ─── Word-by-word reveal ────────────────────────────────────────────────────
//
// Each new narration entry reveals one word at a time. Entries reveal
// sequentially: when one finishes, the next pending one begins. Dialog
// choices are hidden while a reveal is in progress so the player can't
// click past prose they haven't read yet. Clicking anywhere in the log
// skips the current entry's reveal to the end.
//
// Entries already in the log when the panel mounts (i.e. after a
// transition that remounts the panel) render fully — we don't re-animate
// history.

// Shared with the engine via getWordRevealMs() — see engine.ts. Engine awaits
// the same per-word duration after pushing text so subsequent actions stay
// in lock-step with the visible reveal.
const REVEAL_MS = getWordRevealMs();

/** Per-entry word count revealed so far. Missing = not yet started. */
const revealed = ref<Record<number, number>>({});

interface WordToken {
  type: 'word';
  text: string;
  /** Index into the entry's word sequence — used to gate visibility via `revealed[id]`. */
  wordIndex: number;
}
interface NewlineToken {
  type: 'newline';
}
type Token = WordToken | NewlineToken;

/**
 * Tokenise an entry's text into a stream of word and newline tokens. Newlines
 * are preserved as standalone tokens (rendered as `<br>`), but they do NOT
 * consume a reveal tick — only words do. So engine `awaitTextReveal` timing
 * (which splits on `\s+`) stays in lock-step with the UI's word reveal.
 */
function tokenize(text: string): Token[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const tokens: Token[] = [];
  let wordIndex = 0;
  // Split into segments where runs of newlines are kept as their own segment.
  const segments = trimmed.split(/(\n+)/);
  for (const seg of segments) {
    if (!seg) continue;
    if (/^\n+$/.test(seg)) {
      for (let i = 0; i < seg.length; i++) tokens.push({ type: 'newline' });
    } else {
      const words = seg.split(/\s+/).filter(Boolean);
      for (let w = 0; w < words.length; w++) {
        const isLastInSegment = w === words.length - 1;
        tokens.push({
          type: 'word',
          text: isLastInSegment ? words[w] : `${words[w]} `,
          wordIndex: wordIndex++,
        });
      }
    }
  }
  return tokens;
}

/** Entries enriched with their token stream and total word count. */
const wordEntries = computed(() =>
  entries.value.map((e) => {
    const tokens = tokenize(e.text);
    let wordCount = 0;
    for (const t of tokens) if (t.type === 'word') wordCount++;
    return { ...e, tokens, wordCount };
  }),
);

/** First entry not yet fully revealed; null if everything is done. */
const revealing = computed(() => {
  for (const e of wordEntries.value) {
    const shown = revealed.value[e.id] ?? 0;
    if (shown < e.wordCount) return e;
  }
  return null;
});

/**
 * Choices visibility. Choices show only when the dialog is genuinely settled:
 *
 *  1) No entry is mid-reveal (`revealing === null`),
 *  2) The engine isn't parked in a `wait` action (`continueWaitId === null`), and
 *  3) The engine isn't mid-action-sequence (`actionDepth === 0`).
 *
 * Hide is instant. Show is delayed by a short debounce so we don't flicker
 * choices in/out during the microsecond gap between dialog nodes.
 *
 * Why the three gates each matter:
 * - (1) catches text revealing word-by-word.
 * - (2) catches a `wait` action — its prompt is fully revealed during the
 *   player-controlled pause, so (1) alone would let choices appear underneath
 *   the "Click to continue" overlay.
 * - (3) catches a `pause` action (or any silent action like `setFlag`,
 *   `setInteractionVisuals`) sitting between narrates — `revealing` is null
 *   during the wait but the engine is still working through the sequence.
 */
const isWaitingForContinue = computed(() => props.engine.continueWaitId.value !== null);
const isActionRunning = computed(() => props.engine.actionDepth.value > 0);
const showChoices = ref(
  revealing.value === null && !isWaitingForContinue.value && !isActionRunning.value,
);
let showChoicesTimer: ReturnType<typeof setTimeout> | null = null;
const SHOW_CHOICES_DEBOUNCE_MS = 120;

function clearShowChoicesTimer() {
  if (showChoicesTimer !== null) {
    clearTimeout(showChoicesTimer);
    showChoicesTimer = null;
  }
}

watch(
  [revealing, isWaitingForContinue, isActionRunning],
  ([r, waiting, running]) => {
    clearShowChoicesTimer();
    if (r === null && !waiting && !running) {
      showChoicesTimer = setTimeout(() => {
        showChoices.value = true;
        showChoicesTimer = null;
      }, SHOW_CHOICES_DEBOUNCE_MS);
    } else {
      // Revealing, waiting on a continue prompt, or inside an action
      // sequence — hide choices.
      showChoices.value = false;
    }
  },
);

let revealTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimer() {
  if (revealTimer !== null) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
}

function tickReveal() {
  const target = revealing.value;
  if (!target) {
    revealTimer = null;
    return;
  }
  const current = revealed.value[target.id] ?? 0;
  if (current >= target.wordCount) {
    // Entry fully revealed — chain to the next pending one immediately.
    revealTimer = null;
    tickReveal();
    return;
  }
  revealed.value[target.id] = current + 1;
  void scrollToBottom();
  revealTimer = setTimeout(tickReveal, REVEAL_MS);
}

function startReveal() {
  if (revealTimer !== null) return; // already running
  tickReveal();
}

/** Force every queued entry to fully revealed. Fired from a watcher on
 *  `engine.revealSkipTick`, which the engine bumps from `skipReveal()`. */
function completeAllReveals() {
  clearTimer();
  for (const e of wordEntries.value) {
    revealed.value[e.id] = e.wordCount;
  }
  void scrollToBottom();
}

/** Player asked to skip via panel click. Delegated to the engine so its own
 *  pending `awaitTextReveal` timer is also cancelled — otherwise the engine
 *  would still hold the action sequence for the original duration. */
function requestSkip() {
  props.engine.skipReveal();
}

// Engine notifies us (via the reactive tick) whenever a skip is requested,
// from any source (panel click, spacebar). React by completing the visual
// reveal of every queued entry.
watch(
  () => props.engine.revealSkipTick.value,
  completeAllReveals,
);

// New narration arrives → make sure the reveal loop is running.
watch(
  () => entries.value.length,
  () => {
    startReveal();
    void scrollToBottom();
  },
);

// ─── Scrolling ──────────────────────────────────────────────────────────────

async function scrollToBottom() {
  await nextTick();
  if (scroller.value) {
    scroller.value.scrollTop = scroller.value.scrollHeight;
  }
}

// On mount, mark all existing entries as fully revealed and snap to bottom.
// Covers transitions: each mansion/site/interaction/dream switch remounts
// the panel with entries already populated; we don't re-animate history,
// and a fresh mount must jump to the bottom.
// ResizeObserver on the scroller keeps the bottom pinned as the choices
// area below it expands or collapses (their height animation re-distributes
// the panel's flex layout, changing scroller.clientHeight on every frame).
// Without this, the bottom of the log would drift away mid-animation.
let scrollerObserver: ResizeObserver | null = null;

onMounted(() => {
  for (const e of wordEntries.value) {
    revealed.value[e.id] = e.wordCount;
  }
  void scrollToBottom();

  if (scroller.value && typeof ResizeObserver !== 'undefined') {
    scrollerObserver = new ResizeObserver(() => {
      if (!scroller.value) return;
      // Only re-pin if the user was already near the bottom — avoid yanking
      // them down if they've intentionally scrolled up to read history.
      const el = scroller.value;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom <= 80) {
        el.scrollTop = el.scrollHeight;
      }
    });
    scrollerObserver.observe(scroller.value);
  }
});

// Scroll when choices appear (length already-revealed entries triggers via the
// other watcher; this catches the case where choices unlock after a reveal).
watch(() => choices.value.length, scrollToBottom);
watch(showChoices, (visible) => {
  if (visible) void scrollToBottom();
});

onUnmounted(() => {
  clearTimer();
  clearShowChoicesTimer();
  scrollerObserver?.disconnect();
  scrollerObserver = null;
});

// ─── Dialog choices ─────────────────────────────────────────────────────────

function pick(index: number) {
  void props.engine.chooseDialogOption(index);
}

// Choice list expand/collapse — animate height alongside opacity. CSS can't
// transition `height: auto`, so we measure the natural scrollHeight in JS,
// animate to/from it, then clean the inline styles up after.
function choicesBeforeEnter(el: Element) {
  const e = el as HTMLElement;
  e.style.height = '0';
  e.style.opacity = '0';
  e.style.overflow = 'hidden';
}

function choicesEnter(el: Element, done: () => void) {
  const e = el as HTMLElement;
  const target = e.scrollHeight;
  // Force reflow so the browser registers the height: 0 starting state.
  void e.offsetHeight;
  e.style.transition = 'height 260ms ease-out, opacity 220ms ease-out';
  e.style.height = `${target}px`;
  e.style.opacity = '1';
  const onEnd = (ev: TransitionEvent) => {
    if (ev.target !== e || ev.propertyName !== 'height') return;
    e.removeEventListener('transitionend', onEnd);
    // Clean inline styles so subsequent layout works naturally.
    e.style.transition = '';
    e.style.height = '';
    e.style.opacity = '';
    e.style.overflow = '';
    done();
  };
  e.addEventListener('transitionend', onEnd);
}

function choicesLeave(el: Element, done: () => void) {
  const e = el as HTMLElement;
  const start = e.offsetHeight;
  e.style.height = `${start}px`;
  e.style.overflow = 'hidden';
  void e.offsetHeight;
  e.style.transition = 'height 220ms ease-in, opacity 140ms ease-in';
  e.style.height = '0';
  e.style.opacity = '0';
  const onEnd = (ev: TransitionEvent) => {
    if (ev.target !== e || ev.propertyName !== 'height') return;
    e.removeEventListener('transitionend', onEnd);
    done();
  };
  e.addEventListener('transitionend', onEnd);
}
</script>

<template>
  <section
    class="narration"
    :class="{ revealing: revealing !== null }"
    aria-label="Narration log"
    @click="requestSkip"
  >
    <div ref="scroller" class="narration-scroll">
      <p v-for="entry in wordEntries" :key="entry.id" class="line" :class="`kind-${entry.kind}`">
        <span
          v-if="entry.speaker"
          class="speaker"
          :class="{ shown: entry.wordCount === 0 || (revealed[entry.id] ?? 0) >= 1 }"
          >{{ entry.speaker }}:</span
        >
        <span class="text">
          <template v-for="(token, i) in entry.tokens" :key="i">
            <span
              v-if="token.type === 'word'"
              class="word"
              :class="{ shown: token.wordIndex < (revealed[entry.id] ?? 0) }"
              >{{ token.text }}</span
            >
            <br v-else />
          </template>
        </span>
      </p>
      <p v-if="entries.length === 0 && !inDialog" class="empty">…</p>
    </div>

    <!-- Choices live OUTSIDE the scroller so the scroll content doesn't shift
         when they appear or disappear. The scroller takes flex: 1 of the
         panel; as this area grows/shrinks below it the scroller's clientHeight
         adjusts, but its content stays anchored to its own bottom — what the
         player was just reading stays put. -->
    <Transition
      :css="false"
      @before-enter="choicesBeforeEnter"
      @enter="choicesEnter"
      @leave="choicesLeave"
    >
      <ul
        v-if="inDialog && choices.length > 0 && showChoices"
        class="choices"
        aria-label="Dialog choices"
        @click.stop
      >
        <li v-for="(c, i) in choices" :key="i">
          <button type="button" @click="pick(i)">{{ c.text }}</button>
        </li>
      </ul>
    </Transition>
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

/* Hint that the panel is clickable while text is still revealing. */
.narration.revealing {
  cursor: pointer;
}

.narration-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0.75rem 1rem;
  /* `scroll-behavior: smooth` removed deliberately. The scroll position is
   * pinned to the bottom via JS on every layout change (entries, choices
   * expanding/collapsing). Smooth scrolling would animate each tick of the
   * ResizeObserver during the choices height animation, fighting with the
   * height transition. Instant snap keeps the bottom locked in place. */
}

.line {
  margin: 0 0 0.6rem 0;
  line-height: 1.45;
}

.line.kind-system {
  color: var(--accent);
  font-style: italic;
}

.line.kind-dialog,
.line.kind-inner {
  color: #fff5d6;
}

.line .speaker {
  color: var(--hot);
  margin-right: 0.4rem;
  font-weight: bold;
  opacity: 0;
  transition: opacity 100ms ease-out;
}
.line .speaker.shown {
  opacity: 1;
}

/* Words are laid out in full from the start (so line wrapping and entry
 * height are stable) but hidden until their reveal index advances. */
.word {
  opacity: 0;
  transition: opacity 100ms ease-out;
}
.word.shown {
  opacity: 1;
}

.empty {
  color: var(--ink-dim);
  font-style: italic;
}

/* Choices are a sibling of the scroller (flex item in the panel). Padding +
 * border-top visually separate them from the scrolling log above. */
.choices {
  list-style: none;
  margin: 0;
  padding: 0.6rem 1rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 0 0 auto;
  border-top: 1px solid var(--accent-dim);
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

/* Choices enter/leave animation is JS-driven (Transition with :css="false")
 * because CSS cannot animate height: auto. See choicesEnter / choicesLeave
 * hooks in the script — they measure scrollHeight and animate height +
 * opacity together. */
</style>

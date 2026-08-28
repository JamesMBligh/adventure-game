<script setup lang="ts">
import { computed } from 'vue';
import type { GameEngine } from '../engine';

const props = defineProps<{
  engine: GameEngine;
}>();

const inventoryEntries = computed(() => {
  return props.engine.state.inventory.map((id) => {
    const def = props.engine.adventure.items?.[id];
    return { id, name: def?.name ?? id, description: def?.description };
  });
});
</script>

<template>
  <aside class="side-panel" aria-label="Inventory panel">
    <h2 class="panel-title">Inventory</h2>
    <div class="panel-body">
      <p v-if="inventoryEntries.length === 0" class="placeholder">Nothing carried.</p>
      <ul v-else class="inventory">
        <li v-for="entry in inventoryEntries" :key="entry.id" :title="entry.description">
          <span class="item-name">{{ entry.name }}</span>
          <span v-if="entry.description" class="item-desc">{{ entry.description }}</span>
        </li>
      </ul>
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

.panel-title {
  margin: 0;
  padding: 0.55rem 0.85rem;
  border-bottom: 1px solid var(--accent-dim);
  color: var(--hot);
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
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
</style>

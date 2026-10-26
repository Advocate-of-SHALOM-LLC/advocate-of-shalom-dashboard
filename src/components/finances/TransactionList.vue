<script setup lang="ts">
import { ref, computed } from 'vue';
import { Search } from 'lucide-vue-next';
import { CATEGORIES, CATEGORY_BY_KEY, UNCATEGORIZED, formatMoney, type Transaction } from '@/lib/ledger';

/**
 * The period's transactions. The category can be changed right in the list,
 * so sorting a fresh import is quick; the description opens the full editor.
 */
const props = defineProps<{ transactions: Transaction[]; filter: string }>();
const emit = defineEmits<{
  (e: 'update:filter', value: string): void;
  (e: 'edit', transaction: Transaction): void;
  (e: 'recategorize', transaction: Transaction, category: string): void;
}>();

const query = ref('');

const groups = [
  { label: 'Income', items: CATEGORIES.filter((c) => c.kind === 'income') },
  { label: 'Expenses', items: CATEGORIES.filter((c) => c.kind === 'expense') },
  { label: 'Not on the P&L', items: CATEGORIES.filter((c) => c.kind === 'excluded') },
];

const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  return props.transactions.filter(
    (t) =>
      (!props.filter || t.category === props.filter) &&
      (!q || t.description.toLowerCase().includes(q) || t.account.toLowerCase().includes(q))
  );
});

const needsCategory = computed(() => props.transactions.filter((t) => t.category === UNCATEGORIZED).length);

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
</script>

<template>
  <section class="card txns" aria-labelledby="txns-title">
    <div class="card__head">
      <h2 id="txns-title" class="card__title">Transactions</h2>
      <span class="txns__count" role="status">{{ shown.length }} of {{ transactions.length }}</span>
    </div>

    <div class="txns__filters">
      <label class="txns__search">
        <Search :size="16" aria-hidden="true" />
        <span class="sr-only">Search transactions</span>
        <input id="txn-search" v-model="query" type="search" placeholder="Search descriptions" autocomplete="off" />
      </label>
      <label class="txns__select">
        <span class="sr-only">Show</span>
        <select id="txn-filter" :value="filter" @change="emit('update:filter', ($event.target as HTMLSelectElement).value)">
          <option value="">All categories</option>
          <option :value="UNCATEGORIZED">Needs a category ({{ needsCategory }})</option>
          <optgroup v-for="group in groups" :key="group.label" :label="group.label">
            <option v-for="c in group.items.filter((c) => c.key !== UNCATEGORIZED)" :key="c.key" :value="c.key">{{ c.label }}</option>
          </optgroup>
        </select>
      </label>
    </div>

    <p v-if="!transactions.length" class="card__empty">No transactions in this period.</p>
    <p v-else-if="!shown.length" class="card__empty">Nothing matches these filters.</p>

    <div v-else class="txns__scroll">
      <table class="txns__table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Description</th>
            <th scope="col">Category</th>
            <th scope="col" class="txns__num">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in shown" :key="t.id" :class="{ 'txns__row--flag': t.category === UNCATEGORIZED }">
            <td class="txns__date">{{ formatDate(t.date) }}</td>
            <td class="txns__desc">
              <button type="button" class="txns__open" @click="emit('edit', t)">{{ t.description }}</button>
              <span v-if="t.account" class="txns__account">{{ t.account }}</span>
            </td>
            <td>
              <label class="sr-only" :for="`cat-${t.id}`">Category for {{ t.description }}</label>
              <select
                :id="`cat-${t.id}`"
                class="txns__category"
                :value="t.category"
                @change="emit('recategorize', t, ($event.target as HTMLSelectElement).value)"
              >
                <optgroup v-for="group in groups" :key="group.label" :label="group.label">
                  <option v-for="c in group.items" :key="c.key" :value="c.key">{{ c.label }}</option>
                </optgroup>
              </select>
            </td>
            <td class="txns__num" :class="t.amountCents > 0 ? 'txns__in' : ''">
              {{ t.amountCents > 0 ? '+' : '' }}{{ formatMoney(t.amountCents) }}
              <span v-if="CATEGORY_BY_KEY.get(t.category)?.key === 'transfer'" class="txns__note">not on P&amp;L</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.txns__count { font-size: 0.8125rem; color: var(--color-text-secondary); }
.txns__filters { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; }
.txns__search {
  flex: 1 1 240px; display: flex; align-items: center; gap: 0.5rem; padding: 0 0.85rem;
  border: 1px solid var(--color-border); border-radius: 999px; background-color: var(--color-bg); color: var(--color-text-secondary);
}
.txns__search:focus-within { border-color: var(--color-primary); }
.txns__search input { flex: 1; min-width: 0; padding: 0.5rem 0; border: none; background: none; font: inherit; font-size: 0.9375rem; color: var(--color-text); }
.txns__search input:focus { outline: none; }
.txns__select select,
.txns__category {
  padding: 0.45rem 0.6rem; border: 1px solid var(--color-border); border-radius: var(--border-radius);
  background-color: var(--color-bg); color: var(--color-text); font: inherit; font-size: 0.875rem;
}
.txns__select select { padding: 0.5rem 0.75rem; border-radius: 999px; }
.txns__category { width: 100%; max-width: 260px; }

.txns__scroll { overflow-x: auto; }
.txns__table { width: 100%; border-collapse: collapse; font-size: 0.9375rem; font-variant-numeric: tabular-nums; }
.txns__table th, .txns__table td { padding: 0.55rem 0.5rem; text-align: left; vertical-align: top; border-bottom: 1px solid var(--color-border); }
.txns__table thead th { font-size: 0.75rem; font-weight: 600; color: var(--color-text-secondary); }
.txns__date { white-space: nowrap; color: var(--color-text-secondary); font-size: 0.875rem; }
.txns__desc { min-width: 200px; }
.txns__open { display: block; padding: 0; border: none; background: none; font: inherit; color: var(--color-text); text-align: left; cursor: pointer; }
.txns__open:hover { color: var(--color-link); text-decoration: underline; }
.txns__account { display: block; font-size: 0.75rem; color: var(--color-text-secondary); }
.txns__num { text-align: right !important; white-space: nowrap; }
.txns__in { color: var(--color-up); }
.txns__note { display: block; font-size: 0.6875rem; color: var(--color-text-secondary); }
.txns__row--flag .txns__category { border-color: color-mix(in srgb, #d97706 60%, transparent); }
</style>

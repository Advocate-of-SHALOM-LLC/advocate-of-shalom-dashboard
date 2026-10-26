<script setup lang="ts">
import { computed } from 'vue';
import { AlertTriangle } from 'lucide-vue-next';
import { formatMoney, UNCATEGORIZED, type Pnl, type PnlLine } from '@/lib/ledger';

/**
 * The profit and loss statement for the chosen period, beside the period
 * before it. Standard layout: income by category, expenses by category,
 * net profit.
 */
const props = defineProps<{ current: Pnl; previous: Pnl; periodLabel: string; previousLabel: string }>();
const emit = defineEmits<{ (e: 'categorize'): void }>();

/** Each side's lines from both periods, so a category from either shows. */
function merge(now: PnlLine[], before: PnlLine[]) {
  const keys = [...new Set([...now.map((l) => l.key), ...before.map((l) => l.key)])];
  return keys.map((key) => {
    const a = now.find((l) => l.key === key);
    const b = before.find((l) => l.key === key);
    return { key, label: (a ?? b)!.label, now: a?.cents ?? 0, before: b?.cents ?? 0 };
  }).sort((x, y) => (x.key === UNCATEGORIZED ? 1 : y.key === UNCATEGORIZED ? -1 : 0));
}

const income = computed(() => merge(props.current.income, props.previous.income));
const expenses = computed(() => merge(props.current.expenses, props.previous.expenses));
const empty = computed(() => !income.value.length && !expenses.value.length);
</script>

<template>
  <section class="card pnl" aria-labelledby="pnl-title">
    <div class="card__head">
      <h2 id="pnl-title" class="card__title">Profit and loss</h2>
      <span class="pnl__basis">Cash basis</span>
    </div>

    <p v-if="current.uncategorizedCount" class="pnl__warn" role="note">
      <AlertTriangle :size="16" aria-hidden="true" />
      <span>
        {{ current.uncategorizedCount }} {{ current.uncategorizedCount === 1 ? 'transaction needs' : 'transactions need' }} a category.
        They're counted below but not yet in the right line.
      </span>
      <button type="button" class="pnl__fix" @click="emit('categorize')">Categorize</button>
    </p>

    <p v-if="empty" class="card__empty">No transactions in this period yet. Import a bank statement or add one by hand.</p>

    <div v-else class="pnl__scroll">
      <table class="pnl__table">
        <thead>
          <tr>
            <th scope="col"><span class="sr-only">Category</span></th>
            <th scope="col" class="pnl__num">{{ periodLabel }}</th>
            <th scope="col" class="pnl__num pnl__prev">{{ previousLabel }}</th>
          </tr>
        </thead>
        <tbody>
          <tr class="pnl__section"><th scope="rowgroup" colspan="3">Income</th></tr>
          <tr v-for="line in income" :key="`in-${line.key}`" :class="{ 'pnl__line--flag': line.key === UNCATEGORIZED }">
            <th scope="row">{{ line.label }}</th>
            <td class="pnl__num">{{ formatMoney(line.now) }}</td>
            <td class="pnl__num pnl__prev">{{ formatMoney(line.before) }}</td>
          </tr>
          <tr v-if="!income.length"><th scope="row" class="pnl__none">No income</th><td class="pnl__num">—</td><td class="pnl__num pnl__prev">—</td></tr>
          <tr class="pnl__total">
            <th scope="row">Total income</th>
            <td class="pnl__num">{{ formatMoney(current.totalIncome) }}</td>
            <td class="pnl__num pnl__prev">{{ formatMoney(previous.totalIncome) }}</td>
          </tr>

          <tr class="pnl__section"><th scope="rowgroup" colspan="3">Expenses</th></tr>
          <tr v-for="line in expenses" :key="`out-${line.key}`" :class="{ 'pnl__line--flag': line.key === UNCATEGORIZED }">
            <th scope="row">{{ line.label }}</th>
            <td class="pnl__num">{{ formatMoney(line.now) }}</td>
            <td class="pnl__num pnl__prev">{{ formatMoney(line.before) }}</td>
          </tr>
          <tr v-if="!expenses.length"><th scope="row" class="pnl__none">No expenses</th><td class="pnl__num">—</td><td class="pnl__num pnl__prev">—</td></tr>
          <tr class="pnl__total">
            <th scope="row">Total expenses</th>
            <td class="pnl__num">{{ formatMoney(current.totalExpenses) }}</td>
            <td class="pnl__num pnl__prev">{{ formatMoney(previous.totalExpenses) }}</td>
          </tr>

          <tr class="pnl__net">
            <th scope="row">{{ current.net >= 0 ? 'Net profit' : 'Net loss' }}</th>
            <td class="pnl__num" :class="current.net >= 0 ? 'pnl__up' : 'pnl__down'">{{ formatMoney(current.net) }}</td>
            <td class="pnl__num pnl__prev">{{ formatMoney(previous.net) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.pnl__basis { font-size: 0.75rem; color: var(--color-text-secondary); }
.pnl__warn {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0 0 1rem; padding: 0.65rem 0.85rem;
  border-radius: var(--border-radius); font-size: 0.875rem; color: var(--color-text);
  background-color: color-mix(in srgb, #d97706 10%, transparent); border: 1px solid color-mix(in srgb, #d97706 35%, transparent);
}
.pnl__warn svg { color: var(--color-warn); flex-shrink: 0; }
.pnl__warn span { flex: 1; min-width: 200px; }
.pnl__fix { border: none; background: none; padding: 0; font: inherit; font-weight: 600; color: var(--color-link); cursor: pointer; }
.pnl__fix:hover { text-decoration: underline; }

.pnl__scroll { overflow-x: auto; }
.pnl__table { width: 100%; border-collapse: collapse; font-size: 0.9375rem; font-variant-numeric: tabular-nums; }
.pnl__table th, .pnl__table td { padding: 0.5rem 0.5rem; text-align: left; border-bottom: 1px solid var(--color-border); }
.pnl__table thead th { font-size: 0.75rem; font-weight: 600; color: var(--color-text-secondary); }
.pnl__table tbody th { font-weight: 400; }
.pnl__num { text-align: right !important; white-space: nowrap; }
.pnl__prev { color: var(--color-text-secondary); }
.pnl__section th { padding-top: 1.1rem; font-family: var(--font-heading); font-size: 1rem; font-weight: 700; border-bottom: 2px solid var(--color-border); }
.pnl__total th, .pnl__total td { font-weight: 700; }
.pnl__net th, .pnl__net td { font-weight: 700; font-size: 1.0625rem; border-bottom: none; border-top: 2px solid var(--color-text); }
.pnl__up { color: var(--color-up); }
.pnl__down { color: var(--color-down); }
.pnl__line--flag th { color: var(--color-warn); font-style: italic; }
.pnl__none { color: var(--color-text-secondary); font-style: italic; }
</style>

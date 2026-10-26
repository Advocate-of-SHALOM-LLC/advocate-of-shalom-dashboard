<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import DashboardLayout from '@/components/layout/DashboardLayout.vue';
import { Plus, Download, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-vue-next';
import PnlStatement from '@/components/finances/PnlStatement.vue';
import TransactionList from '@/components/finances/TransactionList.vue';
import CsvImport from '@/components/finances/CsvImport.vue';
import TransactionDialog from '@/components/finances/TransactionDialog.vue';
import { useLedger, type TransactionFields } from '@/composables/useLedger';
import { CATEGORY_BY_KEY, UNCATEGORIZED, formatMoney, profitAndLoss, type Transaction } from '@/lib/ledger';
import { downloadCsv, downloadXlsx } from '@/lib/exports';
import config from '@/config/dashboard';

/**
 * Profit and loss (cash basis): import bank and card statements as CSV or
 * add transactions by hand, sort them into Schedule C categories, and see
 * income, expenses and net profit for any period. Exports to CSV and Excel.
 * Replaces the accounting side of Rocket Matter with just these parts.
 */
const { state, message, transactions, imports, layouts, load, create, update, remove, importRows, undoImport } = useLedger();

const tab = ref<'pnl' | 'transactions' | 'import'>('pnl');
const categoryFilter = ref('');
const dialog = ref<InstanceType<typeof TransactionDialog> | null>(null);
const exporting = ref(false);

// ─── Periods ────────────────────────────────────────────────────────────────

type Preset = 'this-month' | 'last-month' | 'this-quarter' | 'last-quarter' | 'ytd' | 'last-year' | 'custom';
const preset = ref<Preset>('this-month');
const customFrom = ref('');
const customTo = ref('');

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (y: number, m: number, d: number) => iso(new Date(y, m, d));
const label = (from: string, to: string) => {
  const fmt = (s: string, opts: Intl.DateTimeFormatOptions) => new Date(`${s}T12:00:00`).toLocaleDateString('en-US', opts);
  return `${fmt(from, { month: 'short', day: 'numeric', year: from.slice(0, 4) === to.slice(0, 4) ? undefined : 'numeric' })} – ${fmt(to, { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

/** The chosen period and the one before it, as inclusive YYYY-MM-DD ranges. */
const periods = computed(() => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3) * 3;
  const named = (from: string, to: string, name: string, pFrom: string, pTo: string, pName: string) => ({ from, to, name, pFrom, pTo, pName });
  const monthName = (yy: number, mm: number) => new Date(yy, mm, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  // Month index may run past either end of the year; Date rolls it over.
  const quarterName = (yy: number, mm: number) => {
    const d = new Date(yy, mm, 1);
    return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
  };
  switch (preset.value) {
    case 'this-month':
      return named(day(y, m, 1), iso(now), `${monthName(y, m)} to date`, day(y, m - 1, 1), day(y, m, 0), monthName(y, m - 1));
    case 'last-month':
      return named(day(y, m - 1, 1), day(y, m, 0), monthName(y, m - 1), day(y, m - 2, 1), day(y, m - 1, 0), monthName(y, m - 2));
    case 'this-quarter':
      return named(day(y, q, 1), iso(now), `${quarterName(y, q)} to date`, day(y, q - 3, 1), day(y, q, 0), quarterName(y, q - 3));
    case 'last-quarter':
      return named(day(y, q - 3, 1), day(y, q, 0), quarterName(y, q - 3), day(y, q - 6, 1), day(y, q - 3, 0), quarterName(y, q - 6));
    case 'ytd':
      return named(day(y, 0, 1), iso(now), `${y} to date`, day(y - 1, 0, 1), day(y - 1, m, now.getDate()), `Same period ${y - 1}`);
    case 'last-year':
      return named(day(y - 1, 0, 1), day(y - 1, 11, 31), String(y - 1), day(y - 2, 0, 1), day(y - 2, 11, 31), String(y - 2));
    case 'custom': {
      const from = customFrom.value || day(y, m, 1);
      const to = customTo.value && customTo.value >= from ? customTo.value : iso(now);
      // The same number of days immediately before.
      const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
      const pTo = new Date(`${from}T12:00:00`);
      pTo.setDate(pTo.getDate() - 1);
      const pFrom = new Date(pTo);
      pFrom.setDate(pFrom.getDate() - span);
      return named(from, to, label(from, to), iso(pFrom), iso(pTo), 'Previous period');
    }
  }
});

const current = computed(() => profitAndLoss(transactions.value, periods.value.from, periods.value.to));
const previous = computed(() => profitAndLoss(transactions.value, periods.value.pFrom, periods.value.pTo));
const inPeriod = computed(() => transactions.value.filter((t) => t.date >= periods.value.from && t.date <= periods.value.to));
const accounts = computed(() => [...new Set(transactions.value.map((t) => t.account).filter(Boolean))]);

// ─── Changes ────────────────────────────────────────────────────────────────

function onSave(id: string | null, fields: TransactionFields, done: (error?: string) => void) {
  (id ? update(id, fields) : create(fields)).then(() => done(), (err: Error) => done(err.message));
}

function onDelete(id: string, done: (error?: string) => void) {
  remove(id).then(() => done(), (err: Error) => done(err.message));
}

async function recategorize(t: Transaction, category: string) {
  try {
    await update(t.id, { date: t.date, description: t.description, amountCents: t.amountCents, category, account: t.account });
  } catch (err) {
    message.value = err instanceof Error ? err.message : 'That change could not be saved.';
  }
}

function onImport(payload: Parameters<typeof importRows>[0], done: (result: string, ok: boolean) => void) {
  importRows(payload).then(
    (r) => {
      const parts = [`${r.imported} ${r.imported === 1 ? 'transaction' : 'transactions'} added`];
      if (r.duplicates) parts.push(`${r.duplicates} already imported`);
      if (r.invalid) parts.push(`${r.invalid} couldn't be read`);
      done(`${parts.join(', ')}.${r.imported ? ' New ones are under “Needs a category” unless the payee was categorized before.' : ''}`, true);
    },
    (err: Error) => done(err.message, false)
  );
}

function showUncategorized() {
  categoryFilter.value = UNCATEGORIZED;
  tab.value = 'transactions';
}

// ─── Exports ────────────────────────────────────────────────────────────────

const fileStem = computed(() => `${config.clientName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${periods.value.from}-to-${periods.value.to}`);

const transactionRows = () =>
  inPeriod.value
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [t.date, t.description, CATEGORY_BY_KEY.get(t.category)?.label ?? t.category, t.account, t.amountCents / 100]);

function exportCsv() {
  downloadCsv(`${fileStem.value}-transactions.csv`, ['Date', 'Description', 'Category', 'Account', 'Amount'], transactionRows());
}

async function exportExcel() {
  exporting.value = true;
  try {
    const p = current.value;
    const pnlRows: (string | number | null)[][] = [
      ['Income', null],
      ...p.income.map((l) => [l.label, l.cents / 100]),
      ['Total income', p.totalIncome / 100],
      [null, null],
      ['Expenses', null],
      ...p.expenses.map((l) => [l.label, l.cents / 100]),
      ['Total expenses', p.totalExpenses / 100],
      [null, null],
      [p.net >= 0 ? 'Net profit' : 'Net loss', p.net / 100],
    ];
    const bold = pnlRows.map((r, i) => (['Income', 'Expenses', 'Total income', 'Total expenses', 'Net profit', 'Net loss'].includes(String(r[0])) ? i : -1)).filter((i) => i >= 0);
    await downloadXlsx(`${fileStem.value}.xlsx`, [
      { name: 'Profit and Loss', header: [`${config.clientName} — ${periods.value.name} (cash basis)`, 'Amount'], rows: pnlRows, money: [1], bold },
      { name: 'Transactions', header: ['Date', 'Description', 'Category', 'Account', 'Amount'], rows: transactionRows(), money: [4] },
    ]);
  } catch (err) {
    console.error('Excel export failed:', err instanceof Error ? err.message : err);
    message.value = 'The Excel file could not be created. Please try again.';
  } finally {
    exporting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <DashboardLayout page-title="Profit & Loss">
    <div class="fin">
      <div v-if="state === 'loading'" class="fin__status" role="status">
        <Loader2 :size="18" class="fin__spin" aria-hidden="true" /> Loading your transactions…
      </div>
      <div v-else-if="state === 'setup'" class="card"><p class="card__empty">Profit &amp; Loss isn't switched on for this dashboard yet.</p></div>
      <div v-else-if="state === 'denied'" class="card" role="alert"><p class="card__empty">{{ message }}</p></div>
      <div v-else-if="state === 'error'" class="card fin__error" role="alert">
        <p class="card__empty">{{ message }}</p>
        <button type="button" class="btn btn--secondary" @click="load"><RefreshCw :size="16" aria-hidden="true" /> Try again</button>
      </div>

      <template v-else>
        <div class="fin__bar">
          <div class="fin__period">
            <label class="fin__select" for="fin-period">
              <span class="sr-only">Period</span>
              <select id="fin-period" v-model="preset">
                <option value="this-month">This month</option>
                <option value="last-month">Last month</option>
                <option value="this-quarter">This quarter</option>
                <option value="last-quarter">Last quarter</option>
                <option value="ytd">Year to date</option>
                <option value="last-year">Last year</option>
                <option value="custom">Custom dates…</option>
              </select>
            </label>
            <template v-if="preset === 'custom'">
              <label class="fin__date"><span class="sr-only">From</span><input id="fin-from" v-model="customFrom" type="date" /></label>
              <span aria-hidden="true">–</span>
              <label class="fin__date"><span class="sr-only">To</span><input id="fin-to" v-model="customTo" type="date" /></label>
            </template>
            <span class="fin__range">{{ label(periods.from, periods.to) }}</span>
          </div>
          <div class="fin__actions">
            <button type="button" class="btn btn--secondary" :disabled="!inPeriod.length" @click="exportCsv"><Download :size="16" aria-hidden="true" /> CSV</button>
            <button type="button" class="btn btn--secondary" :disabled="exporting || !inPeriod.length" @click="exportExcel">
              <Loader2 v-if="exporting" :size="16" class="fin__spin" aria-hidden="true" /><FileSpreadsheet v-else :size="16" aria-hidden="true" /> Excel
            </button>
            <button type="button" class="btn btn--primary" @click="dialog?.open(null)"><Plus :size="16" aria-hidden="true" /> Add transaction</button>
          </div>
        </div>

        <div class="fin__summary" role="status">
          <div><span>Income</span><strong>{{ formatMoney(current.totalIncome) }}</strong></div>
          <div><span>Expenses</span><strong>{{ formatMoney(current.totalExpenses) }}</strong></div>
          <div><span>{{ current.net >= 0 ? 'Net profit' : 'Net loss' }}</span><strong :class="current.net >= 0 ? 'fin__up' : 'fin__down'">{{ formatMoney(current.net) }}</strong></div>
        </div>

        <div class="fin__tabs" role="tablist" aria-label="Profit and loss views">
          <button type="button" role="tab" :aria-selected="tab === 'pnl'" :class="{ 'fin__tab--on': tab === 'pnl' }" class="fin__tab" @click="tab = 'pnl'">Profit &amp; loss</button>
          <button type="button" role="tab" :aria-selected="tab === 'transactions'" :class="{ 'fin__tab--on': tab === 'transactions' }" class="fin__tab" @click="tab = 'transactions'">
            Transactions <span v-if="current.uncategorizedCount" class="fin__badge">{{ current.uncategorizedCount }}</span>
          </button>
          <button type="button" role="tab" :aria-selected="tab === 'import'" :class="{ 'fin__tab--on': tab === 'import' }" class="fin__tab" @click="tab = 'import'">Import</button>
        </div>

        <p v-if="message" class="editor__error" role="alert">{{ message }}</p>

        <PnlStatement v-if="tab === 'pnl'" :current="current" :previous="previous" :period-label="periods.name" :previous-label="periods.pName" @categorize="showUncategorized" />
        <TransactionList
          v-else-if="tab === 'transactions'"
          v-model:filter="categoryFilter"
          :transactions="inPeriod"
          @edit="(t) => dialog?.open(t)"
          @recategorize="recategorize"
        />
        <CsvImport v-else :layouts="layouts" :imports="imports" @import="onImport" @undo="undoImport" />
      </template>
    </div>

    <TransactionDialog ref="dialog" :accounts="accounts" @save="onSave" @delete="onDelete" />
  </DashboardLayout>
</template>

<style scoped>
.fin { display: flex; flex-direction: column; gap: 1.25rem; max-width: 1100px; }
.fin__status { display: flex; align-items: center; gap: 0.5rem; padding: 2rem 0; font-size: 0.875rem; color: var(--color-text-secondary); }
.fin__spin { animation: fin-spin 1s linear infinite; }
@keyframes fin-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .fin__spin { animation: none; } }
.fin__error { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; }

.fin__bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; }
.fin__period { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.fin__select select, .fin__date input {
  padding: 0.55rem 0.85rem; border: 1px solid var(--color-border); border-radius: 999px; background-color: var(--color-surface);
  box-shadow: var(--shadow-card); color: var(--color-text); font: inherit; font-size: 0.875rem; font-weight: 600;
}
.fin__range { font-size: 0.8125rem; color: var(--color-text-secondary); }
.fin__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }

.fin__summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
.fin__summary > div {
  display: flex; flex-direction: column; gap: 0.15rem; padding: 0.9rem 1.1rem; background-color: var(--color-surface);
  border: 1px solid var(--color-border); border-radius: calc(var(--border-radius) * 1.5); box-shadow: var(--shadow-card);
}
.fin__summary span { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--color-text-secondary); }
.fin__summary strong { font-family: var(--font-heading); font-size: 1.5rem; font-variant-numeric: tabular-nums; color: var(--color-text); }
.fin__up { color: var(--color-up) !important; }
.fin__down { color: var(--color-down) !important; }

.fin__tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--color-border); }
.fin__tab {
  display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.6rem 0.9rem; margin-bottom: -1px; border: none;
  border-bottom: 2px solid transparent; background: none; font: inherit; font-size: 0.9375rem; font-weight: 600;
  color: var(--color-text-secondary); cursor: pointer;
}
.fin__tab:hover { color: var(--color-text); }
.fin__tab--on { color: var(--color-text); border-bottom-color: var(--color-primary); }
.fin__badge {
  min-width: 1.25rem; padding: 0 0.35rem; border-radius: 999px; font-size: 0.6875rem; line-height: 1.25rem; text-align: center;
  background-color: color-mix(in srgb, #d97706 18%, transparent); color: var(--color-warn);
}
</style>

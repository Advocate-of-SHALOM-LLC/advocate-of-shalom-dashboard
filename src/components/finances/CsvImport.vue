<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Papa from 'papaparse';
import { Upload, Loader2, CheckCircle2, Undo2 } from 'lucide-vue-next';
import { guessDateFormat, guessMapping, layoutSignature, readRow, splitRows, formatMoney, type ImportMapping } from '@/lib/ledger';
import type { LedgerImport, SavedLayout } from '@/composables/useLedger';

/**
 * Import a bank or card statement exported as CSV. Banks lay these out
 * differently, so the columns are matched up once per layout and
 * remembered. Nothing is saved until "Import" — the preview shows exactly
 * what will be added. The file is read in the browser; only the parsed
 * rows are sent.
 */
const props = defineProps<{ layouts: SavedLayout[]; imports: LedgerImport[] }>();
const emit = defineEmits<{
  (e: 'import', payload: { fileName: string; account: string; layout: { signature: string; mapping: ImportMapping }; rows: { date: string; description: string; amountCents: number }[] }, done: (result: string, ok: boolean) => void): void;
  (e: 'undo', id: string): void;
}>();

const fileName = ref('');
const rows = ref<string[][]>([]);
const readError = ref('');
const mapping = ref<ImportMapping | null>(null);
const account = ref('');
const remembered = ref(false);
const busy = ref(false);
const result = ref<{ text: string; ok: boolean } | null>(null);
const confirmingUndo = ref<string | null>(null);

const fileInput = ref<HTMLInputElement | null>(null);

function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  result.value = null;
  readError.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    readError.value = 'That file is larger than 5 MB. Please export a shorter date range.';
    return;
  }
  Papa.parse<string[]>(file, {
    skipEmptyLines: 'greedy',
    complete: (parsed) => {
      const data = parsed.data.filter((r) => r.some((c) => c.trim()));
      if (!data.length) {
        readError.value = "That file doesn't contain any rows.";
        return;
      }
      fileName.value = file.name;
      rows.value = data;
      const guessed = guessMapping(data);
      const signature = layoutSignature(data[guessed.skipRows] ?? [], guessed.hasHeader);
      const saved = props.layouts.find((l) => l.signature === signature);
      // Layouts saved before skipRows existed don't carry it.
      mapping.value = saved ? { ...saved.mapping, skipRows: saved.mapping.skipRows ?? 0 } : guessed;
      account.value = saved?.account ?? account.value;
      remembered.value = Boolean(saved);
    },
    error: () => (readError.value = "That file couldn't be read. Please check it's a CSV export."),
  });
}

const sections = computed(() => splitRows(rows.value, mapping.value ?? { skipRows: 0, hasHeader: false }));
const header = computed(() => {
  const width = Math.max(0, ...sections.value.body.slice(0, 20).map((r) => r.length), sections.value.heading?.length ?? 0);
  return [...Array(width).keys()].map((i) => sections.value.heading?.[i]?.trim() || `Column ${i + 1}`);
});
const body = computed(() => sections.value.body);

const parsed = computed(() => (mapping.value ? body.value.map((r) => readRow(r, mapping.value!)) : []));
const valid = computed(() => parsed.value.filter((p): p is Exclude<typeof p, { error: string }> => !('error' in p)));
const invalidCount = computed(() => parsed.value.length - valid.value.length);
const totals = computed(() => ({
  in: valid.value.filter((v) => v.amountCents > 0).reduce((s, v) => s + v.amountCents, 0),
  out: valid.value.filter((v) => v.amountCents < 0).reduce((s, v) => s - v.amountCents, 0),
}));

// Turning "first row is column names" on or off doesn't move any columns,
// but the first row's date now counts (or doesn't), so recheck the format.
watch(
  () => [mapping.value?.hasHeader, mapping.value?.skipRows].join(),
  (now, before) => {
    if (before === undefined || now === before || !mapping.value) return;
    mapping.value.dateFormat = guessDateFormat(body.value.slice(0, 50).map((r) => r[mapping.value!.date] ?? ''));
  }
);

function reset() {
  rows.value = [];
  mapping.value = null;
  fileName.value = '';
  if (fileInput.value) fileInput.value.value = '';
}

function runImport() {
  if (!mapping.value || !valid.value.length || busy.value) return;
  busy.value = true;
  emit(
    'import',
    {
      fileName: fileName.value,
      account: account.value.trim(),
      layout: { signature: layoutSignature(rows.value[mapping.value.skipRows] ?? [], mapping.value.hasHeader), mapping: mapping.value },
      rows: valid.value,
    },
    (text, ok) => {
      busy.value = false;
      result.value = { text, ok };
      if (ok) reset();
    }
  );
}

const formatStamp = (stamp: string) => {
  const d = new Date(`${stamp.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
</script>

<template>
  <div class="imp">
    <section class="card" aria-labelledby="imp-title">
      <div class="card__head">
        <h2 id="imp-title" class="card__title"><Upload :size="18" aria-hidden="true" /> Import a statement</h2>
      </div>

      <p class="card__empty imp__intro">
        Download your bank or card activity as a CSV file (usually under “Download” or “Export” in online banking), then choose it here.
        You'll see exactly what will be added before anything is saved, and the same transactions are never added twice.
      </p>

      <label class="btn btn--secondary imp__choose" for="imp-file">
        <Upload :size="16" aria-hidden="true" /> Choose CSV file
        <input id="imp-file" ref="fileInput" type="file" accept=".csv,text/csv" class="sr-only" @change="onFile" />
      </label>
      <p v-if="readError" class="editor__error" role="alert">{{ readError }}</p>
      <p v-if="result" class="imp__result" :class="{ 'imp__result--bad': !result.ok }" role="status">
        <CheckCircle2 v-if="result.ok" :size="16" aria-hidden="true" /> {{ result.text }}
      </p>

      <template v-if="mapping">
        <h3 class="imp__h">Match the columns <span class="imp__file">{{ fileName }}</span></h3>
        <p v-if="remembered" class="imp__remembered">Using the layout you set up last time for this kind of file.</p>

        <div class="imp__grid">
          <label class="editor__field" for="imp-skip">
            <span>Lines to skip at the top</span>
            <input id="imp-skip" v-model.number="mapping.skipRows" type="number" min="0" max="50" />
          </label>
          <label class="editor__field imp__check">
            <input v-model="mapping.hasHeader" type="checkbox" /> <span>Next line is column names</span>
          </label>
          <label class="editor__field" for="imp-date">
            <span>Date</span>
            <select id="imp-date" v-model.number="mapping.date"><option v-for="(h, i) in header" :key="i" :value="i">{{ h }}</option></select>
          </label>
          <label class="editor__field" for="imp-date-format">
            <span>Date format</span>
            <select id="imp-date-format" v-model="mapping.dateFormat">
              <option value="MDY">Month/Day/Year</option>
              <option value="DMY">Day/Month/Year</option>
              <option value="YMD">Year-Month-Day</option>
            </select>
          </label>
          <label class="editor__field" for="imp-desc">
            <span>Description</span>
            <select id="imp-desc" v-model.number="mapping.description"><option v-for="(h, i) in header" :key="i" :value="i">{{ h }}</option></select>
          </label>
          <label class="editor__field" for="imp-memo">
            <span>Extra detail (optional)</span>
            <select id="imp-memo" v-model="mapping.memo">
              <option :value="null">None</option>
              <option v-for="(h, i) in header" :key="i" :value="i">{{ h }}</option>
            </select>
          </label>
          <label class="editor__field" for="imp-mode">
            <span>Amounts are in</span>
            <select id="imp-mode" v-model="mapping.amountMode">
              <option value="single">One amount column</option>
              <option value="split">Separate money-in and money-out columns</option>
            </select>
          </label>
          <template v-if="mapping.amountMode === 'single'">
            <label class="editor__field" for="imp-amount">
              <span>Amount</span>
              <select id="imp-amount" v-model.number="mapping.amount"><option v-for="(h, i) in header" :key="i" :value="i">{{ h }}</option></select>
            </label>
            <label class="editor__field imp__check imp__check--wide">
              <input v-model="mapping.flipSign" type="checkbox" />
              <span>Money out shows as a positive number <small>(some card statements do this; check the preview: money in shows in green)</small></span>
            </label>
          </template>
          <template v-else>
            <label class="editor__field" for="imp-in">
              <span>Money in</span>
              <select id="imp-in" v-model.number="mapping.moneyIn"><option v-for="(h, i) in header" :key="i" :value="i">{{ h }}</option></select>
            </label>
            <label class="editor__field" for="imp-out">
              <span>Money out</span>
              <select id="imp-out" v-model.number="mapping.moneyOut"><option v-for="(h, i) in header" :key="i" :value="i">{{ h }}</option></select>
            </label>
          </template>
          <label class="editor__field" for="imp-account">
            <span>Account</span>
            <input id="imp-account" v-model="account" type="text" maxlength="100" placeholder="e.g. Business checking" />
          </label>
        </div>

        <h3 class="imp__h">Preview</h3>
        <p class="imp__summary">
          <strong>{{ valid.length }}</strong> {{ valid.length === 1 ? 'transaction' : 'transactions' }} ready:
          {{ formatMoney(totals.in) }} in, {{ formatMoney(totals.out) }} out.
          <template v-if="invalidCount"> {{ invalidCount }} {{ invalidCount === 1 ? 'row' : 'rows' }} can't be read and will be skipped.</template>
        </p>
        <div class="imp__scroll">
          <table class="imp__table">
            <thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col" class="imp__num">Amount</th></tr></thead>
            <tbody>
              <tr v-for="(p, i) in parsed.slice(0, 8)" :key="i" :class="{ 'imp__bad': 'error' in p }">
                <template v-if="'error' in p">
                  <td colspan="3">Row {{ i + 1 }}: {{ p.error }} — will be skipped</td>
                </template>
                <template v-else>
                  <td>{{ p.date }}</td>
                  <td>{{ p.description }}</td>
                  <td class="imp__num" :class="{ 'imp__in': p.amountCents > 0 }">{{ p.amountCents > 0 ? '+' : '' }}{{ formatMoney(p.amountCents) }}</td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="parsed.length > 8" class="imp__more">…and {{ parsed.length - 8 }} more. Money in shows in green; check it matches your statement.</p>

        <div class="editor__buttons">
          <button type="button" class="btn btn--secondary" :disabled="busy" @click="reset">Cancel</button>
          <button type="button" class="btn btn--primary" :disabled="busy || !valid.length" @click="runImport">
            <Loader2 v-if="busy" :size="16" class="imp__spin" aria-hidden="true" />
            Import {{ valid.length }} {{ valid.length === 1 ? 'transaction' : 'transactions' }}
          </button>
        </div>
      </template>
    </section>

    <section v-if="imports.length" class="card" aria-labelledby="imp-recent">
      <div class="card__head"><h2 id="imp-recent" class="card__title">Recent imports</h2></div>
      <ul class="imp__list">
        <li v-for="item in imports" :key="item.id">
          <span class="imp__list-name">{{ item.fileName }}<template v-if="item.account"> · {{ item.account }}</template></span>
          <span class="imp__list-meta">{{ formatStamp(item.createdAt) }} · {{ item.imported }} added<template v-if="item.skipped">, {{ item.skipped }} skipped</template></span>
          <span v-if="confirmingUndo === item.id" class="imp__undo-confirm">
            Remove these {{ item.imported }} transactions?
            <button type="button" class="btn btn--danger" @click="emit('undo', item.id); confirmingUndo = null">Remove</button>
            <button type="button" class="btn btn--secondary" @click="confirmingUndo = null">Keep</button>
          </span>
          <button v-else type="button" class="btn btn--quiet" @click="confirmingUndo = item.id"><Undo2 :size="14" aria-hidden="true" /> Undo</button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.imp { display: flex; flex-direction: column; gap: 1.25rem; }
.imp__intro { max-width: 70ch; margin: 0 0 1rem; }
.imp__choose { cursor: pointer; }
.imp__result { display: flex; align-items: center; gap: 0.4rem; margin: 0.75rem 0 0; font-size: 0.9375rem; font-weight: 600; color: var(--color-up); }
.imp__result--bad { color: var(--color-down); }
.imp__h { margin: 1.5rem 0 0.5rem; font-family: var(--font-heading); font-size: 1rem; }
.imp__file { margin-left: 0.4rem; font-family: var(--font-body); font-size: 0.8125rem; font-weight: 400; color: var(--color-text-secondary); }
.imp__remembered { margin: 0 0 0.75rem; font-size: 0.8125rem; color: var(--color-up); }
.imp__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.85rem 1rem; align-items: end; }
.imp__grid select, .imp__grid input[type='text'], .imp__grid input[type='number'] {
  padding: 0.5rem 0.65rem; border: 1px solid var(--color-border); border-radius: var(--border-radius);
  background-color: var(--color-bg); color: var(--color-text); font: inherit; font-size: 0.9375rem; font-weight: 400;
}
.imp__check { flex-direction: row !important; align-items: center; gap: 0.5rem !important; font-weight: 500 !important; color: var(--color-text) !important; }
.imp__check--wide { grid-column: 1 / -1; order: 99; }
.imp__check small { font-weight: 400; color: var(--color-text-secondary); }
.imp__summary { margin: 0 0 0.6rem; font-size: 0.9375rem; }
.imp__scroll { overflow-x: auto; }
.imp__table { width: 100%; border-collapse: collapse; font-size: 0.875rem; font-variant-numeric: tabular-nums; }
.imp__table th, .imp__table td { padding: 0.4rem 0.5rem; text-align: left; border-bottom: 1px solid var(--color-border); }
.imp__table thead th { font-size: 0.75rem; color: var(--color-text-secondary); }
.imp__num { text-align: right !important; white-space: nowrap; }
.imp__in { color: var(--color-up); }
.imp__bad td { color: var(--color-down); font-style: italic; }
.imp__more { margin: 0.5rem 0 1rem; font-size: 0.8125rem; color: var(--color-text-secondary); }
.imp__spin { animation: imp-spin 1s linear infinite; }
@keyframes imp-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .imp__spin { animation: none; } }
.imp__list { list-style: none; margin: 0; padding: 0; }
.imp__list li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 1rem; padding: 0.6rem 0; border-top: 1px solid var(--color-border); }
.imp__list li:first-child { border-top: none; }
.imp__list-name { flex: 1 1 220px; font-weight: 600; font-size: 0.9375rem; overflow-wrap: anywhere; }
.imp__list-meta { font-size: 0.8125rem; color: var(--color-text-secondary); }
.imp__undo-confirm { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; font-size: 0.875rem; }
</style>

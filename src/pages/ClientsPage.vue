<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import DashboardLayout from '@/components/layout/DashboardLayout.vue';
import { Users, Plus, Download, Search, Loader2, X, RefreshCw } from 'lucide-vue-next';
import { useApi } from '@/composables/useApi';

/**
 * The people Advocate of SHALOM serves: name, how their court case
 * concluded, and notes. Deliberately just those three fields (replacing
 * Rocket Matter, which had "too much"); more can be added later.
 *
 * Personal information: the server only answers the people listed in
 * config.privateDataAccess. Names never go into the page address.
 */

interface ClientRecord {
  id: string;
  name: string;
  caseConclusion: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

const api = useApi();

const state = ref<'loading' | 'ready' | 'setup' | 'denied' | 'error'>('loading');
const message = ref('');
const records = ref<ClientRecord[]>([]);
const query = ref('');

// Editor (add / edit) in a native <dialog>, which handles focus and Esc.
const dialog = ref<HTMLDialogElement | null>(null);
const editing = ref<ClientRecord | null>(null);
const form = ref({ name: '', caseConclusion: '', notes: '' });
const saving = ref(false);
const formError = ref('');
const confirmingDelete = ref(false);

async function load() {
  state.value = 'loading';
  message.value = '';
  try {
    const res = await api('client-records');
    const data = await res.json().catch(() => null);
    if (res.status === 403) {
      message.value = data?.error || 'This account does not have access to these records.';
      state.value = 'denied';
      return;
    }
    if (!res.ok || !data) throw new Error(data?.error || `client-records returned ${res.status}`);
    if (data.configured === false) {
      state.value = 'setup';
      return;
    }
    records.value = data.records ?? [];
    state.value = 'ready';
  } catch (err) {
    console.error('Client records load failed:', err instanceof Error ? err.message : err);
    message.value = 'Your client records could not be loaded. Please try again.';
    state.value = 'error';
  }
}

onMounted(load);

// Search across all three fields, ignoring capitals.
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return records.value;
  return records.value.filter((r) =>
    [r.name, r.caseConclusion, r.notes].some((field) => field.toLowerCase().includes(q))
  );
});

const countLabel = computed(() => {
  const total = records.value.length;
  const shown = filtered.value.length;
  const noun = (n: number) => `${n} ${n === 1 ? 'client' : 'clients'}`;
  return query.value.trim() ? `${shown} of ${noun(total)}` : noun(total);
});

// Stored as UTC "YYYY-MM-DD HH:MM:SS"; shown as a local date.
function formatDate(stamp: string) {
  if (!stamp) return '';
  const d = new Date(`${stamp.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const firstLine = (text: string) => text.split('\n').find((l) => l.trim()) ?? '';

async function openEditor(record: ClientRecord | null) {
  editing.value = record;
  form.value = record
    ? { name: record.name, caseConclusion: record.caseConclusion, notes: record.notes }
    : { name: '', caseConclusion: '', notes: '' };
  formError.value = '';
  confirmingDelete.value = false;
  dialog.value?.showModal();
  await nextTick();
  document.getElementById('client-name')?.focus();
}

function closeEditor() {
  dialog.value?.close();
}

async function save() {
  if (saving.value) return;
  formError.value = '';
  if (!form.value.name.trim()) {
    formError.value = 'Please enter a name.';
    return;
  }
  saving.value = true;
  try {
    const id = editing.value?.id;
    const res = await api(`client-records${id ? `?id=${id}` : ''}`, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.record) throw new Error(data?.error || 'Your changes could not be saved. Please try again.');

    const saved = data.record as ClientRecord;
    records.value = (id ? records.value.map((r) => (r.id === id ? saved : r)) : [...records.value, saved]).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
    closeEditor();
  } catch (err) {
    formError.value = err instanceof Error ? err.message : 'Your changes could not be saved. Please try again.';
  } finally {
    saving.value = false;
  }
}

async function remove() {
  const id = editing.value?.id;
  if (!id || saving.value) return;
  saving.value = true;
  formError.value = '';
  try {
    const res = await api(`client-records?id=${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'This record could not be deleted. Please try again.');
    records.value = records.value.filter((r) => r.id !== id);
    closeEditor();
  } catch (err) {
    formError.value = err instanceof Error ? err.message : 'This record could not be deleted. Please try again.';
  } finally {
    saving.value = false;
  }
}

// CSV per RFC 4180, with a byte-order mark so Excel reads accents and
// dashes correctly. Built in the browser: the records never pass through
// anything else on the way to the file.
function exportCsv() {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = ['Name', 'Case conclusion', 'Notes', 'Added', 'Last updated'];
  const rows = records.value.map((r) =>
    [r.name, r.caseConclusion, r.notes, formatDate(r.createdAt), formatDate(r.updatedAt)].map(cell).join(',')
  );
  const csv = '﻿' + [header.map(cell).join(','), ...rows].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <DashboardLayout page-title="Clients">
    <div class="clients">
      <div v-if="state === 'loading'" class="clients__status" role="status">
        <Loader2 :size="18" class="clients__spin" aria-hidden="true" /> Loading your clients…
      </div>

      <div v-else-if="state === 'setup'" class="card clients__notice">
        <p class="card__empty">Client records aren't switched on for this dashboard yet.</p>
      </div>

      <div v-else-if="state === 'denied'" class="card clients__notice" role="alert">
        <p class="card__empty">{{ message }}</p>
      </div>

      <div v-else-if="state === 'error'" class="card clients__notice" role="alert">
        <p class="card__empty">{{ message }}</p>
        <button type="button" class="btn btn--secondary" @click="load"><RefreshCw :size="16" aria-hidden="true" /> Try again</button>
      </div>

      <template v-else>
        <div class="clients__bar">
          <label class="clients__search">
            <Search :size="16" aria-hidden="true" />
            <span class="sr-only">Search clients</span>
            <input id="client-search" v-model="query" type="search" placeholder="Search names, case conclusions and notes" autocomplete="off" />
          </label>
          <div class="clients__actions">
            <button type="button" class="btn btn--secondary" :disabled="!records.length" @click="exportCsv">
              <Download :size="16" aria-hidden="true" /> Export CSV
            </button>
            <button type="button" class="btn btn--primary" @click="openEditor(null)">
              <Plus :size="16" aria-hidden="true" /> Add client
            </button>
          </div>
        </div>

        <section class="card clients__list" aria-labelledby="clients-title">
          <div class="card__head">
            <h2 id="clients-title" class="card__title"><Users :size="18" aria-hidden="true" /> Your clients</h2>
            <span class="clients__count" role="status">{{ countLabel }}</span>
          </div>

          <p v-if="!records.length" class="card__empty">
            No clients yet. Add your first one with <strong>Add client</strong>.
          </p>
          <p v-else-if="!filtered.length" class="card__empty">No clients match “{{ query }}”.</p>

          <ul v-else class="clients__rows">
            <li v-for="record in filtered" :key="record.id">
              <button type="button" class="clients__row" @click="openEditor(record)">
                <span class="clients__name">{{ record.name }}</span>
                <span class="clients__conclusion" :class="{ 'clients__conclusion--none': !record.caseConclusion }">
                  {{ record.caseConclusion || 'No case conclusion yet' }}
                </span>
                <span v-if="record.notes" class="clients__notes">{{ firstLine(record.notes) }}</span>
                <span class="clients__updated">Updated {{ formatDate(record.updatedAt) }}</span>
              </button>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <dialog ref="dialog" class="editor" aria-labelledby="editor-title" @close="confirmingDelete = false">
      <form class="editor__form" @submit.prevent="save">
        <div class="editor__head">
          <h2 id="editor-title" class="card__title">{{ editing ? 'Edit client' : 'Add client' }}</h2>
          <button type="button" class="editor__close" aria-label="Close" @click="closeEditor"><X :size="18" aria-hidden="true" /></button>
        </div>

        <label class="editor__field" for="client-name">
          <span>Name</span>
          <input id="client-name" v-model="form.name" type="text" maxlength="200" autocomplete="off" required />
        </label>
        <label class="editor__field" for="client-conclusion">
          <span>Case conclusion</span>
          <textarea id="client-conclusion" v-model="form.caseConclusion" rows="2" maxlength="2000" placeholder="How the court case concluded"></textarea>
        </label>
        <label class="editor__field" for="client-notes">
          <span>Notes</span>
          <textarea id="client-notes" v-model="form.notes" rows="9" maxlength="20000"></textarea>
        </label>

        <p v-if="formError" class="editor__error" role="alert">{{ formError }}</p>

        <div class="editor__buttons">
          <template v-if="editing && confirmingDelete">
            <span class="editor__confirm">Delete this client?</span>
            <button type="button" class="btn btn--danger" :disabled="saving" @click="remove">Delete</button>
            <button type="button" class="btn btn--secondary" :disabled="saving" @click="confirmingDelete = false">Keep</button>
          </template>
          <template v-else>
            <button v-if="editing" type="button" class="btn btn--quiet editor__delete" :disabled="saving" @click="confirmingDelete = true">Delete</button>
            <button type="button" class="btn btn--secondary" :disabled="saving" @click="closeEditor">Cancel</button>
            <button type="submit" class="btn btn--primary" :disabled="saving">
              <Loader2 v-if="saving" :size="16" class="clients__spin" aria-hidden="true" />
              {{ editing ? 'Save changes' : 'Add client' }}
            </button>
          </template>
        </div>
      </form>
    </dialog>
  </DashboardLayout>
</template>

<style scoped>
.clients { display: flex; flex-direction: column; gap: 1.25rem; max-width: 1100px; }
.clients__status { display: flex; align-items: center; gap: 0.5rem; padding: 2rem 0; font-size: 0.875rem; color: var(--color-text-secondary); }
.clients__spin { animation: clients-spin 1s linear infinite; }
@keyframes clients-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .clients__spin { animation: none; } }
.clients__notice { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; }

.clients__bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; }
.clients__search {
  flex: 1 1 280px; max-width: 480px; display: flex; align-items: center; gap: 0.5rem; padding: 0 0.85rem;
  background-color: var(--color-surface); border: 1px solid var(--color-border); border-radius: 999px;
  box-shadow: var(--shadow-card); color: var(--color-text-secondary);
}
.clients__search:focus-within { border-color: var(--color-primary); }
.clients__search input { flex: 1; min-width: 0; padding: 0.6rem 0; border: none; background: none; font: inherit; font-size: 0.9375rem; color: var(--color-text); }
.clients__search input:focus { outline: none; }
.clients__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }

.clients__count { font-size: 0.8125rem; color: var(--color-text-secondary); }
.clients__rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.clients__rows li + li { border-top: 1px solid var(--color-border); }
.clients__row {
  /* Fixed date column so the middle column lines up from row to row. */
  width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) 9rem; grid-template-areas: 'name conclusion updated' 'name notes updated';
  align-items: start; gap: 0.15rem 1.25rem; padding: 0.85rem 0.5rem; border: none; background: none; text-align: left; cursor: pointer;
  border-radius: var(--border-radius); font: inherit; color: var(--color-text);
}
.clients__row:hover { background-color: var(--color-bg); }
.clients__name { grid-area: name; font-weight: 600; font-size: 0.9375rem; overflow-wrap: anywhere; }
.clients__conclusion { grid-area: conclusion; font-size: 0.875rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clients__conclusion--none { color: var(--color-text-secondary); font-style: italic; }
.clients__notes { grid-area: notes; font-size: 0.8125rem; color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clients__updated { grid-area: updated; font-size: 0.75rem; color: var(--color-text-secondary); white-space: nowrap; text-align: right; }
@media (max-width: 640px) {
  .clients__row { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'name' 'conclusion' 'notes' 'updated'; }
  .clients__updated { text-align: left; }
}

</style>

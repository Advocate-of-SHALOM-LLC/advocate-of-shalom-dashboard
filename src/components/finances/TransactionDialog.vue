<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { X, Loader2 } from 'lucide-vue-next';
import { CATEGORIES, UNCATEGORIZED, type Transaction } from '@/lib/ledger';
import type { TransactionFields } from '@/composables/useLedger';

/** Add or edit one transaction. Amounts are typed as positive numbers with Money in / Money out. */
const props = defineProps<{ accounts: string[] }>();
const emit = defineEmits<{
  (e: 'save', id: string | null, fields: TransactionFields, done: (error?: string) => void): void;
  (e: 'delete', id: string, done: (error?: string) => void): void;
}>();

const dialog = ref<HTMLDialogElement | null>(null);
const editing = ref<Transaction | null>(null);
const form = ref({ date: '', description: '', direction: 'out' as 'in' | 'out', amount: '', category: UNCATEGORIZED, account: '' });
const saving = ref(false);
const error = ref('');
const confirmingDelete = ref(false);

const groups = computed(() => [
  { label: 'Income', items: CATEGORIES.filter((c) => c.kind === 'income') },
  { label: 'Expenses', items: CATEGORIES.filter((c) => c.kind === 'expense') },
  { label: 'Not on the P&L', items: CATEGORIES.filter((c) => c.kind === 'excluded') },
]);

const today = () => new Intl.DateTimeFormat('en-CA').format(new Date());

async function open(transaction: Transaction | null) {
  editing.value = transaction;
  form.value = transaction
    ? {
        date: transaction.date,
        description: transaction.description,
        direction: transaction.amountCents >= 0 ? 'in' : 'out',
        amount: (Math.abs(transaction.amountCents) / 100).toFixed(2),
        category: transaction.category,
        account: transaction.account,
      }
    : { date: today(), description: '', direction: 'out', amount: '', category: UNCATEGORIZED, account: props.accounts[0] ?? '' };
  error.value = '';
  confirmingDelete.value = false;
  dialog.value?.showModal();
  await nextTick();
  document.getElementById(transaction ? 'txn-description' : 'txn-date')?.focus();
}

defineExpose({ open });

const close = () => dialog.value?.close();

function save() {
  if (saving.value) return;
  const cents = Math.round(parseFloat(form.value.amount.replace(/[$,\s]/g, '')) * 100);
  if (!form.value.date) return (error.value = 'Please enter a date.');
  if (!form.value.description.trim()) return (error.value = 'Please enter a description.');
  if (!Number.isFinite(cents) || cents <= 0) return (error.value = 'Please enter an amount greater than zero.');
  error.value = '';
  saving.value = true;
  emit(
    'save',
    editing.value?.id ?? null,
    {
      date: form.value.date,
      description: form.value.description.trim(),
      amountCents: form.value.direction === 'in' ? cents : -cents,
      category: form.value.category,
      account: form.value.account.trim(),
    },
    (message) => {
      saving.value = false;
      if (message) error.value = message;
      else close();
    }
  );
}

function remove() {
  if (!editing.value || saving.value) return;
  saving.value = true;
  emit('delete', editing.value.id, (message) => {
    saving.value = false;
    if (message) error.value = message;
    else close();
  });
}
</script>

<template>
  <dialog ref="dialog" class="editor" aria-labelledby="txn-title" @close="confirmingDelete = false">
    <form class="editor__form" @submit.prevent="save">
      <div class="editor__head">
        <h2 id="txn-title" class="card__title">{{ editing ? 'Edit transaction' : 'Add transaction' }}</h2>
        <button type="button" class="editor__close" aria-label="Close" @click="close"><X :size="18" aria-hidden="true" /></button>
      </div>

      <div class="txn__row">
        <label class="editor__field" for="txn-date">
          <span>Date</span>
          <input id="txn-date" v-model="form.date" type="date" required />
        </label>
        <fieldset class="txn__direction">
          <legend>Type</legend>
          <label><input v-model="form.direction" type="radio" value="in" /> Money in</label>
          <label><input v-model="form.direction" type="radio" value="out" /> Money out</label>
        </fieldset>
        <label class="editor__field" for="txn-amount">
          <span>Amount ($)</span>
          <input id="txn-amount" v-model="form.amount" type="text" inputmode="decimal" placeholder="0.00" required />
        </label>
      </div>

      <label class="editor__field" for="txn-description">
        <span>Description</span>
        <input id="txn-description" v-model="form.description" type="text" maxlength="500" required />
      </label>

      <div class="txn__row txn__row--two">
        <label class="editor__field" for="txn-category">
          <span>Category</span>
          <select id="txn-category" v-model="form.category">
            <optgroup v-for="group in groups" :key="group.label" :label="group.label">
              <option v-for="c in group.items" :key="c.key" :value="c.key">{{ c.label }}</option>
            </optgroup>
          </select>
        </label>
        <label class="editor__field" for="txn-account">
          <span>Account</span>
          <input id="txn-account" v-model="form.account" type="text" maxlength="100" list="txn-accounts" placeholder="e.g. Business checking" />
          <datalist id="txn-accounts">
            <option v-for="a in accounts" :key="a" :value="a"></option>
          </datalist>
        </label>
      </div>

      <p v-if="error" class="editor__error" role="alert">{{ error }}</p>

      <div class="editor__buttons">
        <template v-if="editing && confirmingDelete">
          <span class="editor__confirm">Delete this transaction?</span>
          <button type="button" class="btn btn--danger" :disabled="saving" @click="remove">Delete</button>
          <button type="button" class="btn btn--secondary" :disabled="saving" @click="confirmingDelete = false">Keep</button>
        </template>
        <template v-else>
          <button v-if="editing" type="button" class="btn btn--quiet editor__delete" :disabled="saving" @click="confirmingDelete = true">Delete</button>
          <button type="button" class="btn btn--secondary" :disabled="saving" @click="close">Cancel</button>
          <button type="submit" class="btn btn--primary" :disabled="saving">
            <Loader2 v-if="saving" :size="16" class="txn__spin" aria-hidden="true" />
            {{ editing ? 'Save changes' : 'Add transaction' }}
          </button>
        </template>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.txn__row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; align-items: end; }
.txn__row--two { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.txn__direction { display: flex; flex-direction: column; gap: 0.25rem; margin: 0; padding: 0; border: none; font-size: 0.875rem; }
.txn__direction legend { margin-bottom: 0.3rem; font-size: 0.8125rem; font-weight: 600; color: var(--color-text-secondary); }
.txn__direction label { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; }
.editor__field select {
  padding: 0.6rem 0.75rem; border: 1px solid var(--color-border); border-radius: var(--border-radius);
  background-color: var(--color-bg); color: var(--color-text); font: inherit; font-size: 0.9375rem; font-weight: 400;
}
.txn__spin { animation: txn-spin 1s linear infinite; }
@keyframes txn-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .txn__spin { animation: none; } }
</style>

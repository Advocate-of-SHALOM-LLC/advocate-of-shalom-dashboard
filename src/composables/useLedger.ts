import { ref } from 'vue';
import { useApi } from '@/composables/useApi';
import type { ImportMapping, Transaction } from '@/lib/ledger';

export interface LedgerImport {
  id: string;
  fileName: string;
  account: string;
  imported: number;
  skipped: number;
  createdAt: string;
}

export interface SavedLayout {
  signature: string;
  mapping: ImportMapping;
  account: string;
}

export type TransactionFields = Pick<Transaction, 'date' | 'description' | 'amountCents' | 'category' | 'account'>;

/** The P&L's data and the calls that change it (ledger function). */
export function useLedger() {
  const api = useApi();
  const state = ref<'loading' | 'ready' | 'setup' | 'denied' | 'error'>('loading');
  const message = ref('');
  const transactions = ref<Transaction[]>([]);
  const imports = ref<LedgerImport[]>([]);
  const layouts = ref<SavedLayout[]>([]);

  const send = async (path: string, init: RequestInit) => {
    const res = await api(path, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) throw new Error(data?.error || 'That could not be saved. Please try again.');
    return data;
  };

  async function load() {
    state.value = 'loading';
    message.value = '';
    try {
      const res = await api('ledger');
      const data = await res.json().catch(() => null);
      if (res.status === 403) {
        message.value = data?.error || 'This account does not have access to these records.';
        state.value = 'denied';
        return;
      }
      if (!res.ok || !data) throw new Error(`ledger returned ${res.status}`);
      if (data.configured === false) {
        state.value = 'setup';
        return;
      }
      transactions.value = data.transactions ?? [];
      imports.value = data.imports ?? [];
      layouts.value = data.layouts ?? [];
      state.value = 'ready';
    } catch (err) {
      console.error('Ledger load failed:', err instanceof Error ? err.message : err);
      message.value = 'Your transactions could not be loaded. Please try again.';
      state.value = 'error';
    }
  }

  const sortTransactions = () =>
    transactions.value.sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));

  async function create(fields: TransactionFields) {
    const data = await send('ledger', { method: 'POST', body: JSON.stringify({ action: 'create', transaction: fields }) });
    transactions.value.push(data.transaction);
    sortTransactions();
  }

  async function update(id: string, fields: TransactionFields) {
    const data = await send(`ledger?id=${id}`, { method: 'PUT', body: JSON.stringify(fields) });
    transactions.value = transactions.value.map((t) => (t.id === id ? data.transaction : t));
    sortTransactions();
  }

  async function remove(id: string) {
    await send(`ledger?id=${id}`, { method: 'DELETE' });
    transactions.value = transactions.value.filter((t) => t.id !== id);
  }

  async function importRows(payload: {
    fileName: string;
    account: string;
    layout: { signature: string; mapping: ImportMapping };
    rows: { date: string; description: string; amountCents: number }[];
  }): Promise<{ imported: number; duplicates: number; invalid: number }> {
    const data = await send('ledger', { method: 'POST', body: JSON.stringify({ action: 'import', ...payload }) });
    await load();
    return data;
  }

  async function undoImport(id: string) {
    await send(`ledger?import=${id}`, { method: 'DELETE' });
    await load();
  }

  return { state, message, transactions, imports, layouts, load, create, update, remove, importRows, undoImport };
}

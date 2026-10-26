/**
 * The P&L's shared rules, used by both the page and the ledger function.
 *
 * Cash basis: a transaction counts on the date the money moved. Amounts are
 * whole cents, signed from the business's side: money in is positive, money
 * out negative. Categories follow the lines of IRS Schedule C (Profit or
 * Loss From Business), the form a single-owner business files, so the P&L
 * lines up with what goes to the accountant at tax time.
 */

export type CategoryKind = 'income' | 'expense' | 'excluded';

export interface Category {
  key: string;
  label: string;
  kind: CategoryKind;
  /** Schedule C line, for reference. */
  line?: string;
}

export const CATEGORIES: Category[] = [
  { key: 'income_services', label: 'Income from services', kind: 'income', line: '1' },
  { key: 'income_other', label: 'Other income', kind: 'income', line: '6' },

  { key: 'advertising', label: 'Advertising', kind: 'expense', line: '8' },
  { key: 'car_truck', label: 'Car and truck expenses', kind: 'expense', line: '9' },
  { key: 'commissions_fees', label: 'Commissions and fees', kind: 'expense', line: '10' },
  { key: 'contract_labor', label: 'Contract labor', kind: 'expense', line: '11' },
  { key: 'insurance', label: 'Insurance (other than health)', kind: 'expense', line: '15' },
  { key: 'interest', label: 'Interest', kind: 'expense', line: '16' },
  { key: 'legal_professional', label: 'Legal and professional services', kind: 'expense', line: '17' },
  { key: 'office', label: 'Office expense', kind: 'expense', line: '18' },
  { key: 'rent_lease', label: 'Rent or lease', kind: 'expense', line: '20' },
  { key: 'repairs', label: 'Repairs and maintenance', kind: 'expense', line: '21' },
  { key: 'supplies', label: 'Supplies', kind: 'expense', line: '22' },
  { key: 'taxes_licenses', label: 'Taxes and licenses', kind: 'expense', line: '23' },
  { key: 'travel', label: 'Travel', kind: 'expense', line: '24a' },
  { key: 'meals', label: 'Meals', kind: 'expense', line: '24b' },
  { key: 'utilities', label: 'Utilities', kind: 'expense', line: '25' },
  { key: 'wages', label: 'Wages', kind: 'expense', line: '26' },
  { key: 'other_expenses', label: 'Other expenses (software, fees, dues)', kind: 'expense', line: '27a' },

  // Money that moved but isn't business income or expense: transfers
  // between accounts, credit-card payments, owner draws and contributions.
  { key: 'transfer', label: 'Transfer / owner draw (not on the P&L)', kind: 'excluded' },
  { key: 'uncategorized', label: 'Needs a category', kind: 'excluded' },
];

export const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));
export const UNCATEGORIZED = 'uncategorized';

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amountCents: number; // + money in, − money out
  category: string;
  account: string;
  source: 'manual' | 'import';
  importId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Reading bank exports ───────────────────────────────────────────────────

export type DateFormat = 'MDY' | 'DMY' | 'YMD';

/** How one bank's CSV layout maps onto transactions; remembered per layout. */
export interface ImportMapping {
  /** Lines above the column names (some banks put a summary there). */
  skipRows: number;
  hasHeader: boolean;
  date: number;
  description: number;
  /** Optional second column appended to the description (e.g. Memo). */
  memo: number | null;
  amountMode: 'single' | 'split';
  /** single: the amount column. */
  amount: number | null;
  /** single: true when the bank shows money out as a positive number. */
  flipSign: boolean;
  /** split: money in / money out columns. */
  moneyIn: number | null;
  moneyOut: number | null;
  dateFormat: DateFormat;
}

const pad = (n: number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): string | null {
  if (!y || !m || !d || m > 12 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** A bank's date text as YYYY-MM-DD, or null if it can't be read. */
export function parseDate(text: string, format: DateFormat): string | null {
  const t = text.trim();
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const parts = t.match(/^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})/);
  if (!parts) return null;
  const [a, b] = [Number(parts[1]), Number(parts[2])];
  let c = Number(parts[3]);
  if (format === 'YMD') return validDate(a, b, c);
  if (c < 100) c += 2000;
  return format === 'DMY' ? validDate(c, b, a) : validDate(c, a, b);
}

/** Picks the date format that reads every sample, preferring US order. */
export function guessDateFormat(samples: string[]): DateFormat {
  const filled = samples.filter((s) => s.trim());
  for (const format of ['YMD', 'MDY', 'DMY'] as DateFormat[]) {
    if (filled.length && filled.every((s) => parseDate(s, format))) return format;
  }
  return 'MDY';
}

/**
 * A bank's amount text as signed cents, or null. Handles "$1,234.56",
 * "-12.00", "(12.00)" (accounting negative), "12.00 CR"/"DR".
 */
export function parseAmount(text: string): number | null {
  let t = text.trim();
  if (!t) return null;
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  if (/\bDR$/i.test(t)) negative = true;
  t = t.replace(/\b(CR|DR)$/i, '').replace(/[$,\s]/g, '');
  if (t.startsWith('-')) {
    negative = !negative;
    t = t.slice(1);
  } else if (t.startsWith('+')) {
    t = t.slice(1);
  }
  if (!/^\d+(\.\d{1,2})?$|^\.\d{1,2}$/.test(t)) return null;
  const cents = Math.round(parseFloat(t) * 100);
  return negative ? -cents : cents;
}

/** Turns one CSV row into a transaction draft, or a reason it can't. */
export function readRow(
  row: string[],
  m: ImportMapping
): { date: string; description: string; amountCents: number } | { error: string } {
  const cell = (i: number | null) => (i === null ? '' : (row[i] ?? '').trim());
  const date = parseDate(cell(m.date), m.dateFormat);
  if (!date) return { error: 'date not recognised' };

  const description = [cell(m.description), cell(m.memo)].filter(Boolean).join(' — ').slice(0, 500);
  if (!description) return { error: 'no description' };

  let amountCents: number | null;
  if (m.amountMode === 'single') {
    amountCents = parseAmount(cell(m.amount));
    if (amountCents !== null && m.flipSign) amountCents = -amountCents;
  } else {
    // Money in / out columns usually hold positive numbers, one of them empty.
    const inCents = parseAmount(cell(m.moneyIn));
    const outCents = parseAmount(cell(m.moneyOut));
    amountCents = inCents === null && outCents === null ? null : Math.abs(inCents ?? 0) - Math.abs(outCents ?? 0);
  }
  if (amountCents === null) return { error: 'amount not recognised' };
  if (amountCents === 0) return { error: 'zero amount' };
  return { date, description, amountCents };
}

/** A header row is words; a data row has a date or an amount in it. */
export const looksLikeData = (row: string[]) => row.some((c) => /^\s*[\d$(+-]/.test(c) && /\d/.test(c));

const find = (header: string[], ...names: RegExp[]) => {
  for (const name of names) {
    const i = header.findIndex((h) => name.test(h.trim()));
    if (i !== -1) return i;
  }
  return null;
};

/** Index of the column where most sample values pass `test`, or null. */
function columnWhere(rows: string[][], test: (value: string) => boolean, except: (number | null)[] = []): number | null {
  const width = Math.max(0, ...rows.map((r) => r.length));
  let best: number | null = null;
  let bestHits = 0;
  for (let i = 0; i < width; i++) {
    if (except.includes(i)) continue;
    const hits = rows.filter((r) => test(r[i] ?? '')).length;
    if (hits > bestHits) [best, bestHits] = [i, hits];
  }
  return bestHits >= Math.ceil(rows.length / 2) ? best : null;
}

/**
 * A first guess at how a statement's columns map. Finds the heading row
 * even when a bank puts summary lines above it, matches columns by their
 * names, and falls back to their contents when there are no headings.
 */
export function guessMapping(data: string[][]): ImportMapping {
  const headingAt = data.slice(0, 15).findIndex((r) => !looksLikeData(r) && r.some((c) => /date/i.test(c)) && r.filter((c) => c.trim()).length >= 2);
  const hasHeader = headingAt !== -1;
  const skipRows = hasHeader ? headingAt : 0;
  const header = hasHeader ? data[skipRows]! : [];
  const body = data.slice(skipRows + (hasHeader ? 1 : 0));
  const sample = body.slice(0, 50);

  const isDate = (v: string) => Boolean(parseDate(v, 'MDY') || parseDate(v, 'DMY') || parseDate(v, 'YMD'));
  const isAmount = (v: string) => parseAmount(v) !== null && !isDate(v);

  const date = (hasHeader ? find(header, /date/i) : null) ?? columnWhere(sample, isDate) ?? 0;
  const moneyIn = hasHeader ? find(header, /^credit/i, /deposit/i, /money in/i, /^in$/i) : null;
  const moneyOut = hasHeader ? find(header, /^debit/i, /withdraw/i, /money out/i, /^out$/i) : null;
  const amountByName = hasHeader ? find(header, /^amount/i, /amount/i) : null;
  const split = amountByName === null && moneyIn !== null && moneyOut !== null;
  const amount = split ? null : amountByName ?? columnWhere(sample, isAmount, [date]) ?? 0;

  // The description is the column with the most text in it.
  const width = Math.max(0, ...sample.map((r) => r.length));
  const textiest = [...Array(width).keys()]
    .filter((i) => i !== date && i !== amount)
    .sort((a, b) => sample.reduce((n, r) => n + (r[b] ?? '').length, 0) - sample.reduce((n, r) => n + (r[a] ?? '').length, 0))[0];
  const description = (hasHeader ? find(header, /^desc/i, /desc/i, /payee/i, /merchant/i, /^name/i) : null) ?? textiest ?? 0;

  return {
    skipRows,
    hasHeader,
    date,
    description,
    memo: hasHeader ? find(header, /^memo/i, /memo/i) : null,
    amountMode: split ? 'split' : 'single',
    amount,
    flipSign: false,
    moneyIn: split ? moneyIn : null,
    moneyOut: split ? moneyOut : null,
    dateFormat: guessDateFormat(sample.map((r) => r[date] ?? '')),
  };
}

/** The heading row (if any) and data rows of a statement, per its mapping. */
export function splitRows(data: string[][], m: Pick<ImportMapping, 'skipRows' | 'hasHeader'>) {
  const rest = data.slice(m.skipRows);
  return m.hasHeader ? { heading: rest[0] ?? [], body: rest.slice(1) } : { heading: null, body: rest };
}

/** Identifies a layout (its header row, or its width when it has none). */
export function layoutSignature(firstRow: string[], hasHeader: boolean): string {
  return hasHeader
    ? `h:${firstRow.map((c) => c.trim().toLowerCase()).join('|')}`
    : `n:${firstRow.length}`;
}

// ─── Duplicates and remembered payees ───────────────────────────────────────

/** A payee's description reduced to its words, for matching past ones. */
export const normalizeDescription = (text: string) =>
  text
    .toLowerCase()
    .replace(/\d+/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

/**
 * The key that marks a transaction as already imported. `occurrence`
 * counts identical rows within one file, so two real $5.00 coffees on the
 * same day both import, while uploading the same file again adds nothing.
 */
export const fingerprint = (t: { date: string; amountCents: number; description: string; account: string }, occurrence: number) =>
  [t.date, t.amountCents, t.description.trim().toLowerCase().replace(/\s+/g, ' '), t.account.trim().toLowerCase(), occurrence].join('|');

// ─── Periods and totals ─────────────────────────────────────────────────────

export interface PnlLine {
  key: string;
  label: string;
  cents: number; // shown as a positive amount on its side
  count: number;
}

export interface Pnl {
  income: PnlLine[];
  expenses: PnlLine[];
  totalIncome: number;
  totalExpenses: number;
  net: number;
  uncategorizedCount: number;
}

/**
 * The P&L for transactions dated from..to (inclusive). Uncategorised money
 * is shown on its side (in or out) and counted in the totals, flagged so it
 * gets sorted; transfers and owner draws are left out entirely.
 */
export function profitAndLoss(transactions: Transaction[], from: string, to: string): Pnl {
  const income = new Map<string, PnlLine>();
  const expenses = new Map<string, PnlLine>();
  let uncategorizedCount = 0;

  const add = (side: Map<string, PnlLine>, key: string, label: string, cents: number) => {
    const line = side.get(key) ?? { key, label, cents: 0, count: 0 };
    line.cents += cents;
    line.count += 1;
    side.set(key, line);
  };

  for (const t of transactions) {
    if (t.date < from || t.date > to) continue;
    const category = CATEGORY_BY_KEY.get(t.category) ?? CATEGORY_BY_KEY.get(UNCATEGORIZED)!;
    if (category.kind === 'income') add(income, category.key, category.label, t.amountCents);
    else if (category.kind === 'expense') add(expenses, category.key, category.label, -t.amountCents);
    else if (category.key === UNCATEGORIZED) {
      uncategorizedCount += 1;
      if (t.amountCents > 0) add(income, UNCATEGORIZED, 'Money in — needs a category', t.amountCents);
      else add(expenses, UNCATEGORIZED, 'Money out — needs a category', -t.amountCents);
    }
  }

  // Schedule C order, uncategorised last.
  const order = (lines: Map<string, PnlLine>) =>
    [...lines.values()].sort((a, b) => {
      const ia = a.key === UNCATEGORIZED ? 999 : CATEGORIES.findIndex((c) => c.key === a.key);
      const ib = b.key === UNCATEGORIZED ? 999 : CATEGORIES.findIndex((c) => c.key === b.key);
      return ia - ib;
    });

  const totalIncome = [...income.values()].reduce((s, l) => s + l.cents, 0);
  const totalExpenses = [...expenses.values()].reduce((s, l) => s + l.cents, 0);
  return { income: order(income), expenses: order(expenses), totalIncome, totalExpenses, net: totalIncome - totalExpenses, uncategorizedCount };
}

export const formatMoney = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

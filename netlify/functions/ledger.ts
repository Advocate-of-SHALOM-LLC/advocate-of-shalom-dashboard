import { json, requirePrivateAccess } from '../lib/auth';
import { ensureSchema, recordsClient } from '../lib/records-db';
import config from '../../src/config/dashboard';
import { CATEGORY_BY_KEY, UNCATEGORIZED, fingerprint, normalizeDescription } from '../../src/lib/ledger';

/**
 * The P&L's transactions (cash basis).
 *
 *   GET                         every transaction, recent imports, saved CSV layouts
 *   POST {action:'create', transaction}
 *   POST {action:'import', fileName, account, layout:{signature, mapping}, rows:[{date, description, amountCents}]}
 *   PUT    ?id=…  {date, description, amountCents, category, account}
 *   DELETE ?id=…               remove one (recoverable)
 *   DELETE ?import=…           undo an import
 *
 * Private business records: same two-person access as client records, and
 * nothing from a transaction is ever written to the function log.
 */

const MAX_IMPORT_ROWS = 5000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[0-9a-f]{32}$/;

const toTransaction = (r: Record<string, unknown>) => ({
  id: String(r.id),
  date: String(r.date),
  description: String(r.description ?? ''),
  amountCents: Number(r.amount_cents),
  category: String(r.category ?? UNCATEGORIZED),
  account: String(r.account ?? ''),
  source: r.source === 'import' ? 'import' : 'manual',
  importId: r.import_id ? String(r.import_id) : null,
  createdAt: String(r.created_at ?? ''),
  updatedAt: String(r.updated_at ?? ''),
});

const COLUMNS = 'id, date, description, amount_cents, category, account, source, import_id, created_at, updated_at';

interface Fields {
  date: string;
  description: string;
  amountCents: number;
  category: string;
  account: string;
}

function readFields(data: Record<string, unknown>): Fields | string {
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const date = text(data.date, 10);
  const amountCents = Number(data.amountCents);
  const fields = {
    date,
    description: text(data.description, 500),
    amountCents,
    category: text(data.category, 40) || UNCATEGORIZED,
    account: text(data.account, 100),
  };
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return 'Please enter a valid date.';
  if (!fields.description) return 'Please enter a description.';
  if (!Number.isInteger(amountCents) || amountCents === 0 || Math.abs(amountCents) > 1e11) return 'Please enter an amount.';
  if (!CATEGORY_BY_KEY.has(fields.category)) return 'Please choose a category.';
  return fields;
}

function parseBody(body: string | null): Record<string, unknown> | null {
  try {
    const data = JSON.parse(body || '{}');
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

export async function handler(event: {
  httpMethod: string;
  headers: Record<string, string>;
  queryStringParameters: Record<string, string> | null;
  body: string | null;
}) {
  const auth = await requirePrivateAccess(event.headers, config.privateDataAccess ?? []);
  if ('response' in auth) return auth.response;

  const db = recordsClient();
  if (!db) return json(200, { configured: false });
  const owner = config.clientId;
  const qs = event.queryStringParameters ?? {};

  try {
    await ensureSchema(db);

    if (event.httpMethod === 'GET') {
      const [transactions, imports, layouts] = await Promise.all([
        db.execute({
          sql: `SELECT ${COLUMNS} FROM ledger_transactions
                 WHERE owner_id = ? AND deleted_at IS NULL ORDER BY date DESC, created_at DESC`,
          args: [owner],
        }),
        db.execute({
          sql: `SELECT id, file_name, account, rows_imported, rows_skipped, created_at FROM ledger_imports
                 WHERE owner_id = ? AND undone_at IS NULL ORDER BY created_at DESC LIMIT 10`,
          args: [owner],
        }),
        db.execute({ sql: 'SELECT signature, mapping, account FROM ledger_import_layouts WHERE owner_id = ?', args: [owner] }),
      ]);
      return json(200, {
        configured: true,
        transactions: transactions.rows.map(toTransaction),
        imports: imports.rows.map((r) => ({
          id: String(r.id),
          fileName: String(r.file_name),
          account: String(r.account),
          imported: Number(r.rows_imported),
          skipped: Number(r.rows_skipped),
          createdAt: String(r.created_at),
        })),
        layouts: layouts.rows.map((r) => ({ signature: String(r.signature), mapping: JSON.parse(String(r.mapping)), account: String(r.account) })),
      });
    }

    if (event.httpMethod === 'POST') {
      const data = parseBody(event.body);
      if (!data) return json(400, { error: 'The request could not be read.' });

      if (data.action === 'create') {
        const fields = readFields((data.transaction as Record<string, unknown>) ?? {});
        if (typeof fields === 'string') return json(400, { error: fields });
        const rows = await db.execute({
          sql: `INSERT INTO ledger_transactions (owner_id, date, description, amount_cents, category, account, source)
                VALUES (?, ?, ?, ?, ?, ?, 'manual') RETURNING ${COLUMNS}`,
          args: [owner, fields.date, fields.description, fields.amountCents, fields.category, fields.account],
        });
        return json(201, { transaction: toTransaction(rows.rows[0]) });
      }

      if (data.action === 'import') {
        const rows = Array.isArray(data.rows) ? (data.rows as Record<string, unknown>[]) : [];
        if (!rows.length) return json(400, { error: 'There were no transactions to import.' });
        if (rows.length > MAX_IMPORT_ROWS) return json(400, { error: `Please import up to ${MAX_IMPORT_ROWS.toLocaleString()} rows at a time.` });
        const account = typeof data.account === 'string' ? data.account.trim().slice(0, 100) : '';
        const fileName = typeof data.fileName === 'string' ? data.fileName.slice(0, 200) : 'statement.csv';

        // Remembered payees: the category last given to the same description.
        const memory = new Map<string, string>();
        const past = await db.execute({
          sql: `SELECT description, category FROM ledger_transactions
                 WHERE owner_id = ? AND deleted_at IS NULL AND category <> ?
                 ORDER BY updated_at ASC`,
          args: [owner, UNCATEGORIZED],
        });
        for (const r of past.rows) memory.set(normalizeDescription(String(r.description)), String(r.category));

        const created = await db.execute({
          sql: `INSERT INTO ledger_imports (owner_id, file_name, account) VALUES (?, ?, ?) RETURNING id`,
          args: [owner, fileName, account],
        });
        const importId = String(created.rows[0].id);

        const seen = new Map<string, number>();
        const statements = [];
        let invalid = 0;
        for (const raw of rows) {
          const fields = readFields({ ...raw, account, category: UNCATEGORIZED });
          if (typeof fields === 'string') {
            invalid += 1;
            continue;
          }
          const base = fingerprint({ ...fields, account }, 0);
          const occurrence = (seen.get(base) ?? 0) + 1;
          seen.set(base, occurrence);
          const category = memory.get(normalizeDescription(fields.description)) ?? UNCATEGORIZED;
          statements.push({
            sql: `INSERT OR IGNORE INTO ledger_transactions
                    (owner_id, date, description, amount_cents, category, account, source, import_id, fingerprint)
                  VALUES (?, ?, ?, ?, ?, ?, 'import', ?, ?)`,
            args: [owner, fields.date, fields.description, fields.amountCents, category, account, importId, fingerprint({ ...fields, account }, occurrence)],
          });
        }

        const results = statements.length ? await db.batch(statements, 'write') : [];
        const imported = results.reduce((n, r) => n + r.rowsAffected, 0);
        const skipped = rows.length - imported;

        const layout = data.layout as { signature?: unknown; mapping?: unknown } | undefined;
        await db.batch(
          [
            // A re-upload that added nothing isn't worth listing as an import.
            imported
              ? { sql: 'UPDATE ledger_imports SET rows_imported = ?, rows_skipped = ? WHERE id = ?', args: [imported, skipped, importId] }
              : { sql: 'DELETE FROM ledger_imports WHERE id = ? AND owner_id = ?', args: [importId, owner] },
            ...(layout && typeof layout.signature === 'string' && layout.mapping
              ? [{
                  sql: `INSERT INTO ledger_import_layouts (owner_id, signature, mapping, account) VALUES (?, ?, ?, ?)
                        ON CONFLICT (owner_id, signature) DO UPDATE SET mapping = excluded.mapping, account = excluded.account, updated_at = datetime('now')`,
                  args: [owner, layout.signature.slice(0, 2000), JSON.stringify(layout.mapping).slice(0, 2000), account],
                }]
              : []),
          ],
          'write'
        );
        return json(200, { importId, imported, duplicates: skipped - invalid, invalid });
      }

      return json(400, { error: 'Unknown action.' });
    }

    if (event.httpMethod === 'PUT') {
      if (!ID.test(qs.id ?? '')) return json(400, { error: 'That transaction could not be found.' });
      const data = parseBody(event.body);
      const fields = data ? readFields(data) : 'The request could not be read.';
      if (typeof fields === 'string') return json(400, { error: fields });
      const rows = await db.execute({
        sql: `UPDATE ledger_transactions
                 SET date = ?, description = ?, amount_cents = ?, category = ?, account = ?, updated_at = datetime('now')
               WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
              RETURNING ${COLUMNS}`,
        args: [fields.date, fields.description, fields.amountCents, fields.category, fields.account, qs.id!, owner],
      });
      if (!rows.rows.length) return json(404, { error: 'That transaction could not be found.' });
      return json(200, { transaction: toTransaction(rows.rows[0]) });
    }

    if (event.httpMethod === 'DELETE') {
      if (qs.import) {
        if (!ID.test(qs.import)) return json(400, { error: 'That import could not be found.' });
        const results = await db.batch(
          [
            {
              sql: `UPDATE ledger_transactions SET deleted_at = datetime('now')
                     WHERE owner_id = ? AND import_id = ? AND deleted_at IS NULL`,
              args: [owner, qs.import],
            },
            { sql: `UPDATE ledger_imports SET undone_at = datetime('now') WHERE id = ? AND owner_id = ? AND undone_at IS NULL`, args: [qs.import, owner] },
          ],
          'write'
        );
        if (!results[1]?.rowsAffected) return json(404, { error: 'That import could not be found.' });
        return json(200, { removed: results[0]?.rowsAffected ?? 0 });
      }
      if (!ID.test(qs.id ?? '')) return json(400, { error: 'That transaction could not be found.' });
      const result = await db.execute({
        sql: `UPDATE ledger_transactions SET deleted_at = datetime('now') WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
        args: [qs.id!, owner],
      });
      if (!result.rowsAffected) return json(404, { error: 'That transaction could not be found.' });
      return json(200, { deleted: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    // The message only: never the request body or a row.
    console.error('ledger failed:', err instanceof Error ? err.message : 'unknown error');
    return json(500, { error: 'Your transactions could not be saved or loaded just now. Please try again.' });
  }
}

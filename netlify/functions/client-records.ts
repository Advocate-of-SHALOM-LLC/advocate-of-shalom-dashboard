import { json, requirePrivateAccess } from '../lib/auth';
import { ensureSchema, recordsClient } from '../lib/records-db';
import config from '../../src/config/dashboard';

/**
 * The client's own records of the people they serve: name, how the court
 * case concluded, and notes.
 *
 *   GET                 every record (not deleted), A–Z
 *   POST   {name, caseConclusion, notes}            add one
 *   PUT    ?id=…  {name, caseConclusion, notes}     update one
 *   DELETE ?id=…                                    hide one (recoverable)
 *
 * Personal information: only the people in config.privateDataAccess can
 * read or change it, records never leave this client's rows, and nothing
 * from a record is ever written to the function log.
 */

const LIMITS = { name: 200, caseConclusion: 2000, notes: 20000 };

interface RecordInput {
  name: string;
  caseConclusion: string;
  notes: string;
}

function parseInput(body: string | null): RecordInput | string {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body || '{}');
  } catch {
    return 'The request could not be read.';
  }
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const input = { name: text(data.name), caseConclusion: text(data.caseConclusion), notes: text(data.notes) };
  if (!input.name) return 'Please enter a name.';
  if (input.name.length > LIMITS.name) return `Names can be up to ${LIMITS.name} characters.`;
  if (input.caseConclusion.length > LIMITS.caseConclusion) return `The case conclusion can be up to ${LIMITS.caseConclusion} characters.`;
  if (input.notes.length > LIMITS.notes) return `Notes can be up to ${LIMITS.notes.toLocaleString()} characters.`;
  return input;
}

const toRecord = (r: Record<string, unknown>) => ({
  id: String(r.id),
  name: String(r.name ?? ''),
  caseConclusion: String(r.case_conclusion ?? ''),
  notes: String(r.notes ?? ''),
  createdAt: String(r.created_at ?? ''),
  updatedAt: String(r.updated_at ?? ''),
});

const COLUMNS = 'id, name, case_conclusion, notes, created_at, updated_at';

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
  const id = event.queryStringParameters?.id ?? '';
  if (['PUT', 'DELETE'].includes(event.httpMethod) && !/^[0-9a-f]{32}$/.test(id)) {
    return json(400, { error: 'That record could not be found.' });
  }

  try {
    await ensureSchema(db);

    switch (event.httpMethod) {
      case 'GET': {
        const rows = await db.execute({
          sql: `SELECT ${COLUMNS} FROM client_records
                 WHERE owner_id = ? AND deleted_at IS NULL
                 ORDER BY name COLLATE NOCASE`,
          args: [owner],
        });
        return json(200, { configured: true, records: rows.rows.map(toRecord) });
      }

      case 'POST': {
        const input = parseInput(event.body);
        if (typeof input === 'string') return json(400, { error: input });
        const rows = await db.execute({
          sql: `INSERT INTO client_records (owner_id, name, case_conclusion, notes)
                VALUES (?, ?, ?, ?) RETURNING ${COLUMNS}`,
          args: [owner, input.name, input.caseConclusion, input.notes],
        });
        return json(201, { record: toRecord(rows.rows[0]) });
      }

      case 'PUT': {
        const input = parseInput(event.body);
        if (typeof input === 'string') return json(400, { error: input });
        const rows = await db.execute({
          sql: `UPDATE client_records
                   SET name = ?, case_conclusion = ?, notes = ?, updated_at = datetime('now')
                 WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
                RETURNING ${COLUMNS}`,
          args: [input.name, input.caseConclusion, input.notes, id, owner],
        });
        if (!rows.rows.length) return json(404, { error: 'That record could not be found.' });
        return json(200, { record: toRecord(rows.rows[0]) });
      }

      case 'DELETE': {
        const result = await db.execute({
          sql: `UPDATE client_records SET deleted_at = datetime('now')
                 WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
          args: [id, owner],
        });
        if (!result.rowsAffected) return json(404, { error: 'That record could not be found.' });
        return json(200, { deleted: true });
      }

      default:
        return json(405, { error: 'Method not allowed' });
    }
  } catch (err) {
    // The message only: never the request body or a row.
    console.error('client-records failed:', err instanceof Error ? err.message : 'unknown error');
    return json(500, { error: 'Your records could not be saved or loaded just now. Please try again.' });
  }
}

import { createClient, type Client } from '@libsql/client/web';

/**
 * The database for the client's own private business records (client
 * records now; P&L later), separate from the agency database.
 *
 * Env: RECORDS_TURSO_CONFIG = {"databaseUrl":"…","authToken":"…"}
 *
 * Tables are created on first use (CREATE … IF NOT EXISTS), so a new
 * database needs no migration step. Every row carries owner_id (this
 * dashboard's client ID) so the same tables could hold more than one
 * client's records without mixing them; queries always filter by it.
 */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS client_records (
    id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    owner_id         TEXT NOT NULL,
    name             TEXT NOT NULL,
    case_conclusion  TEXT NOT NULL DEFAULT '',
    notes            TEXT NOT NULL DEFAULT '',
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
    -- Deleting hides a record; it stays recoverable until purged by hand.
    deleted_at       TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_client_records_owner
    ON client_records (owner_id, deleted_at)`,
];

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

export function recordsClient(): Client | null {
  if (client) return client;
  let config: { databaseUrl?: string; authToken?: string } = {};
  try {
    config = JSON.parse(process.env.RECORDS_TURSO_CONFIG || '{}');
  } catch {
    // Malformed JSON is the same as not configured.
  }
  if (!config.databaseUrl) return null;
  client = createClient({ url: config.databaseUrl, authToken: config.authToken });
  return client;
}

/** Creates the tables if they don't exist yet; once per function instance. */
export function ensureSchema(db: Client): Promise<void> {
  schemaReady ??= (async () => {
    for (const sql of SCHEMA) await db.execute(sql);
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

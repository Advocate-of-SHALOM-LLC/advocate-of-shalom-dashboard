import { json, requireUser } from '../lib/auth';
import { tursoClient } from '../lib/turso';
import { reportTimeZone } from '../lib/google';
import config from '../../src/config/dashboard';

/**
 * "From your web team" on the overview: the web team's latest published
 * monthly note and the next maintenance day on the agency's calendar.
 *
 * Read only, from the agency's own tables (monthly_reports, time_blocks),
 * always filtered to this dashboard's client. Only the date of the next
 * maintenance day is returned, never the calendar entry's title or notes.
 */
export async function handler(event: { headers: Record<string, string> }) {
  const auth = await requireUser(event.headers);
  if ('response' in auth) return auth.response;

  const db = tursoClient();
  if (!db) return json(200, { configured: false });

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: reportTimeZone() }).format(new Date());

  try {
    const [note, visit] = await Promise.all([
      db
        .execute({
          sql: `SELECT report_month, summary, recommendations, published_at FROM monthly_reports
                 WHERE client_id = ? AND status = 'published'
                   AND (COALESCE(summary, '') <> '' OR COALESCE(recommendations, '') <> '')
                 ORDER BY report_month DESC LIMIT 1`,
          args: [config.clientId],
        })
        // The agency table is optional here: the card shows without a note.
        .catch(() => null),
      db
        .execute({
          sql: `SELECT date FROM time_blocks
                 WHERE client_id = ? AND rate_type = 'maintenance' AND date >= ?
                 ORDER BY date ASC LIMIT 1`,
          args: [config.clientId, today],
        })
        .catch(() => null),
    ]);

    const n = note?.rows[0];
    return json(200, {
      configured: true,
      note: n
        ? {
            month: String(n.report_month),
            summary: n.summary ? String(n.summary) : '',
            recommendations: n.recommendations ? String(n.recommendations) : '',
            publishedAt: n.published_at ? String(n.published_at) : null,
          }
        : null,
      nextVisit: visit?.rows[0]?.date ? String(visit.rows[0].date) : null,
    });
  } catch (err) {
    console.error('web-team failed:', err instanceof Error ? err.message : err);
    return json(500, { error: 'Your web team’s notes could not be loaded.' });
  }
}

import { tursoClient } from '../lib/turso';
import { buildReport, lastCompleteMonth, reportExists, saveReport } from '../lib/report';

/**
 * Writes last month's report, once.
 *
 * Runs daily from the 3rd and stops as soon as the month has a report, so a
 * run that fails is retried the next day without anyone stepping in
 * (OVERVIEW-STANDARD.md, 6.1). The 3rd rather than the 1st because the last
 * days of a month are still settling for a day or two.
 *
 * A month that already has a report is left alone, so a retried run never
 * rewrites what the client has already seen. To rebuild one on purpose, use
 * `pnpm reports:generate`.
 *
 * Scheduled functions run only on the published production deploy.
 */
export default async () => {
  const db = tursoClient();
  if (!db) {
    console.error('Monthly report skipped: TURSO_CONFIG is not set.');
    return new Response('not configured', { status: 500 });
  }

  const month = lastCompleteMonth();
  if (await reportExists(db, month)) {
    console.log(`Monthly report ${month} already exists; left as it is.`);
    return new Response('exists');
  }

  const report = await buildReport(db, month);
  await saveReport(db, report);
  console.log(`Monthly report ${month} written.`);
  return new Response('written');
};

// 14:00 UTC (early morning in Colorado) on the 3rd, then daily until written.
export const config = { schedule: '0 14 3-31 * *' };

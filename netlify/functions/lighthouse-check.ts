import { tursoClient } from '../lib/turso';
import {
  completeLighthouse,
  firstLighthouseRow,
  lighthouseConfigured,
  runLighthouse,
  saveLighthouse,
  type Strategy,
} from '../lib/lighthouse';
import { currentMonth, monthBounds } from '../lib/report';

/**
 * Tests the live homepage with Google Lighthouse once a month. That test is
 * the one the month's own report shows (written early the month after), so
 * each report reflects the site going into its month.
 *
 * Runs daily from the 2nd and stops once the month has a test on both phone
 * and computer. Google's test occasionally fails to load a page; a device
 * that didn't finish is added to the same test on a later run, which keeps
 * its original date (OVERVIEW-STANDARD.md, 6.1).
 *
 * Separate from the report on purpose: each test can take most of the time a
 * scheduled function is allowed. Scheduled functions run only on the
 * published production deploy.
 */
export default async () => {
  if (!lighthouseConfigured()) {
    console.log('Lighthouse check skipped: no PSI_API_KEY / GOOGLE_PAGESPEED_API_KEY or Google service account.');
    return new Response('not configured');
  }
  const db = tursoClient();
  if (!db) return new Response('database not configured', { status: 500 });

  const { start, end } = monthBounds(currentMonth());
  const existing = await firstLighthouseRow(db, start, end);
  const missing = (['mobile', 'desktop'] as Strategy[]).filter((s) => !existing?.check[s]);
  if (!missing.length) {
    console.log(`Lighthouse ${start.slice(0, 7)}: already tested; nothing to do.`);
    return new Response('done');
  }

  const check = await runLighthouse(missing);
  if (!check) return new Response('no result', { status: 502 });

  if (existing) {
    await completeLighthouse(db, existing.id, {
      ...existing.check,
      mobile: existing.check.mobile ?? check.mobile,
      desktop: existing.check.desktop ?? check.desktop,
    });
  } else {
    await saveLighthouse(db, check);
  }
  console.log(`Lighthouse: mobile ${check.mobile?.scores.performance ?? '—'}, desktop ${check.desktop?.scores.performance ?? '—'}`);
  return new Response('saved');
};

// 14:00 UTC on the 2nd, then daily until the month's test is complete.
export const config = { schedule: '0 14 2-31 * *' };

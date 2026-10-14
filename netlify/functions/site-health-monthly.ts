/**
 * Monthly site health snapshot (scheduled).
 *
 * Runs daily but only does work when this month's snapshot is missing or
 * incomplete, so the check lands on the 1st, retries the next day if the
 * 1st failed, and a fresh deploy gets its first snapshot within a day.
 * Each month's result is kept under its YYYY-MM key in Netlify Blobs.
 *
 * Google PageSpeed sometimes can't measure a page. When that happens the
 * rest of the snapshot is saved and the speed scores are filled in on a
 * later day's run. One PageSpeed attempt per run keeps inside the 30-second
 * limit for scheduled functions.
 */
import { getStore } from '@netlify/blobs';
import dashboardConfig from '../../src/config/dashboard';
import {
  runSiteChecks,
  runSpeedChecks,
  SPEED_CHECK_IDS,
  SNAPSHOT_STORE,
  type HealthSnapshot,
} from '../lib/site-health';

export default async () => {
  const host = dashboardConfig.clientDomain;
  const url = `https://${host}/`;
  const month = new Date().toISOString().slice(0, 7);
  const store = getStore(SNAPSHOT_STORE);

  const existing = (await store.get(month, { type: 'json' })) as HealthSnapshot | null;
  if (existing?.speedMeasured) {
    console.log(`Site health ${month}: snapshot complete, nothing to do`);
    return new Response(null, { status: 204 });
  }

  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  const [siteChecks, speedChecks] = await Promise.all([
    existing ? Promise.resolve(existing.checks.filter((c) => !SPEED_CHECK_IDS.includes(c.id))) : runSiteChecks(host),
    apiKey
      ? runSpeedChecks(url, apiKey).catch((err) => {
          console.warn(`Site health ${month}: PageSpeed failed, will retry tomorrow —`, err instanceof Error ? err.message : err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  if (!apiKey) console.warn('Site health: GOOGLE_PAGESPEED_API_KEY is not set — saving without speed scores');

  const snapshot: HealthSnapshot = {
    month,
    url,
    checkedAt: existing?.checkedAt ?? new Date().toISOString(),
    checks: [...siteChecks, ...(speedChecks ?? [])],
    speedMeasured: !!speedChecks,
  };
  await store.setJSON(month, snapshot);
  console.log(`Site health ${month}: saved (${snapshot.checks.length} checks, speed ${snapshot.speedMeasured ? 'measured' : 'pending'})`);
  return new Response(null, { status: 204 });
};

// Daily at 13:00 UTC (6–7am in Colorado); exits early once the month is done.
export const config = { schedule: '0 13 * * *' };

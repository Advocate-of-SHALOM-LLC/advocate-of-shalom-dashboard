/**
 * Latest monthly site health snapshot, plus the month before it so the
 * dashboard can show what changed. Snapshots are written by
 * site-health-monthly.
 */
import { getStore } from '@netlify/blobs';
import { SNAPSHOT_STORE, type HealthSnapshot } from '../lib/site-health';

export default async (req: Request) => {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  // Presence-only Auth0 gate — same pattern as the billing functions.
  if (!req.headers.get('authorization')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const store = getStore(SNAPSHOT_STORE);
    const { blobs } = await store.list();
    const [latestKey, previousKey] = blobs.map((b) => b.key).sort().reverse();

    const read = (key?: string) => (key ? (store.get(key, { type: 'json' }) as Promise<HealthSnapshot | null>) : null);
    const [latest, previous] = await Promise.all([read(latestKey), read(previousKey)]);

    return Response.json(
      { success: true, latest, previous },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('get-site-health error:', err);
    return Response.json({ error: 'Failed to load site health' }, { status: 500 });
  }
};

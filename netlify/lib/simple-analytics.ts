import config from '../../src/config/dashboard';
import { reportTimeZone } from './google';

/**
 * Simple Analytics figures for the monthly report.
 *
 * Simple Analytics already leaves out bots and crawlers, so its visitor count
 * is used as visits as it stands; there is no engagement filter and no count
 * of left-out hits. It has no returning-visitor or town-level figures, so
 * those parts of the report stay empty for a Simple Analytics client.
 *
 * Env: SIMPLE_ANALYTICS_API_KEY
 */

const BASE = 'https://simpleanalytics.com';

interface Entry {
  value: string;
  visitors?: number;
  pageviews?: number;
}

interface Response {
  visitors?: number;
  pageviews?: number;
  seconds_on_page?: number | null;
  histogram?: { date: string; visitors?: number }[];
  pages?: Entry[];
  referrers?: Entry[];
  device_types?: Entry[];
}

export const simpleAnalyticsConfigured = () =>
  config.analytics?.provider === 'simple-analytics' && Boolean(process.env.SIMPLE_ANALYTICS_API_KEY);

const hostname = () => config.analytics?.simpleAnalyticsId || config.clientDomain;

async function query(start: string, end: string, fields: string[], extra: Record<string, string> = {}): Promise<Response> {
  const params = new URLSearchParams({
    version: '5',
    start,
    end,
    info: 'false',
    timezone: reportTimeZone(),
    fields: fields.join(','),
    ...extra,
  });
  const res = await fetch(`${BASE}/${hostname()}.json?${params}`, {
    headers: { 'Api-Key': process.env.SIMPLE_ANALYTICS_API_KEY ?? '', 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Simple Analytics ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Response;
}

/**
 * The first month (YYYY-MM) with any recorded visit, so months before
 * tracking began read as "not measured" rather than zero.
 */
export async function trackingStartMonth(until: string): Promise<string | null> {
  const all = await query('2019-01-01', until, ['histogram'], { interval: 'month' });
  const first = (all.histogram ?? []).find((h) => (h.visitors ?? 0) > 0);
  return first ? first.date.slice(0, 7) : null;
}

export async function monthVisits(start: string, end: string): Promise<number> {
  return (await query(start, end, ['visitors'])).visitors ?? 0;
}

/** Everything the report needs about one month, in one call. */
export async function monthDetail(start: string, end: string) {
  const r = await query(start, end, ['visitors', 'seconds_on_page', 'histogram', 'pages', 'referrers', 'device_types'], {
    interval: 'day',
  });
  const visits = r.visitors ?? 0;
  const count = (e: Entry) => e.visitors ?? 0;

  const devices = r.device_types ?? [];
  const deviceTotal = devices.reduce((sum, d) => sum + count(d), 0);
  const mobile = devices.filter((d) => d.value === 'mobile').reduce((sum, d) => sum + count(d), 0);

  // Simple Analytics lists referring sites only; whatever is left over came
  // in directly (typed address, bookmark, email link).
  const referrers = (r.referrers ?? []).map((e) => ({ source: e.value, medium: '', visits: count(e) }));
  const referred = referrers.reduce((sum, e) => sum + e.visits, 0);
  const sources = [...referrers, ...(visits > referred ? [{ source: '(direct)', medium: '', visits: visits - referred }] : [])];

  return {
    visits,
    avgSeconds: typeof r.seconds_on_page === 'number' && r.seconds_on_page > 0 ? Math.round(r.seconds_on_page) : null,
    mobileShare: deviceTotal ? Math.round((mobile / deviceTotal) * 100) : null,
    series: (r.histogram ?? []).map((h) => ({ day: h.date.slice(0, 10), visits: h.visitors ?? 0 })),
    pages: (r.pages ?? []).map((e) => ({ path: e.value, visits: count(e) })),
    sources,
  };
}

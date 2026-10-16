/**
 * Analytics Proxy — fetches from Simple Analytics API on behalf of the dashboard.
 * Keeps the SA API key server-side so it's never exposed to the client.
 *
 * Query params: start, end (YYYY-MM-DD), interval (optional: day | week | month).
 * Or ?period=mtd: this month so far against the same days of last month, for
 * the overview.
 * The site is always this dashboard's own (config) — never one named in the request.
 * When interval is set, the response also carries a real visitor histogram
 * for that range, bucketed by the interval.
 * Env: SIMPLE_ANALYTICS_API_KEY
 */

import { requireUser } from '../lib/auth';
import { monthToDate } from '../lib/simple-analytics';
import dashboardConfig from '../../src/config/dashboard';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function handler(event: {
  headers: Record<string, string>;
  queryStringParameters: Record<string, string> | null;
}) {
  const auth = await requireUser(event.headers);
  if ('response' in auth) return auth.response;

  if (event.queryStringParameters?.period === 'mtd') {
    if (dashboardConfig.analytics?.provider !== 'simple-analytics' || !process.env.SIMPLE_ANALYTICS_API_KEY) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ configured: false }) };
    }
    try {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' },
        body: JSON.stringify(await monthToDate()),
      };
    } catch (err) {
      console.error('Analytics month-to-date error:', err instanceof Error ? err.message : err);
      return { statusCode: 502, body: JSON.stringify({ error: 'Visitor figures are unavailable just now.' }) };
    }
  }

  const hostname = dashboardConfig.analytics?.simpleAnalyticsId || dashboardConfig.clientDomain;
  const { start, end, interval } = event.queryStringParameters || {};
  const histogramInterval = interval && ['day', 'week', 'month'].includes(interval) ? interval : null;

  if (!start || !end || !ISO_DATE.test(start) || !ISO_DATE.test(end)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'start and end must be dates (YYYY-MM-DD)' }),
    };
  }

  const apiKey = process.env.SIMPLE_ANALYTICS_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Analytics not configured',
        message: 'SIMPLE_ANALYTICS_API_KEY is not set. Add it to your Netlify environment variables.',
      }),
    };
  }

  try {
    const baseUrl = 'https://simpleanalytics.com';
    const statsUrl = histogramInterval
      ? `${baseUrl}/${hostname}.json?version=5&start=${start}&end=${end}&info=false&fields=pageviews,visitors,seconds_on_page,histogram&interval=${histogramInterval}`
      : `${baseUrl}/${hostname}.json?version=5&start=${start}&end=${end}&info=false&fields=pageviews,visitors,seconds_on_page`;
    const pagesUrl = `${baseUrl}/${hostname}.json?version=5&start=${start}&end=${end}&info=false&fields=pages`;
    const referrersUrl = `${baseUrl}/${hostname}.json?version=5&start=${start}&end=${end}&info=false&fields=referrers`;

    const headers = {
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
    };

    const [statsRes, pagesRes, referrersRes] = await Promise.all([
      fetch(statsUrl, { headers }),
      fetch(pagesUrl, { headers }),
      fetch(referrersUrl, { headers }),
    ]);

    if (!statsRes.ok) {
      const text = await statsRes.text();
      console.error('SA API error:', statsRes.status, text);
      return {
        statusCode: statsRes.status,
        body: JSON.stringify({ error: `Simple Analytics API returned ${statsRes.status}` }),
      };
    }

    const stats = await statsRes.json();
    const pages = pagesRes.ok ? await pagesRes.json() : { pages: [] };
    const referrers = referrersRes.ok ? await referrersRes.json() : { referrers: [] };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=300',
      },
      body: JSON.stringify({
        pageviews: stats.pageviews ?? 0,
        visitors: stats.visitors ?? 0,
        seconds_on_page: stats.seconds_on_page ?? 0,
        pages: (pages.pages ?? []).slice(0, 20),
        referrers: (referrers.referrers ?? []).slice(0, 20),
        histogram: (stats.histogram ?? []).map((h: { date: string; pageviews?: number; visitors?: number }) => ({
          date: h.date,
          pageviews: h.pageviews ?? 0,
          visitors: h.visitors ?? 0,
        })),
      }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Analytics proxy error:', message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: message }),
    };
  }
}

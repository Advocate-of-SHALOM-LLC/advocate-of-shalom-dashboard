import type { Client } from '@libsql/client/web';
import { reportTimeZone } from './google';
import { cleanPath, mergePaths, servicesFrom } from './paths';
import config from '../../src/config/dashboard';
import { firstLighthouse, type LighthouseCheck } from './lighthouse';
import { monthDetail, monthVisits, simpleAnalyticsConfigured, trackingStartMonth } from './simple-analytics';
import { describeSources } from '../../src/lib/sources';

/**
 * The monthly report: a snapshot of one finished calendar month.
 *
 * Built once, after the month is over, and stored. A report that recalculated
 * every time it was opened would quietly change as the figures were revised,
 * and "what did September look like" should have one answer.
 *
 * Every source is optional. A section whose source isn't connected is left
 * out of the report, never shown as zero (OVERVIEW-STANDARD.md, 6.2).
 *
 * Ported from the RMWS reference. Differences: visits come from Simple
 * Analytics (this client's provider), submission kinds come from
 * config.submissionKinds, comparisons follow the small-number rule (4.4),
 * and figures that aren't measured are null rather than 0.
 */

export interface MonthlyReport {
  month: string;
  generatedAt: string;
  traffic: {
    /** How the figure is named on the page: GA4 engaged sessions are "real visits". */
    label: 'visits' | 'real visits';
    visits: number;
    /** Null when the month before predates tracking. */
    prevVisits: number | null;
    lastYearVisits: number | null;
    /** All hits before automated ones were left out; null when the provider doesn't say. */
    allVisits: number | null;
    avgSeconds: number | null;
    mobileShare: number | null;
    returningShare: number | null;
  } | null;
  /** Visits per day of the month. */
  series: { day: string; visits: number }[];
  /** Null when this client has no submissions inbox. */
  inquiries: {
    kinds: { kind: string; label: string; count: number; prev: number }[];
    /** Of this month's submissions, how many nobody has picked up yet. */
    stillNew: number;
    /** Null until the site sends tap events, so "not measured" never reads as zero. */
    phoneEmailTaps: number | null;
  } | null;
  pages: { path: string; visits: number }[];
  services: { name: string; visits: number }[];
  cities: { name: string; region: string; visits: number }[];
  sources: { source: string; medium: string; visits: number }[];
  search: {
    clicks: number;
    impressions: number;
    position: number | null;
    prevClicks: number;
    queries: { query: string; clicks: number; impressions: number; position: number }[];
  } | null;
  /**
   * The first Lighthouse test taken during the month — normally the scheduled
   * one on the 2nd. Each month therefore shows the site as it stood going into
   * that month. There is no way to test a past date, so months before the
   * first test have none.
   */
  lighthouse: LighthouseCheck | null;
  highlights: string[];
}

// ─── Dates ──────────────────────────────────────────────────────────────────

/** First and last day of a YYYY-MM month, as YYYY-MM-DD. */
export function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(new Date(Date.UTC(y, m - 1, 1))), end: iso(new Date(Date.UTC(y, m, 0))) };
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

/** The current month, in the report's timezone. */
export function currentMonth(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: reportTimeZone() }).format(now).slice(0, 7);
}

/** The month before the current one, in the report's timezone. */
export function lastCompleteMonth(now = new Date()): string {
  return shiftMonth(currentMonth(now), -1);
}

/**
 * Midnight at the start of a local date, as the UTC timestamp the database
 * stores. A month of submissions is counted in Colorado time, not UTC, or a
 * Friday-evening message would land in the next month.
 */
export function localMidnightUtc(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: reportTimeZone(),
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value])
  );
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess - (asLocal - guess)).toISOString().slice(0, 19).replace('T', ' ');
}

// ─── Visits ─────────────────────────────────────────────────────────────────

async function analytics(month: string) {
  if (!simpleAnalyticsConfigured()) return null;

  const { start, end } = monthBounds(month);
  const prev = shiftMonth(month, -1);
  const lastYear = shiftMonth(month, -12);
  const started = await trackingStartMonth(end);

  // A month before tracking began has no figure to compare against, and nor
  // does the month it began in: that one is partial (and for a new site,
  // usually a launch spike), so comparing with it would mislead.
  const measured = (m: string) => Boolean(started && m > started);
  const [detail, prevVisits, lastYearVisits] = await Promise.all([
    monthDetail(start, end),
    measured(prev) ? monthVisits(monthBounds(prev).start, monthBounds(prev).end) : Promise.resolve(null),
    measured(lastYear) ? monthVisits(monthBounds(lastYear).start, monthBounds(lastYear).end) : Promise.resolve(null),
  ]);

  const mergedPages = mergePaths(detail.pages);
  return {
    traffic: {
      label: 'visits' as const,
      visits: detail.visits,
      prevVisits,
      lastYearVisits,
      allVisits: null,
      avgSeconds: detail.avgSeconds,
      mobileShare: detail.mobileShare,
      returningShare: null,
    },
    series: detail.series,
    pages: [...mergedPages]
      .map(([path, count]) => ({ path: cleanPath(path), visits: count }))
      .filter((p) => p.visits > 0)
      .sort((x, y) => y.visits - x.visits)
      .slice(0, 8),
    services: servicesFrom(mergedPages, 6).map(({ name, visits: count }) => ({ name, visits: count })),
    sources: detail.sources.filter((s) => s.visits > 0),
  };
}

// ─── Submissions inbox ──────────────────────────────────────────────────────

async function inquiries(db: Client, month: string): Promise<MonthlyReport['inquiries']> {
  const kinds = config.submissionKinds ?? [];
  // No inbox yet: the section is left out rather than reporting zero.
  if (!kinds.length) return null;

  const count = async (m: string) => {
    const from = localMidnightUtc(monthBounds(m).start);
    const to = localMidnightUtc(monthBounds(shiftMonth(m, 1)).start);
    return (
      await db.execute({
        sql: `SELECT kind, status, COUNT(*) AS n FROM form_submissions
               WHERE client_id = ? AND created_at >= ? AND created_at < ?
               GROUP BY kind, status`,
        args: [config.clientId, from, to],
      })
    ).rows;
  };
  const [now, before] = await Promise.all([count(month), count(shiftMonth(month, -1))]);
  const sum = (rows: typeof now, pred: (r: (typeof now)[number]) => boolean) =>
    rows.filter(pred).reduce((total, r) => total + (Number(r.n) || 0), 0);

  return {
    kinds: kinds.map((k) => ({
      kind: k.kind,
      label: k.plural,
      count: sum(now, (r) => r.kind === k.kind),
      prev: sum(before, (r) => r.kind === k.kind),
    })),
    stillNew: sum(now, (r) => r.status === 'new'),
    phoneEmailTaps: null,
  };
}

// ─── Highlights ─────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * A change in words, following the standard's small-number rule (4.4):
 * percentages only when both figures are 20 or more, otherwise the earlier
 * count. '' when there is nothing to compare against.
 */
export function compare(now: number, before: number | null, against: string): string {
  if (before === null || (before === 0 && now === 0)) return before === null ? '' : `the same as ${against}`;
  if (now === before) return `the same as ${against}`;
  if (now >= 20 && before >= 20) {
    const pct = Math.round(((now - before) / before) * 100);
    if (Math.abs(pct) <= 5) return `about the same as ${against}`;
    return `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% on ${against}`;
  }
  return `${now > before ? 'up' : 'down'} from ${before.toLocaleString('en-US')} ${against}`;
}

/** Three to five plain sentences: the things worth knowing about the month. */
function highlights(r: Omit<MonthlyReport, 'highlights'>, monthName: string): string[] {
  const out: string[] = [];
  const t = r.traffic;

  if (t) {
    if (t.visits === 0) {
      out.push(`No visits were recorded in ${monthName}.`);
    } else {
      const comparisons = [
        compare(t.visits, t.prevVisits, 'the month before'),
        compare(t.visits, t.lastYearVisits, `${monthName} last year`),
      ].filter(Boolean);
      out.push(`${plural(t.visits, t.label.replace(/s$/, ''), t.label)} in ${monthName}${comparisons.length ? `, ${comparisons.join(' and ')}` : ''}.`);
    }
  }

  const e = r.inquiries;
  if (e) {
    const parts = e.kinds.map((k) => `${k.count.toLocaleString('en-US')} ${k.label}`);
    const sent = e.kinds.reduce((sum, k) => sum + k.count, 0);
    if (sent) {
      let line = `${parts.join(' and ')} came in through the website.`;
      if (e.stillNew) line += ` ${e.stillNew === 1 ? 'One is' : `${e.stillNew} are`} still marked New.`;
      out.push(line);
    } else {
      out.push('No forms were sent through the website this month.');
    }
  }

  if (r.services[0] && r.services[0].visits >= 3) {
    out.push(`${r.services[0].name} was the service people looked at most.`);
  }

  if (r.search && r.search.clicks) {
    const top = r.search.queries[0];
    out.push(`Google sent ${plural(r.search.clicks, 'click', 'clicks')}${top ? `; the top search was “${top.query}”` : ''}.`);
  } else if (r.cities[0]) {
    out.push(`Most visits came from around ${r.cities[0].name}, ${r.cities[0].region}.`);
  } else if (t && t.visits >= 5) {
    const top = describeSources(r.sources)[0];
    if (top && top.visits > t.visits / 2) {
      out.push(
        top.name === 'Direct'
          ? 'Most visitors came straight to the site: they typed the address, used a bookmark, or followed a link in an email.'
          : `Most visitors found the site through ${top.name}.`
      );
    }
  }

  const mobile = r.lighthouse?.mobile;
  if (mobile) {
    const verdict = mobile.scores.performance >= 90 ? 'fast' : mobile.scores.performance >= 50 ? 'reasonably quick' : 'slow';
    out.push(`On a phone the homepage scored ${mobile.scores.performance} out of 100 for speed in Google's test: ${verdict}.`);
  }
  return out.slice(0, 5);
}

// ─── Build and store ────────────────────────────────────────────────────────

export async function buildReport(db: Client, month: string): Promise<MonthlyReport> {
  // A failure in one source leaves its section out rather than losing the
  // whole month; the reason is in the function log.
  const settle = async <T>(label: string, task: Promise<T>): Promise<T | null> => {
    try {
      return await task;
    } catch (err) {
      console.error(`Monthly report ${month}: ${label} failed:`, err instanceof Error ? err.message : err);
      return null;
    }
  };
  const { start: lighthouseFrom, end: lighthouseTo } = monthBounds(month);

  const [visits, forms, lighthouse] = await Promise.all([
    settle('analytics', analytics(month)),
    settle('inquiries', inquiries(db, month)),
    settle('lighthouse', firstLighthouse(db, lighthouseFrom, lighthouseTo)),
  ]);

  const base: Omit<MonthlyReport, 'highlights'> = {
    month,
    generatedAt: new Date().toISOString(),
    traffic: visits?.traffic ?? null,
    series: visits?.series ?? [],
    inquiries: forms ?? null,
    pages: visits?.pages ?? [],
    services: visits?.services ?? [],
    cities: [],
    sources: visits?.sources ?? [],
    // Search Console needs a Google service account this client doesn't have yet.
    search: null,
    lighthouse: lighthouse ?? null,
  };
  const monthName = new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return { ...base, highlights: highlights(base, monthName) };
}

export async function reportExists(db: Client, month: string): Promise<boolean> {
  const row = (
    await db.execute({ sql: 'SELECT 1 FROM site_reports WHERE client_id = ? AND month = ?', args: [config.clientId, month] })
  ).rows[0];
  return Boolean(row);
}

export async function saveReport(db: Client, report: MonthlyReport): Promise<void> {
  await db.execute({
    sql: `INSERT INTO site_reports (client_id, month, data, generated_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT (client_id, month) DO UPDATE SET data = excluded.data, generated_at = excluded.generated_at`,
    args: [config.clientId, report.month, JSON.stringify(report)],
  });
}

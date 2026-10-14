/**
 * Site health checks shared by the monthly snapshot job.
 *
 * Fast checks (online, certificate, security headers, search files) take
 * well under a second. Google PageSpeed takes 10–20 seconds and sometimes
 * fails on Google's side, so it is run and stored separately.
 */
import tls from 'node:tls';

export type Status = 'good' | 'warn' | 'bad' | 'info';

export interface Check {
  id: string;
  label: string;
  status: Status;
  summary: string;
  /** 0–100 for Google PageSpeed categories, so months can be compared. */
  score?: number;
}

export interface HealthSnapshot {
  /** Calendar month the snapshot stands for, YYYY-MM (UTC). */
  month: string;
  url: string;
  checkedAt: string;
  checks: Check[];
  /** False until Google's speed test has succeeded for this month. */
  speedMeasured: boolean;
}

const TIMEOUT_MS = 6000;

const SECURITY_HEADERS: Array<[string, string]> = [
  ['strict-transport-security', 'always uses a secure connection'],
  ['content-security-policy', 'blocks unapproved scripts'],
  ['x-frame-options', 'can’t be framed by other sites'],
  ['x-content-type-options', 'files can’t be disguised'],
  ['referrer-policy', 'limits what other sites learn'],
  ['permissions-policy', 'camera and microphone off'],
];

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function checkOnline(siteUrl: string): Promise<{ check: Check; headers: Headers | null }> {
  const label = 'Website is online';
  const t = withTimeout(TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(siteUrl, { signal: t.signal, headers: { 'User-Agent': 'SiteHealthCheck/1.0' } });
    const ms = Date.now() - started;
    if (!res.ok) {
      return { check: { id: 'online', label, status: 'bad', summary: `The site answered with an error (${res.status}).` }, headers: res.headers };
    }
    const secs = (ms / 1000).toFixed(1);
    return {
      check: ms < 1500
        ? { id: 'online', label, status: 'good', summary: `Up and responding in ${secs} seconds.` }
        : { id: 'online', label, status: 'warn', summary: `Up, but slow to respond (${secs} seconds).` },
      headers: res.headers,
    };
  } catch {
    return { check: { id: 'online', label, status: 'bad', summary: 'The site didn’t respond within 6 seconds.' }, headers: null };
  } finally {
    t.done();
  }
}

function certificateExpiry(host: string): Promise<Date> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: TIMEOUT_MS }, () => {
      const cert = socket.getPeerCertificate();
      const authorized = socket.authorized;
      socket.end();
      if (!authorized || !cert?.valid_to) reject(new Error('Certificate not trusted'));
      else resolve(new Date(cert.valid_to));
    });
    socket.on('error', reject);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Timed out'));
    });
  });
}

async function checkSecureConnection(host: string): Promise<Check> {
  const label = 'Secure connection';
  let expires: Date;
  try {
    expires = await certificateExpiry(host);
  } catch {
    return { id: 'ssl', label, status: 'bad', summary: 'Browsers can’t confirm the site’s security certificate.' };
  }

  // Does plain http:// send visitors to the secure address?
  let redirects = false;
  const t = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(`http://${host}/`, { redirect: 'manual', signal: t.signal });
    redirects = res.status >= 300 && res.status < 400 && (res.headers.get('location') || '').startsWith('https://');
  } catch {
    /* treated as not redirecting */
  } finally {
    t.done();
  }

  const days = Math.floor((expires.getTime() - Date.now()) / 86_400_000);
  const until = expires.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (days < 0) return { id: 'ssl', label, status: 'bad', summary: `The security certificate expired on ${until}.` };
  if (!redirects) {
    return { id: 'ssl', label, status: 'warn', summary: `Certificate valid until ${until}, but http:// links don’t switch to the secure address.` };
  }
  if (days < 14) {
    return { id: 'ssl', label, status: 'warn', summary: `Certificate renews soon — valid until ${until}.` };
  }
  return { id: 'ssl', label, status: 'good', summary: `Certificate valid until ${until} and renews automatically.` };
}

function checkSecurityHeaders(headers: Headers | null): Check {
  const label = 'Security protections';
  if (!headers) return { id: 'headers', label, status: 'bad', summary: 'Couldn’t check — the site didn’t respond.' };
  const missing = SECURITY_HEADERS.filter(([name]) => !headers.get(name));
  const present = SECURITY_HEADERS.length - missing.length;
  if (missing.length === 0) {
    return { id: 'headers', label, status: 'good', summary: `All ${SECURITY_HEADERS.length} recommended browser protections are on.` };
  }
  return {
    id: 'headers',
    label,
    status: present >= 4 ? 'warn' : 'bad',
    summary: `${present} of ${SECURITY_HEADERS.length} recommended protections are on. Missing: ${missing.map(([, what]) => what).join('; ')}.`,
  };
}

async function checkSearchFiles(siteUrl: string): Promise<Check> {
  const label = 'Search engines can find your pages';
  const probe = async (path: string) => {
    const t = withTimeout(TIMEOUT_MS);
    try {
      const res = await fetch(new URL(path, siteUrl), { signal: t.signal });
      const type = res.headers.get('content-type') || '';
      // A single-page app answers every path with its HTML shell, so a 200
      // alone doesn't prove the file exists.
      return res.ok && !type.includes('text/html');
    } catch {
      return false;
    } finally {
      t.done();
    }
  };
  const [robots, sitemap] = await Promise.all([probe('/robots.txt'), probe('/sitemap.xml')]);
  if (robots && sitemap) {
    return { id: 'search', label, status: 'good', summary: 'Your sitemap and search-engine instructions are in place.' };
  }
  const missing = [!sitemap && 'sitemap', !robots && 'search-engine instructions (robots.txt)'].filter(Boolean).join(' and ');
  return { id: 'search', label, status: 'warn', summary: `Missing ${missing}, which help Google list every page.` };
}

/** Run the fast server checks against https://{host}/. */
export async function runSiteChecks(host: string): Promise<Check[]> {
  const siteUrl = `https://${host}/`;
  const [online, ssl, search] = await Promise.all([
    checkOnline(siteUrl),
    checkSecureConnection(host),
    checkSearchFiles(siteUrl),
  ]);
  return [online.check, ssl, checkSecurityHeaders(online.headers), search];
}

// Google's own score bands: 90+ good, 50–89 needs improvement, under 50 poor.
function band(score: number): Status {
  if (score >= 90) return 'good';
  if (score >= 50) return 'warn';
  return 'bad';
}

/**
 * Google PageSpeed (phone) scores as checks. Throws when Google can't
 * measure the page — the caller keeps the rest of the snapshot and retries
 * on a later run.
 */
export async function runSpeedChecks(siteUrl: string, apiKey: string, timeoutMs = 25_000): Promise<Check[]> {
  const params = new URLSearchParams({ url: siteUrl, strategy: 'mobile', key: apiKey });
  for (const c of ['performance', 'accessibility', 'seo']) params.append('category', c);

  const t = withTimeout(timeoutMs);
  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, { signal: t.signal });
    if (!res.ok) throw new Error(`PageSpeed returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const cats = data.lighthouseResult?.categories ?? {};
    const score = (key: string) => Math.round((cats[key]?.score ?? 0) * 100);
    const lcpMs = data.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue;
    const lcp = typeof lcpMs === 'number' ? ` The main content takes ${(lcpMs / 1000).toFixed(1)} seconds to appear on a phone.` : '';

    const speed = score('performance');
    const a11y = score('accessibility');
    const seo = score('seo');
    return [
      { id: 'speed', label: 'Speed on phones', status: band(speed), score: speed, summary: `Scores ${speed} out of 100 on Google’s phone speed test.${lcp}` },
      { id: 'a11y', label: 'Easy for everyone to use', status: band(a11y), score: a11y, summary: `Scores ${a11y} out of 100 on Google’s accessibility test.` },
      { id: 'seo', label: 'Search-friendly pages', status: band(seo), score: seo, summary: `Scores ${seo} out of 100 on Google’s search basics test.` },
    ];
  } finally {
    t.done();
  }
}

export const SPEED_CHECK_IDS = ['speed', 'a11y', 'seo'];
export const SNAPSHOT_STORE = 'site-health';

/**
 * Site health check — on-demand checks of the client's live website.
 *
 * Runs the fast server-side checks (is the site up, certificate, security
 * headers, search-engine files). The Google PageSpeed scores take 10–20
 * seconds, longer than a Netlify function may run, so the dashboard
 * requests those from the browser instead.
 *
 * Always checks the domain in the dashboard config — never a URL from the
 * request — so this can't be used to probe other sites.
 */
import tls from 'node:tls';
import config from '../../src/config/dashboard';

type Status = 'good' | 'warn' | 'bad';

interface Check {
  id: string;
  label: string;
  status: Status;
  summary: string;
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

export async function handler(event: { httpMethod: string; headers: Record<string, string> }) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Presence-only Auth0 gate — same pattern as the billing functions.
  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const host = config.clientDomain;
  const siteUrl = `https://${host}/`;

  try {
    const [online, ssl, search] = await Promise.all([
      checkOnline(siteUrl),
      checkSecureConnection(host),
      checkSearchFiles(siteUrl),
    ]);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        success: true,
        url: siteUrl,
        checkedAt: new Date().toISOString(),
        checks: [online.check, ssl, checkSecurityHeaders(online.headers), search],
      }),
    };
  } catch (err) {
    console.error('Site health check error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Health check failed' }) };
  }
}

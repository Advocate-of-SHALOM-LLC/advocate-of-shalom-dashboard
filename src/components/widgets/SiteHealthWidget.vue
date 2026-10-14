<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuth0 } from '@auth0/auth0-vue';
import { HeartPulse, CheckCircle2, AlertTriangle, XOctagon, Info, Loader2, RefreshCw } from 'lucide-vue-next';
import config from '@/config/dashboard';

// On-demand health check of the live website. Nothing is stored — each run
// is a fresh look. Server checks (uptime, certificate, protections, search
// files) come from the site-health-check function; Google PageSpeed scores
// are requested from the browser because they take longer than a Netlify
// function is allowed to run.

type Status = 'good' | 'warn' | 'bad' | 'info';

interface Check {
  id: string;
  label: string;
  status: Status;
  summary: string;
}

const { getAccessTokenSilently } = useAuth0();
const pageSpeedKey = import.meta.env.VITE_GOOGLE_PAGESPEED_API_KEY;
const siteUrl = `https://${config.clientDomain}/`;

const phase = ref<'idle' | 'running' | 'done'>('idle');
const serverChecks = ref<Check[] | null>(null);
const speedChecks = ref<Check[] | null>(null);
const serverLoading = ref(false);
const speedLoading = ref(false);
const checkedAt = ref<Date | null>(null);

const PLACEHOLDER_SERVER: Check[] = [
  { id: 'online', label: 'Website is online', status: 'info', summary: '' },
  { id: 'ssl', label: 'Secure connection', status: 'info', summary: '' },
  { id: 'headers', label: 'Security protections', status: 'info', summary: '' },
  { id: 'search', label: 'Search engines can find your pages', status: 'info', summary: '' },
];

const PLACEHOLDER_SPEED: Check[] = [
  { id: 'speed', label: 'Speed on phones', status: 'info', summary: '' },
  { id: 'a11y', label: 'Easy for everyone to use', status: 'info', summary: '' },
  { id: 'seo', label: 'Search-friendly pages', status: 'info', summary: '' },
];

// Google's own score bands: 90+ good, 50–89 needs improvement, under 50 poor.
function band(score: number): Status {
  if (score >= 90) return 'good';
  if (score >= 50) return 'warn';
  return 'bad';
}

async function runServerChecks() {
  serverLoading.value = true;
  try {
    const token = await getAccessTokenSilently();
    const res = await fetch('/.netlify/functions/site-health-check', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = res.ok ? await res.json() : null;
    if (!data?.checks) throw new Error(`site-health-check returned ${res.status}`);
    serverChecks.value = data.checks;
  } catch (err) {
    console.error('Site health check failed:', err);
    serverChecks.value = [
      { id: 'server', label: 'Website checks', status: 'bad', summary: 'We couldn’t run these checks right now. Please try again in a minute.' },
    ];
  } finally {
    serverLoading.value = false;
  }
}

async function runSpeedChecks() {
  if (!pageSpeedKey) {
    speedChecks.value = [
      { id: 'speed', label: 'Speed and accessibility', status: 'info', summary: 'Google’s speed test isn’t set up for this dashboard yet.' },
    ];
    return;
  }

  speedLoading.value = true;
  try {
    const params = new URLSearchParams({ url: siteUrl, strategy: 'mobile', key: pageSpeedKey });
    for (const c of ['performance', 'accessibility', 'seo']) params.append('category', c);
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`);
    if (!res.ok) throw new Error(`PageSpeed returned ${res.status}`);

    const data = await res.json();
    const cats = data.lighthouseResult?.categories ?? {};
    const score = (key: string) => Math.round((cats[key]?.score ?? 0) * 100);
    const lcpMs = data.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue;
    const lcp = typeof lcpMs === 'number' ? ` The main content takes ${(lcpMs / 1000).toFixed(1)} seconds to appear on a phone.` : '';

    const speed = score('performance');
    const a11y = score('accessibility');
    const seo = score('seo');
    speedChecks.value = [
      { id: 'speed', label: 'Speed on phones', status: band(speed), summary: `Scores ${speed} out of 100 on Google’s phone speed test.${lcp}` },
      { id: 'a11y', label: 'Easy for everyone to use', status: band(a11y), summary: `Scores ${a11y} out of 100 on Google’s accessibility test.` },
      { id: 'seo', label: 'Search-friendly pages', status: band(seo), summary: `Scores ${seo} out of 100 on Google’s search basics test.` },
    ];
  } catch (err) {
    console.error('PageSpeed check failed:', err);
    speedChecks.value = [
      { id: 'speed', label: 'Speed and accessibility', status: 'info', summary: 'Google’s speed test didn’t respond. Run the check again in a few minutes.' },
    ];
  } finally {
    speedLoading.value = false;
  }
}

async function runCheck() {
  if (phase.value === 'running') return;
  phase.value = 'running';
  serverChecks.value = null;
  speedChecks.value = null;
  await Promise.all([runServerChecks(), runSpeedChecks()]);
  checkedAt.value = new Date();
  phase.value = 'done';
}

// Rows render as soon as each half finishes; the other half shows
// placeholders with a spinner until it arrives.
const rows = computed(() => [
  ...(serverChecks.value ?? PLACEHOLDER_SERVER.map((c) => ({ ...c, pending: true }))),
  ...(speedChecks.value ?? (speedLoading.value ? PLACEHOLDER_SPEED.map((c) => ({ ...c, pending: true })) : [])),
] as Array<Check & { pending?: boolean }>);

const scored = computed(() => rows.value.filter((r) => !r.pending && r.status !== 'info'));
const goodCount = computed(() => scored.value.filter((r) => r.status === 'good').length);
const attentionCount = computed(() => scored.value.filter((r) => r.status === 'bad').length);

const summary = computed(() => {
  const total = scored.value.length;
  if (!total) return '';
  if (goodCount.value === total) return `All ${total} checks look good.`;
  const attention = attentionCount.value ? ` ${attentionCount.value} need${attentionCount.value === 1 ? 's' : ''} attention.` : '';
  return `${goodCount.value} of ${total} checks look good.${attention}`;
});

const checkedAtLabel = computed(() =>
  checkedAt.value
    ? checkedAt.value.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : ''
);

const statusIcon = { good: CheckCircle2, warn: AlertTriangle, bad: XOctagon, info: Info } as const;
</script>

<template>
  <div class="widget health">
    <h2 class="widget__title"><HeartPulse :size="18" /> Site Health</h2>

    <div v-if="phase === 'idle'" class="health__intro">
      <p>
        Check that {{ config.clientDomain }} is up, secure, and quick to load.
        It takes about 20 seconds.
      </p>
      <button type="button" class="health__btn" @click="runCheck">
        <HeartPulse :size="16" aria-hidden="true" />
        Run health check
      </button>
    </div>

    <template v-else>
      <p class="health__summary" role="status" aria-live="polite">
        <template v-if="phase === 'running'">Checking your site…</template>
        <template v-else>{{ summary }} <span class="health__when">Checked {{ checkedAtLabel }}</span></template>
      </p>

      <ul class="health__list">
        <li v-for="row in rows" :key="row.id" class="health__row">
          <Loader2 v-if="row.pending" :size="18" class="health__icon health__icon--pending widget__spinner" aria-hidden="true" />
          <component
            :is="statusIcon[row.status]"
            v-else
            :size="18"
            class="health__icon"
            :class="`health__icon--${row.status}`"
            aria-hidden="true"
          />
          <div class="health__text">
            <span class="health__label">{{ row.label }}</span>
            <span v-if="row.pending" class="health__detail">Checking…</span>
            <span v-else class="health__detail">{{ row.summary }}</span>
          </div>
        </li>
      </ul>

      <button v-if="phase === 'done'" type="button" class="health__again" @click="runCheck">
        <RefreshCw :size="14" aria-hidden="true" />
        Run again
      </button>
    </template>
  </div>
</template>

<style scoped>
.widget {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  padding: 1.25rem;
}

/* Full width: the result list reads better as one wide column */
.health {
  grid-column: 1 / -1;
}

.widget__title {
  font-size: 1rem;
  font-family: var(--font-heading);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  color: var(--color-text);
}

.health__intro {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
}

.health__intro p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-secondary, var(--color-text));
  max-width: 60ch;
}

.health__btn,
.health__again {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: var(--border-radius);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.health__btn {
  padding: 0.625rem 1rem;
  border: none;
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
}

.health__again {
  margin-top: 1rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
}

.health__btn:hover,
.health__again:hover {
  opacity: 0.85;
}

.health__summary {
  margin: 0 0 0.75rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text);
}

.health__when {
  font-weight: 400;
  font-size: 0.8125rem;
  color: var(--color-text-secondary, var(--color-text));
  margin-left: 0.25rem;
}

.health__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.5rem;
}

.health__row {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.75rem;
  border-radius: var(--border-radius);
  background-color: var(--color-bg);
}

.health__icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.health__icon--good { color: #16a34a; }
.health__icon--warn { color: #d97706; }
.health__icon--bad { color: #dc2626; }
.health__icon--info,
.health__icon--pending { color: var(--color-text-secondary, var(--color-text)); }

.health__text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.health__label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
}

.health__detail {
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--color-text-secondary, var(--color-text));
}

.widget__spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .widget__spinner { animation: none; }
}
</style>

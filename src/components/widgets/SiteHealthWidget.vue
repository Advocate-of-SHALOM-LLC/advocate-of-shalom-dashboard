<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAuth0 } from '@auth0/auth0-vue';
import {
  HeartPulse,
  CheckCircle2,
  AlertTriangle,
  XOctagon,
  Info,
  Loader2,
  ArrowUp,
  ArrowDown,
} from 'lucide-vue-next';
import config from '@/config/dashboard';

// Monthly site health snapshot. The site-health-monthly job checks the
// live site on the 1st of each month and stores the result; this widget
// shows the latest month and what changed since the month before.

type Status = 'good' | 'warn' | 'bad' | 'info';

interface Check {
  id: string;
  label: string;
  status: Status;
  summary: string;
  score?: number;
}

interface HealthSnapshot {
  month: string;
  checkedAt: string;
  checks: Check[];
  speedMeasured: boolean;
}

const { getAccessTokenSilently } = useAuth0();

const loading = ref(true);
const failed = ref(false);
const latest = ref<HealthSnapshot | null>(null);
const previous = ref<HealthSnapshot | null>(null);

async function fetchSnapshot() {
  loading.value = true;
  failed.value = false;
  try {
    const token = await getAccessTokenSilently();
    const res = await fetch('/.netlify/functions/get-site-health', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = res.ok ? await res.json() : null;
    if (!data?.success) throw new Error(`get-site-health returned ${res.status}`);
    latest.value = data.latest ?? null;
    previous.value = data.previous ?? null;
  } catch (err) {
    console.error('Site health load failed:', err);
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(fetchSnapshot);

function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const checkedLabel = computed(() =>
  latest.value
    ? new Date(latest.value.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : ''
);

const SPEED_IDS = ['speed', 'a11y', 'seo'];

// Score change since last month, for the Google PageSpeed rows.
function change(check: Check): { dir: 'up' | 'down'; from: number } | null {
  if (check.score === undefined) return null;
  const before = previous.value?.checks.find((c) => c.id === check.id)?.score;
  if (before === undefined || before === check.score) return null;
  return { dir: check.score > before ? 'up' : 'down', from: before };
}

const scored = computed(() => (latest.value?.checks ?? []).filter((c) => c.status !== 'info'));
const goodCount = computed(() => scored.value.filter((c) => c.status === 'good').length);
const attentionCount = computed(() => scored.value.filter((c) => c.status === 'bad').length);

const summary = computed(() => {
  const total = scored.value.length;
  if (!total) return '';
  if (goodCount.value === total) return `All ${total} checks look good.`;
  const attention = attentionCount.value
    ? ` ${attentionCount.value} need${attentionCount.value === 1 ? 's' : ''} attention.`
    : '';
  return `${goodCount.value} of ${total} checks look good.${attention}`;
});

// Speed scores arrive separately; until then, say so instead of leaving a gap.
const speedPending = computed(
  () => !!latest.value && !latest.value.speedMeasured && !latest.value.checks.some((c) => SPEED_IDS.includes(c.id))
);

const statusIcon = { good: CheckCircle2, warn: AlertTriangle, bad: XOctagon, info: Info } as const;
</script>

<template>
  <div class="widget health">
    <h2 class="widget__title"><HeartPulse :size="18" /> Site Health</h2>

    <div v-if="loading" class="health__state" role="status" aria-live="polite">
      <Loader2 :size="18" class="widget__spinner" aria-hidden="true" />
      <span>Loading this month’s check…</span>
    </div>

    <p v-else-if="failed" class="health__state" role="alert">
      We couldn’t load your site health check. Refresh the page to try again.
    </p>

    <p v-else-if="!latest" class="health__state">
      Each month we check that {{ config.clientDomain }} is up, secure, and quick to load.
      Your first check will appear here within a day.
    </p>

    <template v-else>
      <p class="health__summary">
        {{ monthLabel(latest.month) }}: {{ summary }}
        <span class="health__when">Checked {{ checkedLabel }}</span>
      </p>

      <ul class="health__list">
        <li v-for="check in latest.checks" :key="check.id" class="health__row">
          <component
            :is="statusIcon[check.status]"
            :size="18"
            class="health__icon"
            :class="`health__icon--${check.status}`"
            aria-hidden="true"
          />
          <div class="health__text">
            <span class="health__label">
              {{ check.label }}
              <span
                v-if="change(check)"
                class="health__change"
                :class="`health__change--${change(check)!.dir}`"
              >
                <ArrowUp v-if="change(check)!.dir === 'up'" :size="12" aria-hidden="true" />
                <ArrowDown v-else :size="12" aria-hidden="true" />
                {{ change(check)!.dir === 'up' ? 'up' : 'down' }} from {{ change(check)!.from }} last month
              </span>
            </span>
            <span class="health__detail">{{ check.summary }}</span>
          </div>
        </li>
        <li v-if="speedPending" class="health__row">
          <Info :size="18" class="health__icon health__icon--info" aria-hidden="true" />
          <div class="health__text">
            <span class="health__label">Speed on phones</span>
            <span class="health__detail">Google’s speed test is still running for this month. Scores will appear within a day.</span>
          </div>
        </li>
      </ul>

      <p class="health__note">Checked automatically on the 1st of each month.</p>
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

/* Full width: the result list reads better as one wide block */
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

.health__state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-secondary, var(--color-text));
  max-width: 65ch;
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
.health__icon--info { color: var(--color-text-secondary, var(--color-text)); }

.health__text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.health__label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
}

.health__change {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.health__change--up { color: #16a34a; }
.health__change--down { color: #dc2626; }

.health__detail {
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--color-text-secondary, var(--color-text));
}

.health__note {
  margin: 0.75rem 0 0;
  font-size: 0.75rem;
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

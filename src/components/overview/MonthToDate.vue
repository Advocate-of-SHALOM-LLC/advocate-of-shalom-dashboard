<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { Activity, Loader2 } from 'lucide-vue-next';
import type { MonthToDate } from '@/composables/useOverview';
import { changeWords, changeDirection, monthName } from '@/composables/useReports';

/**
 * The live half of the overview: this month so far, set against the same
 * days of last month (OVERVIEW-STANDARD.md 3.3). The monthly report below is
 * the settled version of this.
 */
const props = defineProps<{ month: MonthToDate | null; state: 'loading' | 'ready' | 'none' }>();

const title = new Date().toLocaleDateString('en-US', { month: 'long' });

const visits = computed(() => props.month?.current.visits ?? 0);
const note = computed(() =>
  props.month?.previous ? changeWords(visits.value, props.month.previous.visits, 'by this point last month') : ''
);
const dir = computed(() => (props.month?.previous ? changeDirection(visits.value, props.month.previous.visits) : 'flat'));

/** Bar heights for the sparkline, scaled to the busiest day. */
const bars = computed(() => {
  const series = props.month?.series ?? [];
  const max = Math.max(1, ...series.map((p) => p.visits));
  return series.map((p) => ({ key: p.key, visits: p.visits, height: p.visits ? Math.max(8, (p.visits / max) * 100) : 4 }));
});

const summary = computed(() => {
  const series = props.month?.series ?? [];
  const visited = series.filter((p) => p.visits > 0);
  if (!series.length) return '';
  if (!visited.length) return `No visits recorded yet this month.`;
  const peak = visited.reduce((a, b) => (b.visits > a.visits ? b : a));
  const day = new Date(`${peak.key}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return `Visits on ${visited.length} of ${series.length} days so far; busiest ${day}, with ${peak.visits}.`;
});

const formatDuration = (seconds: number) =>
  seconds < 60 ? `${Math.round(seconds)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;

// Context beneath the number: only what this client actually measures.
const stats = computed(() => {
  const m = props.month;
  if (!m) return [];
  return [
    ...(m.lastMonth ? [{ label: `All of ${monthName(m.lastMonth.month).split(' ')[0]}`, value: `${m.lastMonth.visits.toLocaleString()} ${m.label}` }] : []),
    ...(m.current.avgSeconds !== null ? [{ label: 'Avg. time per visit', value: formatDuration(m.current.avgSeconds) }] : []),
  ];
});
</script>

<template>
  <section class="card mtd" aria-labelledby="mtd-title">
    <div class="card__head">
      <h2 id="mtd-title" class="card__title"><Activity :size="18" aria-hidden="true" /> {{ title }} so far</h2>
      <RouterLink to="/analytics" class="card__link">Site analytics &rarr;</RouterLink>
    </div>

    <div v-if="state === 'loading'" class="card__empty mtd__loading" role="status">
      <Loader2 :size="16" class="mtd__spin" aria-hidden="true" /> Loading this month's figures…
    </div>

    <p v-else-if="!month" class="card__empty">Visitor figures appear here once analytics is connected.</p>

    <template v-else>
      <div class="mtd__body">
        <div class="mtd__headline">
          <span class="mtd__number">{{ visits.toLocaleString() }}</span>
          <span class="mtd__label">{{ visits === 1 ? month.label.replace(/s$/, '') : month.label }} this month</span>
          <span v-if="note" class="mtd__change" :class="`mtd__change--${dir}`">{{ note }}</span>
        </div>

        <div v-if="bars.length" class="mtd__spark" aria-hidden="true">
          <span
            v-for="(bar, i) in bars"
            :key="bar.key"
            class="mtd__bar"
            :class="{ 'mtd__bar--today': i === bars.length - 1, 'mtd__bar--none': !bar.visits }"
            :style="{ height: `${bar.height}%` }"
            :title="`${bar.key}: ${bar.visits}`"
          ></span>
        </div>
      </div>
      <p v-if="summary" class="sr-only">{{ summary }}</p>

      <dl v-if="stats.length" class="mtd__stats">
        <div v-for="stat in stats" :key="stat.label" class="mtd__stat">
          <dt>{{ stat.label }}</dt>
          <dd>{{ stat.value }}</dd>
        </div>
      </dl>
    </template>
  </section>
</template>

<style scoped>
.mtd__loading { display: flex; align-items: center; gap: 0.5rem; }
.mtd__spin { animation: mtd-spin 1s linear infinite; }
@keyframes mtd-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .mtd__spin { animation: none; } }

.mtd__body { display: grid; grid-template-columns: minmax(0, auto) minmax(0, 1fr); align-items: end; gap: 1.75rem; }
.mtd__headline { display: flex; flex-direction: column; }
.mtd__number {
  font-family: var(--font-heading); font-size: clamp(2.5rem, 2rem + 1.6vw, 3.25rem); font-weight: 700; line-height: 1;
  color: var(--color-text); letter-spacing: -0.02em; font-variant-numeric: tabular-nums;
}
.mtd__label { margin-top: 0.4rem; font-size: 0.875rem; color: var(--color-text-secondary); }
.mtd__change { margin-top: 0.3rem; font-size: 0.8125rem; font-weight: 600; color: var(--color-text-secondary); }
.mtd__change--up { color: var(--color-up); }
.mtd__change--down { color: var(--color-down); }

.mtd__spark { display: flex; align-items: flex-end; gap: 3px; height: 80px; }
.mtd__bar { flex: 1; min-width: 3px; max-width: 18px; border-radius: 3px 3px 1px 1px; background-color: var(--color-primary); opacity: 0.85; }
.mtd__bar--none { background-color: var(--color-border); opacity: 1; }
/* Today isn't over yet. */
.mtd__bar--today { opacity: 0.45; }

.mtd__stats {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem;
  margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--color-border);
}
.mtd__stat dt { font-size: 0.75rem; color: var(--color-text-secondary); }
.mtd__stat dd { margin-top: 0.15rem; font-family: var(--font-heading); font-size: 1.125rem; font-weight: 700; color: var(--color-text); }

@media (max-width: 560px) {
  .mtd__body { grid-template-columns: 1fr; gap: 1rem; }
}
</style>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { Gauge } from 'lucide-vue-next';
import type { LighthouseCheck } from '@/types/report';

/**
 * The latest Google Lighthouse test of the homepage, on a phone and on a
 * computer (OVERVIEW-STANDARD.md 3.6). Taken monthly by lighthouse-check; the
 * same test appears in that month's report. From the RMWS reference.
 */
const props = defineProps<{ lighthouse: LighthouseCheck | null; state: 'loading' | 'ready' | 'error' }>();

const LABELS = [
  ['performance', 'Speed'],
  ['accessibility', 'Access'],
  ['bestPractices', 'Practices'],
  ['seo', 'Search'],
] as const;

// Lighthouse's own bands: 90 and up is good, below 50 is poor.
const band = (score: number) => (score >= 90 ? 'good' : score >= 50 ? 'needs-work' : 'poor');

const runs = computed(() =>
  [
    ['On a phone', props.lighthouse?.mobile],
    ['On a computer', props.lighthouse?.desktop],
  ].filter((r): r is [string, NonNullable<LighthouseCheck['mobile']>] => Boolean(r[1]))
);

const tested = computed(() =>
  props.lighthouse
    ? new Date(props.lighthouse.checkedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : ''
);
</script>

<template>
  <section class="card" aria-labelledby="health-title">
    <div class="card__head">
      <h2 id="health-title" class="card__title"><Gauge :size="18" aria-hidden="true" /> Site health</h2>
      <RouterLink v-if="runs.length" to="/reports" class="card__link">In the report &rarr;</RouterLink>
    </div>

    <p v-if="state === 'loading'" class="card__empty" role="status">Loading…</p>
    <p v-else-if="state === 'error'" class="card__empty" role="alert">Site health could not be loaded just now.</p>
    <p v-else-if="!runs.length" class="card__empty">
      Google's speed and quality test runs early each month; results will show here.
    </p>

    <template v-else>
      <div v-for="[label, run] in runs" :key="label" class="health__run">
        <p class="health__label">{{ label }}</p>
        <ul class="health__scores">
          <li v-for="[key, name] in LABELS" :key="key" :class="`health__score health__score--${band(run.scores[key])}`">
            <span class="health__value">{{ run.scores[key] }}</span>
            <span class="health__name">{{ name }}</span>
          </li>
        </ul>
      </div>
      <p class="health__foot">Google Lighthouse, out of 100 · tested {{ tested }}</p>
    </template>
  </section>
</template>

<style scoped>
.health__run + .health__run { margin-top: 1rem; }
.health__label { margin: 0 0 0.45rem; font-size: 0.75rem; font-weight: 600; color: var(--color-text-secondary); }
.health__scores { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.4rem; }
.health__score { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; }
/* A ring in the band's color: Lighthouse's own way of showing a score. */
.health__value {
  display: grid; place-items: center; width: 2.75rem; height: 2.75rem; border-radius: 50%;
  border: 3px solid currentColor; font-size: 0.9375rem; font-weight: 700; font-variant-numeric: tabular-nums;
}
.health__name { font-size: 0.6875rem; color: var(--color-text-secondary); }
.health__score--good { color: var(--color-up); }
.health__score--needs-work { color: var(--color-warn); }
.health__score--poor { color: var(--color-down); }
.health__foot { margin: 1rem 0 0; font-size: 0.75rem; color: var(--color-text-secondary); }
</style>

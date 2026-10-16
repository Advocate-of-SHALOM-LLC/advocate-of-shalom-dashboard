<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { Gauge } from 'lucide-vue-next';
import { useApi } from '@/composables/useApi';
import type { LighthouseCheck } from '@/types/report';

/**
 * The latest Google Lighthouse test of the homepage, on a phone and on a
 * computer (OVERVIEW-STANDARD.md, 3.6). Taken monthly by lighthouse-check;
 * the same test appears in that month's report.
 *
 * From the RMWS reference's SiteHealth card, loading its own data and using
 * the template's widget styling.
 */
const api = useApi();
const loaded = ref(false);
const failed = ref(false);
const lighthouse = ref<LighthouseCheck | null>(null);

onMounted(async () => {
  try {
    const res = await api('site-health');
    const data = res.ok ? await res.json() : null;
    if (!data) throw new Error(`site-health returned ${res.status}`);
    lighthouse.value = data.lighthouse ?? null;
  } catch (err) {
    console.error('Site health load failed:', err);
    failed.value = true;
  } finally {
    loaded.value = true;
  }
});

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
    ['On a phone', lighthouse.value?.mobile],
    ['On a computer', lighthouse.value?.desktop],
  ].filter((r): r is [string, NonNullable<LighthouseCheck['mobile']>] => Boolean(r[1]))
);

const tested = computed(() =>
  lighthouse.value
    ? new Date(lighthouse.value.checkedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : ''
);
</script>

<template>
  <section class="widget" aria-labelledby="health-title">
    <div class="health__head">
      <h2 id="health-title" class="widget__title"><Gauge :size="18" aria-hidden="true" /> Site health</h2>
      <RouterLink v-if="runs.length" to="/reports" class="health__link">In the report &rarr;</RouterLink>
    </div>

    <p v-if="!loaded" class="health__empty" role="status">Loading…</p>
    <p v-else-if="failed" class="health__empty" role="alert">Site health could not be loaded just now.</p>
    <p v-else-if="!runs.length" class="health__empty">
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
.widget {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  padding: 1.25rem;
}

.widget__title {
  font-size: 1rem;
  font-family: var(--font-heading);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  color: var(--color-text);
}

.health__head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 0.25rem 1rem; margin-bottom: 1rem; }
.health__link { font-size: 0.8125rem; font-weight: 600; color: var(--color-primary); text-decoration: none; }
.health__link:hover { text-decoration: underline; }
.health__empty { margin: 0; font-size: 0.875rem; color: var(--color-text-secondary, var(--color-text)); }

.health__run + .health__run { margin-top: 0.9rem; }
.health__label { margin: 0 0 0.4rem; font-size: 0.75rem; font-weight: 600; color: var(--color-text-secondary, var(--color-text)); }
.health__scores { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.4rem; }
.health__score { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; }
/* A ring in the band's color: Lighthouse's own way of showing a score. */
.health__value {
  display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: 50%;
  border: 3px solid currentColor; font-size: 0.875rem; font-weight: 700; font-variant-numeric: tabular-nums;
}
.health__name { font-size: 0.6875rem; color: var(--color-text-secondary, var(--color-text)); }
.health__score--good { color: var(--color-up); }
.health__score--needs-work { color: var(--color-warn); }
.health__score--poor { color: var(--color-down); }
.health__foot { margin: 0.9rem 0 0; font-size: 0.75rem; color: var(--color-text-secondary, var(--color-text)); }
</style>

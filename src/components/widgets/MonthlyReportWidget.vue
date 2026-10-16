<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { FileBarChart, Loader2 } from 'lucide-vue-next';
import { useReports, monthName, nextReportDate, changeWords, changeDirection } from '@/composables/useReports';

/**
 * Last month at a glance, on the overview. The live analytics page answers
 * "what is happening"; this answers "how did last month go", and stays the
 * same all month so it can be read, shared and referred back to.
 *
 * From the RMWS reference, with tiles for whatever this client measures
 * (OVERVIEW-STANDARD.md, 3.4) and the template's widget styling.
 */
const { state, report, load } = useReports();

const formatDuration = (seconds: number) =>
  seconds < 60 ? `${Math.round(seconds)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Dir = 'up' | 'down' | 'flat';
interface Tile { label: string; value: string; note: string; dir: Dir }

const tiles = computed<Tile[]>(() => {
  const r = report.value;
  if (!r) return [];
  const t = r.traffic;
  const out: Tile[] = [];

  if (t) {
    out.push({ label: capitalize(t.label), value: t.visits.toLocaleString(), note: changeWords(t.visits, t.prevVisits, 'the month before'), dir: changeDirection(t.visits, t.prevVisits) });
  }
  for (const k of r.inquiries?.kinds ?? []) {
    out.push({ label: capitalize(k.label), value: k.count.toLocaleString(), note: changeWords(k.count, k.prev, 'the month before'), dir: changeDirection(k.count, k.prev) });
  }

  // Fill the row with the best of what else was measured.
  const extras: Tile[] = [];
  const speed = r.lighthouse?.mobile?.scores.performance;
  if (speed !== undefined) {
    extras.push({
      label: 'Phone speed score',
      value: `${speed}/100`,
      note: speed >= 90 ? 'Good' : speed >= 50 ? 'Needs work' : 'Poor',
      dir: speed >= 90 ? 'up' : speed >= 50 ? 'flat' : 'down',
    });
  }
  if (r.search) {
    extras.push({ label: 'Clicks from Google', value: r.search.clicks.toLocaleString(), note: changeWords(r.search.clicks, r.search.prevClicks, 'the month before'), dir: changeDirection(r.search.clicks, r.search.prevClicks) });
  }
  if (t?.avgSeconds !== null && t?.avgSeconds !== undefined) {
    extras.push({ label: 'Avg. time per visit', value: formatDuration(t.avgSeconds), note: '', dir: 'flat' });
  }
  if (t?.mobileShare !== null && t?.mobileShare !== undefined) {
    extras.push({ label: 'On a phone', value: `${t.mobileShare}%`, note: `of ${t.label}`, dir: 'flat' });
  }
  return [...out, ...extras].slice(0, 4);
});

onMounted(() => load());
</script>

<template>
  <section class="widget report-card" aria-labelledby="report-card-title">
    <header class="report-card__head">
      <h2 id="report-card-title" class="widget__title">
        <FileBarChart :size="18" aria-hidden="true" />
        <template v-if="report">{{ monthName(report.month) }} report</template>
        <template v-else>Monthly report</template>
      </h2>
      <RouterLink v-if="report" to="/reports" class="report-card__link">Full report &rarr;</RouterLink>
    </header>

    <div v-if="state === 'loading'" class="report-card__status" role="status">
      <Loader2 :size="18" class="report-card__spin" aria-hidden="true" /> Loading…
    </div>

    <p v-else-if="state === 'empty' || state === 'setup'" class="report-card__status">
      Your first monthly report will appear here early next month.
    </p>

    <p v-else-if="state === 'error'" class="report-card__status" role="alert">The report could not be loaded just now.</p>

    <template v-else-if="report">
      <div v-if="tiles.length" class="report-card__tiles">
        <div v-for="tile in tiles" :key="tile.label" class="report-card__tile">
          <span class="report-card__tile-label">{{ tile.label }}</span>
          <span class="report-card__tile-value">{{ tile.value }}</span>
          <span
            v-if="tile.note"
            class="report-card__tile-note"
            :class="{ 'report-card__tile-note--up': tile.dir === 'up', 'report-card__tile-note--down': tile.dir === 'down' }"
          >{{ tile.note }}</span>
        </div>
      </div>

      <ul class="report-card__highlights">
        <li v-for="line in report.highlights" :key="line">{{ line }}</li>
      </ul>

      <p class="report-card__foot">Next report: {{ nextReportDate(report.month) }}</p>
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

/* Full width: the tiles and sentences need the room */
.report-card {
  grid-column: 1 / -1;
  border-top: 3px solid var(--color-primary);
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

.report-card__head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 0.5rem 1rem; margin-bottom: 1rem; }
.report-card__link { font-size: 0.8125rem; font-weight: 600; color: var(--color-primary); text-decoration: none; }
.report-card__link:hover { text-decoration: underline; }

.report-card__status { display: flex; align-items: center; gap: 0.5rem; margin: 0; font-size: 0.875rem; color: var(--color-text-secondary, var(--color-text)); }
.report-card__spin { animation: report-spin 1s linear infinite; }
@keyframes report-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .report-card__spin { animation: none; } }

.report-card__tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
.report-card__tile {
  display: flex; flex-direction: column; gap: 0.15rem; padding: 0.875rem 1rem;
  background-color: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--border-radius);
}
.report-card__tile-label { font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-secondary, var(--color-text)); }
.report-card__tile-value { font-size: 1.625rem; font-weight: 700; font-family: var(--font-heading); color: var(--color-text); }
.report-card__tile-note { font-size: 0.75rem; color: var(--color-text-secondary, var(--color-text)); }
.report-card__tile-note--up { color: var(--color-up); }
.report-card__tile-note--down { color: var(--color-down); }

.report-card__highlights { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; max-width: 90ch; }
.report-card__highlights li { position: relative; padding-left: 1.1rem; font-size: 0.9375rem; line-height: 1.5; color: var(--color-text); }
.report-card__highlights li::before {
  content: ''; position: absolute; left: 0; top: 0.6em; width: 0.4rem; height: 0.4rem; border-radius: 50%; background-color: var(--color-secondary);
}
@media (max-width: 560px) {
  /* Two across on a phone: four full-width tiles pushed the highlights a screen away. */
  .report-card__tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; }
  .report-card__tile { padding: 0.7rem 0.75rem; }
  .report-card__tile-value { font-size: 1.3rem; }
}
.report-card__foot { margin: 0.875rem 0 0; font-size: 0.75rem; color: var(--color-text-secondary, var(--color-text)); }
</style>

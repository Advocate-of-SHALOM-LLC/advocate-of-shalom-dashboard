<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { HeartHandshake, CalendarDays, Loader2 } from 'lucide-vue-next';
import type { WebTeam } from '@/composables/useOverview';
import { monthName } from '@/composables/useReports';
import { noteParts } from '@/lib/notes';

/**
 * The work behind the website, on the page the client sees first: the web
 * team's latest published monthly note and the next maintenance day on the
 * agency's calendar. Beyond the standard's six parts; added for clients who
 * want to see what their maintenance plan is doing.
 */
const props = defineProps<{ webTeam: WebTeam | null; state: 'loading' | 'ready' | 'error' }>();

const note = computed(() => props.webTeam?.note ?? null);
const parts = computed(() => noteParts(note.value));

const nextVisit = computed(() => {
  const iso = props.webTeam?.nextVisit;
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
});
</script>

<template>
  <section class="card team" aria-labelledby="team-title">
    <div class="card__head">
      <h2 id="team-title" class="card__title"><HeartHandshake :size="18" aria-hidden="true" /> From Eric</h2>
      <RouterLink v-if="note" to="/reports" class="card__link">In the report &rarr;</RouterLink>
    </div>

    <p v-if="state === 'loading'" class="card__empty team__loading" role="status">
      <Loader2 :size="16" class="team__spin" aria-hidden="true" /> Loading…
    </p>

    <template v-else>
      <figure v-if="note" class="team__note">
        <figcaption class="team__when">{{ monthName(note.month) }}</figcaption>
        <div v-for="part in parts" :key="part.title" class="team__part">
          <h3 class="team__part-title">{{ part.title }}</h3>
          <template v-for="(block, i) in part.blocks" :key="i">
            <ul v-if="block.list" class="team__list">
              <li v-for="line in block.lines" :key="line">{{ line }}</li>
            </ul>
            <p v-else class="team__text">{{ block.lines[0] }}</p>
          </template>
        </div>
      </figure>
      <p v-else class="card__empty">
        Each month I add a short note here: what I did on your site and what's planned next.
      </p>

      <p v-if="nextVisit" class="team__visit">
        <CalendarDays :size="16" aria-hidden="true" />
        <span><span class="team__visit-label">Next maintenance day</span> {{ nextVisit }}</span>
      </p>
    </template>
  </section>
</template>

<style scoped>
.team__loading { display: flex; align-items: center; gap: 0.5rem; }
.team__spin { animation: team-spin 1s linear infinite; }
@keyframes team-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .team__spin { animation: none; } }

.team__note { margin: 0; padding: 0.9rem 1rem; border-radius: var(--border-radius); background-color: var(--color-bg); border-left: 3px solid var(--color-accent); }
.team__when { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-text-secondary); }
.team__part { margin-top: 0.75rem; }
.team__part-title { margin: 0 0 0.3rem; font-size: 0.8125rem; font-weight: 700; color: var(--color-text); }
.team__list { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.3rem; }
.team__list li, .team__text { font-size: 0.9375rem; line-height: 1.5; color: var(--color-text); }
.team__text { margin: 0 0 0.3rem; }
.team__visit {
  display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem; padding-top: 0.9rem; border-top: 1px solid var(--color-border);
  font-size: 0.875rem; font-weight: 600; color: var(--color-text);
}
.team__visit svg { color: var(--color-secondary); flex-shrink: 0; }
.team__visit-label { display: block; font-size: 0.75rem; font-weight: 500; color: var(--color-text-secondary); }
</style>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { Info, CheckCircle2, AlertTriangle, XOctagon, ExternalLink, ArrowRight } from 'lucide-vue-next';
import DashboardLayout from '@/components/layout/DashboardLayout.vue';
import OverviewGreeting from '@/components/overview/OverviewGreeting.vue';
import AttentionStrip from '@/components/overview/AttentionStrip.vue';
import MonthToDate from '@/components/overview/MonthToDate.vue';
import WebTeamCard from '@/components/overview/WebTeamCard.vue';
import SiteHealth from '@/components/overview/SiteHealth.vue';
import MonthlyReportWidget from '@/components/widgets/MonthlyReportWidget.vue';
import TutorialsWidget from '@/components/widgets/TutorialsWidget.vue';
import ContentEditorWidget from '@/components/widgets/ContentEditorWidget.vue';
import { useOverview } from '@/composables/useOverview';
import config from '@/config/dashboard';

/**
 * The page the client lands on, read top to bottom (OVERVIEW-STANDARD.md):
 *
 *   1. who it's for, and the things they came to do (greeting, quick actions)
 *   2. anything waiting on them (an amount due)
 *   3. how this month is going, live
 *   4. how last month went, settled (the monthly report)
 *   …with the web team's latest note and the site's health alongside.
 *
 * Links and the analytics summary used to sit here as separate widgets; their
 * content now lives in the greeting and the month-so-far card.
 */
const { month, monthState, lighthouse, healthState, webTeam, webTeamState, charges, chargesLoaded, load } = useOverview();

/** Optional extras some clients have; none are enabled for this client today. */
const extras = computed(() =>
  [
    config.enabledWidgets.includes('tutorials') ? TutorialsWidget : null,
    config.enabledWidgets.includes('contentEditors') ? ContentEditorWidget : null,
  ].filter(Boolean)
);

// Announcement icon by level. Small mapping keeps the template clean.
const announcementIconMap = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  critical: XOctagon,
} as const;

// The first banner whose date window includes today (viewer's local date).
const today = new Intl.DateTimeFormat('en-CA').format(new Date());
const announcement = computed(() =>
  (config.announcements ?? []).find(
    (a) => (!a.showFrom || today >= a.showFrom) && (!a.showUntil || today <= a.showUntil)
  ) ?? null
);

const announcementIcon = computed(() => announcementIconMap[announcement.value?.level || 'info']);

// Route absolute URLs through <a target="_blank">; relative paths through
// RouterLink so the SPA doesn't do a full reload.
const isInternalLink = computed(() => {
  const url = announcement.value?.link?.url || '';
  return url.startsWith('/') && !url.startsWith('//');
});

onMounted(load);
</script>

<template>
  <DashboardLayout page-title="Overview">
    <div class="overview">
      <OverviewGreeting />

      <!-- Announcement banner (config-driven; nothing renders when undefined) -->
      <div
        v-if="announcement"
        class="overview__banner"
        :class="`overview__banner--${announcement.level || 'info'}`"
        role="status"
      >
        <component :is="announcementIcon" :size="18" class="overview__banner-icon" />
        <span class="overview__banner-msg">{{ announcement.message }}</span>
        <RouterLink
          v-if="announcement.link && isInternalLink"
          :to="announcement.link.url"
          class="overview__banner-link"
        >
          {{ announcement.link.label }}
          <ArrowRight :size="12" />
        </RouterLink>
        <a
          v-else-if="announcement.link"
          :href="announcement.link.url"
          target="_blank"
          rel="noopener"
          class="overview__banner-link"
        >
          {{ announcement.link.label }}
          <ExternalLink :size="12" />
        </a>
      </div>

      <AttentionStrip :charges="charges" :loaded="chargesLoaded" />

      <div class="overview__columns">
        <div class="overview__main">
          <MonthToDate :month="month" :state="monthState" />
          <MonthlyReportWidget />
        </div>
        <aside class="overview__side" aria-label="Your web team and site health">
          <WebTeamCard :web-team="webTeam" :state="webTeamState" />
          <SiteHealth :lighthouse="lighthouse" :state="healthState" />
        </aside>
      </div>

      <div v-if="extras.length" class="overview__extras">
        <component :is="extra" v-for="(extra, i) in extras" :key="i" />
      </div>
    </div>
  </DashboardLayout>
</template>

<style scoped>
.overview { display: flex; flex-direction: column; gap: 1.5rem; max-width: 1400px; }
.overview__columns { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.5rem; align-items: start; }
.overview__main, .overview__side { display: flex; flex-direction: column; gap: 1.5rem; min-width: 0; }
.overview__extras { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem; }

@media (min-width: 1180px) {
  .overview__columns { grid-template-columns: minmax(0, 1.7fr) minmax(320px, 1fr); }
}

/* Banner — colors driven by level, using CSS custom properties so the
   dark-mode palette applies without duplicated selectors. */
.overview__banner {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  border: 1px solid;
  border-radius: var(--border-radius);
  font-size: 0.875rem;
  line-height: 1.4;
}

.overview__banner-icon {
  flex-shrink: 0;
}

.overview__banner-msg {
  flex: 1;
}

.overview__banner-link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-weight: 500;
  text-decoration: none;
  color: inherit;
  border-bottom: 1px solid currentColor;
  padding-bottom: 1px;
  flex-shrink: 0;
}

.overview__banner-link:hover {
  opacity: 0.85;
}

.overview__banner--info {
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
  color: var(--color-text);
}

.overview__banner--success {
  background: color-mix(in srgb, #059669 10%, transparent);
  border-color: color-mix(in srgb, #059669 35%, transparent);
  color: var(--color-text);
}

.overview__banner--warning {
  background: color-mix(in srgb, #d97706 12%, transparent);
  border-color: color-mix(in srgb, #d97706 40%, transparent);
  color: var(--color-text);
}

.overview__banner--critical {
  background: color-mix(in srgb, #dc2626 12%, transparent);
  border-color: color-mix(in srgb, #dc2626 40%, transparent);
  color: var(--color-text);
}
</style>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuth0 } from '@auth0/auth0-vue';
import { Info, CheckCircle2, AlertTriangle, XOctagon, ExternalLink, ArrowRight } from 'lucide-vue-next';
import DashboardLayout from '@/components/layout/DashboardLayout.vue';
import AnalyticsWidget from '@/components/widgets/AnalyticsWidget.vue';
import TutorialsWidget from '@/components/widgets/TutorialsWidget.vue';
import LinksWidget from '@/components/widgets/LinksWidget.vue';
import ContentEditorWidget from '@/components/widgets/ContentEditorWidget.vue';
import config from '@/config/dashboard';

const { user } = useAuth0();

const widgetMap: Record<string, unknown> = {
  siteAnalytics: AnalyticsWidget,
  tutorials: TutorialsWidget,
  links: LinksWidget,
  contentEditors: ContentEditorWidget,
};

const activeWidgets = computed(() =>
  config.enabledWidgets
    .filter((w) => w in widgetMap)
    .map((w) => ({ key: w, component: widgetMap[w]! }))
);

// Best-guess first name from the Auth0 user object.
// Priority: given_name → real display name (not the email) → capitalized
// email local-part. Auth0 often sets user.name to the email itself when
// no display name exists, so we skip user.name if it contains '@' and
// fall through to derive "elyse@example.com" → "Elyse".
const firstName = computed(() => {
  const u = user.value;
  if (!u) return '';

  if (u.given_name) return u.given_name;

  const name = (u.name || '').trim();
  if (name && !name.includes('@')) {
    const firstToken = name.split(/\s+/)[0];
    if (firstToken) return firstToken;
  }

  const email = (u.email || '').trim();
  const localPart = email.split('@')[0];
  if (localPart) return localPart.charAt(0).toUpperCase() + localPart.slice(1);

  return '';
});

const timeGreeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
});

const greeting = computed(() =>
  firstName.value ? `${timeGreeting.value}, ${firstName.value}` : `${timeGreeting.value}`
);

// Announcement icon by level. Small mapping keeps the template clean.
const announcementIconMap = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  critical: XOctagon,
} as const;

const announcementIcon = computed(() => {
  const level = config.announcement?.level || 'info';
  return announcementIconMap[level];
});

// Route absolute URLs through <a target="_blank">; relative paths through
// RouterLink so the SPA doesn't do a full reload.
const isInternalLink = computed(() => {
  const url = config.announcement?.link?.url || '';
  return url.startsWith('/') && !url.startsWith('//');
});
</script>

<template>
  <DashboardLayout page-title="Overview">
    <div class="overview">
      <!-- Greeting -->
      <header class="overview__greeting">
        <h2 class="overview__hello">{{ greeting }}</h2>
        <p class="overview__sub">Here's what's happening with {{ config.clientName }}.</p>
      </header>

      <!-- Announcement banner (config-driven; nothing renders when undefined) -->
      <div
        v-if="config.announcement"
        class="overview__banner"
        :class="`overview__banner--${config.announcement.level || 'info'}`"
        role="status"
      >
        <component :is="announcementIcon" :size="18" class="overview__banner-icon" />
        <span class="overview__banner-msg">{{ config.announcement.message }}</span>
        <RouterLink
          v-if="config.announcement.link && isInternalLink"
          :to="config.announcement.link.url"
          class="overview__banner-link"
        >
          {{ config.announcement.link.label }}
          <ArrowRight :size="12" />
        </RouterLink>
        <a
          v-else-if="config.announcement.link"
          :href="config.announcement.link.url"
          target="_blank"
          rel="noopener"
          class="overview__banner-link"
        >
          {{ config.announcement.link.label }}
          <ExternalLink :size="12" />
        </a>
      </div>

      <!-- Widgets -->
      <div class="overview__grid">
        <component
          v-for="widget in activeWidgets"
          :is="widget.component"
          :key="widget.key"
        />
      </div>
    </div>
  </DashboardLayout>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.overview__greeting {
  margin-bottom: 0.25rem;
}

.overview__hello {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 0.25rem;
}

.overview__sub {
  font-size: 0.9375rem;
  color: var(--color-text-secondary, var(--color-text));
  margin: 0;
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

.overview__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.25rem;
}
</style>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuth0 } from '@auth0/auth0-vue';
import { Globe, PenLine, MessageSquare } from 'lucide-vue-next';
import config from '@/config/dashboard';

/**
 * Who the page is for and the things they came to do (OVERVIEW-STANDARD.md
 * 3.1). The configured links become verbs: the CMS link is "Edit website
 * content", the live site "View website". Social and Google profiles sit in a
 * quiet row beneath; agency tools (Netlify, GitHub) aren't shown to the client.
 */
const { user } = useAuth0();

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
  const localPart = (u.email || '').trim().split('@')[0];
  return localPart ? localPart.charAt(0).toUpperCase() + localPart.slice(1) : '';
});

const greeting = computed(() => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
});

type Kind = 'edit' | 'view' | 'profile' | 'agency';
function kindOf(label: string, url: string): Kind {
  const text = `${label} ${url}`.toLowerCase();
  if (/studio|sanity|cms/.test(text)) return 'edit';
  if (/netlify|github|vercel/.test(text)) return 'agency';
  if (/facebook|linkedin|instagram|maps\.app\.goo\.gl|google\.com\/maps|business\.google|x\.com|twitter|youtube/.test(text)) return 'profile';
  return /live|site|website/.test(label.toLowerCase()) ? 'view' : 'profile';
}

const sorted = computed(() => config.links.map((link) => ({ ...link, kind: kindOf(link.label, link.url) })));

const actions = computed(() =>
  sorted.value
    .filter((l) => l.kind === 'view' || l.kind === 'edit')
    // "View website" first, then "Edit website content".
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'view' ? -1 : 1))
    .map((l) => ({
      url: l.url,
      label: l.kind === 'edit' ? 'Edit website content' : 'View website',
      icon: l.kind === 'edit' ? PenLine : Globe,
    }))
);

const profiles = computed(() =>
  sorted.value
    .filter((l) => l.kind === 'profile')
    .map((l) => ({ url: l.url, label: l.label.replace(/^Google Profile$/i, 'Google') }))
);
</script>

<template>
  <header class="greet">
    <div class="greet__intro">
      <h2 class="greet__title">{{ greeting }}<template v-if="firstName">, {{ firstName }}</template></h2>
      <p class="greet__sub">Here's how {{ config.clientName }}'s website is doing.</p>
      <p v-if="profiles.length" class="greet__profiles">
        <span>Your profiles:</span>
        <template v-for="(profile, i) in profiles" :key="profile.url">
          <a :href="profile.url" target="_blank" rel="noopener">{{ profile.label }}<span class="sr-only"> (opens in a new tab)</span></a><span v-if="i < profiles.length - 1" aria-hidden="true"> · </span>
        </template>
      </p>
    </div>
    <nav class="greet__actions" aria-label="Quick actions">
      <a v-for="action in actions" :key="action.url" :href="action.url" target="_blank" rel="noopener" class="greet__btn">
        <component :is="action.icon" :size="16" aria-hidden="true" />
        {{ action.label }}<span class="sr-only"> (opens in a new tab)</span>
      </a>
      <RouterLink to="/support" class="greet__btn greet__btn--primary">
        <MessageSquare :size="16" aria-hidden="true" />
        Request a change
      </RouterLink>
    </nav>
  </header>
</template>

<style scoped>
.greet { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 1rem 2rem; }
.greet__intro { min-width: 0; }
.greet__title {
  font-family: var(--font-heading); font-size: clamp(1.625rem, 1.25rem + 1.2vw, 2.25rem); font-weight: 700;
  color: var(--color-text); letter-spacing: -0.01em; text-wrap: balance;
}
.greet__sub { margin-top: 0.3rem; font-size: 0.9375rem; color: var(--color-text-secondary); }
.greet__profiles { margin-top: 0.35rem; font-size: 0.8125rem; color: var(--color-text-secondary); }
.greet__profiles span:first-child { margin-right: 0.35rem; }
.greet__profiles a { color: var(--color-link); font-weight: 600; }
.greet__profiles a:hover { text-decoration: underline; }
.greet__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.greet__btn {
  display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.55rem 0.95rem;
  border: 1px solid var(--color-border); border-radius: 999px; background-color: var(--color-surface);
  box-shadow: var(--shadow-card); color: var(--color-text); font-size: 0.875rem; font-weight: 600;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.greet__btn svg { color: var(--color-secondary); }
.greet__btn:hover { border-color: var(--color-primary); }
.greet__btn--primary { background-color: var(--color-primary); border-color: var(--color-primary); color: var(--color-on-primary); }
.greet__btn--primary svg { color: currentColor; }
@media (prefers-reduced-motion: no-preference) {
  .greet__btn:hover { transform: translateY(-1px); }
}
</style>

import { ref } from 'vue';
import { useApi } from '@/composables/useApi';
import config from '@/config/dashboard';
import type { LighthouseCheck } from '@/types/report';

/** This month so far, from analytics-proxy?period=mtd. */
export interface MonthToDate {
  label: 'visits' | 'real visits';
  month: string;
  current: { visits: number; avgSeconds: number | null };
  /** The same days of last month; null when there's nothing comparable. */
  previous: { visits: number } | null;
  /** All of last month, for context; null before tracking began. */
  lastMonth: { month: string; visits: number } | null;
  series: { key: string; visits: number }[];
}

export interface WebTeam {
  note: { month: string; summary: string; recommendations: string; publishedAt: string | null } | null;
  nextVisit: string | null;
}

export interface PendingCharge {
  id: string;
  amount: number;
  currency: string;
  dueDate: number | null;
  pairId?: string | null;
}

/**
 * Everything the overview shows, fetched side by side. Each part loads, fails
 * and renders on its own: a slow Stripe call must not hold up the greeting,
 * and analytics being unavailable must not blank the rest
 * (OVERVIEW-STANDARD.md §4).
 */
export function useOverview() {
  const api = useApi();

  const month = ref<MonthToDate | null>(null);
  const monthState = ref<'loading' | 'ready' | 'none'>('loading');
  const lighthouse = ref<LighthouseCheck | null>(null);
  const healthState = ref<'loading' | 'ready' | 'error'>('loading');
  const webTeam = ref<WebTeam | null>(null);
  const webTeamState = ref<'loading' | 'ready' | 'error'>('loading');
  const charges = ref<PendingCharge[]>([]);
  const chargesLoaded = ref(!config.billing);

  const json = async (name: string) => {
    const res = await api(name);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || typeof data !== 'object') throw new Error(`${name} returned ${res.status}`);
    return data;
  };

  async function load() {
    await Promise.allSettled([
      json('analytics-proxy?period=mtd')
        .then((d) => {
          month.value = d.configured && d.current ? (d as MonthToDate) : null;
          monthState.value = month.value ? 'ready' : 'none';
        })
        .catch(() => (monthState.value = 'none')),
      json('site-health')
        .then((d) => {
          lighthouse.value = d.lighthouse ?? null;
          healthState.value = 'ready';
        })
        .catch(() => (healthState.value = 'error')),
      json('web-team')
        .then((d) => {
          webTeam.value = d.configured === false ? { note: null, nextVisit: null } : (d as WebTeam);
          webTeamState.value = 'ready';
        })
        .catch(() => (webTeamState.value = 'error')),
      config.billing
        ? json('stripe-get-billing-summary')
            .then((d) => (charges.value = d.pendingCharges ?? []))
            .catch(() => {})
            .finally(() => (chargesLoaded.value = true))
        : Promise.resolve(),
    ]);
  }

  return { month, monthState, lighthouse, healthState, webTeam, webTeamState, charges, chargesLoaded, load };
}

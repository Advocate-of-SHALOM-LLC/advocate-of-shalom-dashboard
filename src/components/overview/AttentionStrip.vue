<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { Inbox, Receipt, CheckCircle2 } from 'lucide-vue-next';
import type { PendingCharge, SubmissionSummary } from '@/composables/useOverview';
import { submissionKinds, kindLabel } from '@/lib/submissions';

/**
 * Only things the client should act on (OVERVIEW-STANDARD.md 3.2). Invoices
 * are counted as amounts due: paired invoices (alternative ways to pay the
 * same charges) are one item showing the full amount, as on the Billing page.
 * New form submissions come first: one item per configured kind with any new.
 */
const props = defineProps<{ submissions: SubmissionSummary | null; charges: PendingCharge[]; loaded: boolean }>();

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);

const newOf = (kind: string) =>
  (props.submissions?.counts ?? []).filter((c) => c.kind === kind && c.status === 'new').reduce((sum, c) => sum + c.n, 0);

const submissionItems = computed(() =>
  submissionKinds
    .map((k) => ({ kind: k.kind, n: newOf(k.kind) }))
    .filter((k) => k.n > 0)
    .map((k) => ({
      key: `new-${k.kind}`,
      text: `${k.n} new ${kindLabel(k.kind, k.n)}`,
      to: `/submissions?kind=${k.kind}&status=new`,
    }))
);

const items = computed(() => {
  const groups = new Map<string, PendingCharge>();
  for (const charge of props.charges) {
    const key = charge.pairId || charge.id;
    const current = groups.get(key);
    // The pair's combined invoice is its largest; that's the amount due.
    if (!current || charge.amount > current.amount) groups.set(key, charge);
  }
  return [...groups.entries()].map(([key, charge]) => ({
    key,
    text: `${money(charge.amount, charge.currency)} due${
      charge.dueDate ? ` ${new Date(charge.dueDate * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''
    }`,
  }));
});
</script>

<template>
  <section aria-label="Needs your attention">
    <ul v-if="submissionItems.length || items.length" class="attn">
      <li v-for="item in submissionItems" :key="item.key">
        <RouterLink :to="item.to" class="attn__item attn__item--inbox">
          <span class="attn__icon"><Inbox :size="18" aria-hidden="true" /></span>
          <span class="attn__text">
            <span class="attn__label">Waiting for a reply</span>
            {{ item.text }}
          </span>
          <span class="attn__action">Review &rarr;</span>
        </RouterLink>
      </li>
      <li v-for="item in items" :key="item.key">
        <RouterLink to="/billing" class="attn__item">
          <span class="attn__icon"><Receipt :size="18" aria-hidden="true" /></span>
          <span class="attn__text">
            <span class="attn__label">Payment due</span>
            {{ item.text }}
          </span>
          <span class="attn__action">Pay &rarr;</span>
        </RouterLink>
      </li>
    </ul>
    <p v-else-if="loaded" class="attn__clear">
      <CheckCircle2 :size="18" aria-hidden="true" /> All caught up — nothing is waiting on you.
    </p>
  </section>
</template>

<style scoped>
.attn { list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 0.75rem; }
.attn__item {
  display: flex; align-items: center; gap: 0.85rem; height: 100%; padding: 0.85rem 1.1rem;
  background-color: var(--color-surface); border: 1px solid var(--color-border); border-left: 4px solid var(--color-accent);
  border-radius: calc(var(--border-radius) * 1.5); box-shadow: var(--shadow-card); color: var(--color-text);
  transition: border-color 0.15s ease;
}
.attn__item:hover { border-color: var(--color-primary); border-left-color: var(--color-accent); }
.attn__icon {
  display: grid; place-items: center; width: 2.25rem; height: 2.25rem; flex-shrink: 0; border-radius: 50%;
  background-color: color-mix(in srgb, var(--color-accent) 16%, transparent); color: var(--color-warn);
}
.attn__text { flex: 1; display: flex; flex-direction: column; font-size: 0.9375rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.attn__label { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-text-secondary); }
.attn__action { font-size: 0.8125rem; font-weight: 600; color: var(--color-link); white-space: nowrap; }
.attn__item--inbox, .attn__item--inbox:hover { border-left-color: var(--color-primary); }
.attn__item--inbox .attn__icon { background-color: color-mix(in srgb, var(--color-primary) 12%, transparent); color: var(--color-primary); }
.attn__clear { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9375rem; color: var(--color-up); font-weight: 500; }
</style>

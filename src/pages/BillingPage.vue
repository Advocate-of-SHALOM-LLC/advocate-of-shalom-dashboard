<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuth0 } from '@auth0/auth0-vue';
import DashboardLayout from '@/components/layout/DashboardLayout.vue';
import {
  CreditCard,
  Clock,
  Receipt,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  LifeBuoy,
  CalendarClock,
  Zap,
} from 'lucide-vue-next';
import config from '@/config/dashboard';

const { getAccessTokenSilently } = useAuth0();

const billing = config.billing;
const loading = ref(true);
const error = ref<string | null>(null);

interface Subscription {
  id: string;
  status: string;
  planName: string;
  amount: number;
  currency: string;
  interval: string;
  nextBillingDate: number | null;
  cancelAtPeriodEnd: boolean;
}

interface Invoice {
  id: string;
  number: string | null;
  amount: number;
  currency: string;
  description: string | null;
  created: number;
  dueDate?: number | null;
  paidAt?: number | null;
  hostedInvoiceUrl: string | null;
  invoicePdf?: string | null;
  // Recent payments only: marked paid outside Stripe (cash, check, Zelle).
  paidOffline?: boolean;
  // Pending charges only. Invoices sharing a pairId are alternative ways to
  // pay the same charges (issued that way by the Pipeline Dashboard), not
  // separate bills.
  pairId?: string | null;
  lineItems?: Array<{ description: string | null; amount: number; installmentNumber?: number | null }>;
  installmentNumbers?: number[];
  subscriptionId?: string | null;
}

interface PaymentMethod {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

// Installment shape matches the upstream Client Dashboard contract
// (docs/installment-billing-handoff.md §4). Dates arrive as YYYY-MM-DD
// strings, not Unix timestamps like the rest of the billing objects.
interface Installment {
  n: number;
  amountCents: number;
  currency: string;
  dueDate: string | null;
  status: 'paid' | 'upcoming' | 'overdue';
  paidOn?: string | null;
  stripeInvoiceId?: string | null;
}

// Maintenance schedule shape. Stripe encodes quarterly plans as
// interval='month' + interval_count=3, so we can't use subscription.interval
// alone for the price suffix — need the upstream's cycleShortLabel.
interface MaintenanceSchedule {
  cycleLabel?: string;
  cycleShortLabel?: string;
  amountCents?: number;
  nextChargeDate?: string;
}

const subscription = ref<Subscription | null>(null);
const pendingCharges = ref<Invoice[]>([]);
const recentPayments = ref<Invoice[]>([]);
// Credit on the Stripe balance, in cents; Stripe takes it off the next invoice.
const creditBalance = ref(0);
const paymentMethod = ref<PaymentMethod | null>(null);
const portalLoading = ref(false);

const installments = ref<Installment[]>([]);
const installmentsLoading = ref(true);
const installmentsError = ref<string | null>(null);
// The Stripe subscription behind the installment plan — lets us recognise
// its auto-generated invoice in Pending Charges.
const installmentSubscriptionId = ref<string | null>(null);
// Track which installment is mid-issue so we can disable + spinner just
// that row instead of the whole card.
const payingInstallmentN = ref<number | null>(null);

const maintenanceSchedule = ref<MaintenanceSchedule | null>(null);

function formatCurrency(amount: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Installment dueDate is a YYYY-MM-DD string, not a Unix timestamp.
// Interpret as local date so display isn't off-by-a-day for negative UTC
// offsets ("2026-08-11" reading as Aug 10 evening).
// Safe JSON.parse — returns null on failure so callers can decide what
// error to raise instead of catching a JSON.parse SyntaxError directly.
function safeParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Client-facing error copy. Real diagnostic detail is logged to the
// console for the developer; the user only sees something they can
// actually act on (retry / contact support).
const FRIENDLY_LOAD_ERROR =
  'We couldn\'t load your billing details. Please try again — or contact support if the problem continues.';
const FRIENDLY_SCHEDULE_ERROR =
  'We couldn\'t load your installment schedule. Please try again — or contact support if the problem continues.';
const FRIENDLY_INVOICE_ERROR =
  'We couldn\'t open that invoice. Please try again in a moment.';
const FRIENDLY_PORTAL_ERROR =
  'We couldn\'t open the billing portal. Please try again in a moment.';

// The schedule returns no dueDate once the installment subscription has
// ended, so tolerate a missing value rather than throwing mid-render.
function formatIsoDate(iso: string | null | undefined) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function capitalizeFirst(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// `silent` refreshes the data in place instead of swapping the whole page
// for the loading state — used after issuing an invoice from this page.
async function fetchBillingSummary(silent = false) {
  if (!billing?.stripeCustomerId) return;

  if (!silent) loading.value = true;
  error.value = null;

  try {
    const token = await getAccessTokenSilently();
    const res = await fetch(
      '/.netlify/functions/stripe-get-billing-summary',
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Same defensive parsing as fetchInstallments — distinguish HTML
    // fallback (netlify dev didn't load the function) from real JSON errors.
    const text = await res.text();
    const looksLikeHtml = text.trim().startsWith('<');

    if (looksLikeHtml) {
      // Dev-only case: netlify dev didn't register the function so the SPA
      // fallback served index.html. Log the diagnostic, show the user
      // something they can act on.
      console.error(`stripe-get-billing-summary returned HTML (status ${res.status}). Function may not be loaded.`);
      throw new Error(FRIENDLY_LOAD_ERROR);
    }

    if (!res.ok) {
      const errData = safeParseJson(text);
      console.error('stripe-get-billing-summary error:', res.status, errData);
      throw new Error(FRIENDLY_LOAD_ERROR);
    }

    const data = safeParseJson(text);
    if (!data) {
      console.error('stripe-get-billing-summary returned unparseable JSON');
      throw new Error(FRIENDLY_LOAD_ERROR);
    }
    if (!data.success) {
      console.error('stripe-get-billing-summary success=false:', data.error);
      throw new Error(FRIENDLY_LOAD_ERROR);
    }

    subscription.value = data.subscription;
    pendingCharges.value = data.pendingCharges || [];
    recentPayments.value = data.recentPayments || [];
    creditBalance.value = data.creditBalance || 0;
    paymentMethod.value = data.paymentMethod;
  } catch (err) {
    console.error('fetchBillingSummary caught:', err);
    error.value = FRIENDLY_LOAD_ERROR;
  } finally {
    loading.value = false;
  }
}

async function fetchInstallments() {
  if (!billing?.stripeCustomerId) {
    installmentsLoading.value = false;
    return;
  }

  installmentsLoading.value = true;
  installmentsError.value = null;

  try {
    const token = await getAccessTokenSilently();
    const res = await fetch(
      '/.netlify/functions/get-installment-schedule',
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Read the body as text first so we can tell "server sent HTML" (which
    // happens when netlify dev hasn't registered the function and the SPA
    // fallback serves index.html) from "server sent bad JSON". Otherwise
    // the user sees an opaque JSON.parse error with no clue why.
    const text = await res.text();
    const looksLikeHtml = text.trim().startsWith('<');

    if (!res.ok || looksLikeHtml) {
      const data = looksLikeHtml ? null : safeParseJson(text);
      console.error(
        `get-installment-schedule ${looksLikeHtml ? 'returned HTML' : `error ${res.status}`}:`,
        data
      );
      throw new Error(FRIENDLY_SCHEDULE_ERROR);
    }

    const data = safeParseJson(text);
    if (!data) {
      console.error('get-installment-schedule returned unparseable JSON');
      throw new Error(FRIENDLY_SCHEDULE_ERROR);
    }
    installments.value = data.installments || [];
    installmentSubscriptionId.value = data.stripeSubscriptionId || null;
  } catch (err) {
    console.error('fetchInstallments caught:', err);
    installmentsError.value = FRIENDLY_SCHEDULE_ERROR;
  } finally {
    installmentsLoading.value = false;
  }
}

// Best-effort fetch — a failure here shouldn't cause page-level noise
// since we fall back to subscription.interval for the price suffix
// (the "$850/month" bug we're fixing is cosmetic, not blocking).
async function fetchMaintenanceSchedule() {
  if (!billing?.stripeCustomerId) return;

  try {
    const token = await getAccessTokenSilently();
    const res = await fetch(
      '/.netlify/functions/get-maintenance-schedule',
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) return;
    const text = await res.text();
    if (text.trim().startsWith('<')) return;

    const data = safeParseJson(text);
    if (data?.success && data.cycleShortLabel) {
      maintenanceSchedule.value = data;
    }
  } catch {
    // Silent — cosmetic fallback covers it.
  }
}

async function payInstallmentEarly(n: number) {
  if (!billing?.stripeCustomerId || payingInstallmentN.value !== null) return;

  payingInstallmentN.value = n;
  try {
    const token = await getAccessTokenSilently();
    const res = await fetch('/.netlify/functions/issue-installment-invoice', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ installmentNumber: n }),
    });

    const data = await res.json();
    if (!res.ok || !data.hostedInvoiceUrl) {
      throw new Error(data.error || 'Could not issue invoice');
    }

    // Open Stripe's hosted invoice URL in a new tab. The user pays there;
    // the Stripe webhook (Client Dashboard side) marks paid + voids the
    // corresponding subscription-generated invoice.
    window.open(data.hostedInvoiceUrl, '_blank');

    // Refetch after a beat so a fresh "issued but unpaid" invoice shows
    // the right state on return, and any newly-paid one flips to paid.
    // Pending Charges needs it too: the new invoice becomes that line's link.
    setTimeout(() => { fetchInstallments(); fetchBillingSummary(true); }, 2000);
  } catch (err) {
    console.error('payInstallmentEarly caught:', err);
    installmentsError.value = FRIENDLY_INVOICE_ERROR;
  } finally {
    payingInstallmentN.value = null;
  }
}

async function openPortal() {
  if (!billing?.stripeCustomerId) return;

  portalLoading.value = true;
  try {
    const token = await getAccessTokenSilently();
    const res = await fetch('/.netlify/functions/stripe-create-portal-session', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ returnUrl: window.location.href }),
    });

    const data = await res.json();
    if (data.success && data.url) {
      window.open(data.url, '_blank');
    } else {
      throw new Error(data.error || 'Could not create portal session');
    }
  } catch (err) {
    console.error('openPortal caught:', err);
    error.value = FRIENDLY_PORTAL_ERROR;
  } finally {
    portalLoading.value = false;
  }
}

// Installments not yet paid, in schedule order.
const unpaidInstallments = computed(() =>
  installments.value.filter((i) => i.status !== 'paid')
);

// An installment that already sits on an open invoice is shown (and paid)
// in Pending Charges — listing it here too makes it look like a second
// amount owed, and Pay Early would issue a duplicate invoice. Covered when
// an open invoice names the installment number, or (for the next one due)
// when the installment subscription's own invoice is open.
function isInstallmentInvoiced(n: number) {
  const nextDue = unpaidInstallments.value[0]?.n;
  return pendingCharges.value.some(
    (c) =>
      c.installmentNumbers?.includes(n) ||
      (n === nextDue &&
        !!installmentSubscriptionId.value &&
        c.subscriptionId === installmentSubscriptionId.value)
  );
}

// Computed: upcoming or overdue rows that aren't already invoiced. Paid
// installments live in the Recent Payments card, so no need to repeat them.
const upcomingInstallments = computed(() =>
  unpaidInstallments.value.filter((i) => !isInstallmentInvoiced(i.n))
);

// Pending charges grouped for display. Invoices that share a pairId are
// alternative ways to pay the same charges, so they render as ONE amount
// due: the invoice covering everything is the primary action, and each of
// its line items links to the standalone invoice for just that item. A
// pair with a single open invoice left is just a normal charge.
interface ChargeLine {
  description: string | null;
  amount: number;
  /** Standalone invoice that pays only this line, when one is open. */
  payAlone: Invoice | null;
  /** Installment that can be invoiced on its own via Pay Early. */
  payEarlyN: number | null;
  /** Installment already paid through another invoice. */
  paid: boolean;
}

interface ChargeGroup {
  key: string;
  primary: Invoice;
  lines: ChargeLine[];
  /** Paired invoices that don't correspond to a line — still need a link. */
  otherOptions: Invoice[];
  /** What is still owed: the invoice total less any line already paid. */
  amountDue: number;
  /**
   * False when a line was already paid elsewhere — paying the full invoice
   * would charge that line twice, so only the remaining lines are offered.
   */
  canPayInFull: boolean;
}

const pendingChargeGroups = computed(() => {
  const members = new Map<string, Invoice[]>();
  for (const charge of pendingCharges.value) {
    const key = charge.pairId || charge.id;
    const list = members.get(key);
    if (list) list.push(charge);
    else members.set(key, [charge]);
  }

  // Pay Early invoices aren't pair-tagged, but they pay a line of the
  // combined invoice all the same — fold them into that group rather than
  // listing them as a further amount owed.
  const loose = pendingCharges.value.filter((c) => !c.pairId);
  const folded = new Set<string>();

  const groups: ChargeGroup[] = [];
  for (const [key, charges] of members) {
    // The combined invoice is the one for the largest amount.
    const [primary, ...alternatives] = [...charges].sort((a, b) => b.amount - a.amount);
    if (!primary) continue;

    const unmatched = [...alternatives];
    const lines: ChargeLine[] = (primary.lineItems ?? []).map((line) => {
      const n = line.installmentNumber ?? null;

      // Standalone invoice for this line: a paired one for the same amount,
      // else a Pay Early invoice for the same installment.
      const at = unmatched.findIndex((alt) => alt.amount === line.amount);
      let payAlone = at === -1 ? null : unmatched.splice(at, 1)[0] ?? null;
      if (primary.pairId && n) {
        for (const c of loose) {
          if (!c.installmentNumbers?.includes(n)) continue;
          folded.add(c.id);
          payAlone ??= c;
        }
      }

      const scheduled = n ? installments.value.find((i) => i.n === n) : undefined;
      const paid = scheduled?.status === 'paid';

      return {
        description: line.description,
        amount: line.amount,
        payAlone: paid ? null : payAlone,
        payEarlyN: primary.pairId && scheduled && !paid && !payAlone ? n : null,
        paid,
      };
    });

    const paidAmount = lines.reduce((sum, l) => sum + (l.paid ? l.amount : 0), 0);
    groups.push({
      key,
      primary,
      lines,
      otherOptions: unmatched,
      amountDue: primary.amount - paidAmount,
      canPayInFull: paidAmount === 0,
    });
  }
  return groups.filter((g) => !folded.has(g.primary.id));
});

// What an invoice is for, in words. Stripe's invoice-level description is
// usually empty for Pipeline-issued invoices, so fall back to its line item.
function chargeLabel(charge: Invoice) {
  return charge.description || charge.lineItems?.[0]?.description || charge.number || 'Invoice';
}

// What the subscription's next invoice will come to once the credit is
// applied. Null when there's no credit or nothing scheduled to apply it to.
const nextChargeAfterCredit = computed(() => {
  const sub = subscription.value;
  if (!creditBalance.value || !sub || sub.status !== 'active' || !sub.nextBillingDate) return null;
  return Math.max(0, sub.amount - creditBalance.value);
});

// Card is silent when the customer isn't on installments (empty list) —
// keeps the page clean for non-installment clients. Loading and error
// states still render so we don't ghost the user during setup.
const showInstallmentsCard = computed(
  () => installmentsLoading.value || installmentsError.value || upcomingInstallments.value.length > 0
);

onMounted(() => {
  fetchBillingSummary();
  fetchInstallments();
  fetchMaintenanceSchedule();
});

// Prefer the upstream's display-ready cycle label ("quarter") when we have
// one. Stripe's raw interval is always "month" for our quarterly plans,
// which prints wrong; the maintenance endpoint fixes this at the source.
const intervalLabel = computed(
  () => maintenanceSchedule.value?.cycleShortLabel || subscription.value?.interval || ''
);
</script>

<template>
  <DashboardLayout page-title="Billing">
    <!-- Not configured -->
    <div v-if="!billing?.stripeCustomerId" class="billing-placeholder">
      <CreditCard :size="48" class="billing-placeholder__icon" />
      <h2>Billing Not Configured</h2>
      <p>Billing has not been set up for this dashboard yet. Contact your web administrator for assistance.</p>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="billing-loading" role="status" aria-live="polite">
      <Loader2 :size="32" class="billing-loading__spinner" aria-hidden="true" />
      <p>Loading billing information...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="billing-error" role="alert">
      <AlertCircle :size="20" aria-hidden="true" />
      <span>{{ error }}</span>
      <button class="billing-btn billing-btn--secondary" @click="fetchBillingSummary()">
        <RefreshCw :size="16" aria-hidden="true" />
        Retry
      </button>
    </div>

    <!-- Billing Content -->
    <div v-else class="billing-grid">
      <!-- Subscription Card -->
      <div class="billing-card">
        <div class="billing-card__header">
          <CreditCard :size="20" />
          <h3>Subscription</h3>
        </div>

        <div v-if="subscription" class="billing-card__body">
          <div class="billing-detail">
            <span class="billing-detail__label">Plan</span>
            <span class="billing-detail__value">{{ subscription.planName }}</span>
          </div>
          <div class="billing-detail">
            <span class="billing-detail__label">Status</span>
            <span class="billing-badge" :class="`billing-badge--${subscription.status}`">
              <CheckCircle v-if="subscription.status === 'active'" :size="14" />
              <AlertCircle v-else-if="subscription.status === 'past_due'" :size="14" />
              <XCircle v-else-if="subscription.status === 'canceled'" :size="14" />
              {{ capitalizeFirst(subscription.status.replace('_', ' ')) }}
            </span>
          </div>
          <div class="billing-detail">
            <span class="billing-detail__label">Amount</span>
            <span class="billing-detail__value">
              {{ formatCurrency(subscription.amount, subscription.currency) }}/{{ intervalLabel }}
            </span>
          </div>
          <div v-if="subscription.nextBillingDate" class="billing-detail">
            <span class="billing-detail__label">Next Billing</span>
            <span class="billing-detail__value">{{ formatDate(subscription.nextBillingDate) }}</span>
          </div>
          <div v-if="nextChargeAfterCredit !== null" class="billing-detail">
            <span class="billing-detail__label">After your credit</span>
            <span class="billing-detail__value billing-detail__value--credit">
              {{ formatCurrency(nextChargeAfterCredit, subscription.currency) }}
            </span>
          </div>
          <div v-if="subscription.cancelAtPeriodEnd" class="billing-notice billing-notice--warning">
            Subscription will cancel at end of current period
          </div>

          <button class="billing-btn billing-btn--primary" :disabled="portalLoading" @click="openPortal">
            <Loader2 v-if="portalLoading" :size="16" class="billing-loading__spinner" />
            <ExternalLink v-else :size="16" />
            Manage Subscription
          </button>
        </div>

        <div v-else class="billing-card__empty">
          <p>No active subscription</p>
        </div>
      </div>

      <!-- Upcoming Installments Card -->
      <div v-if="showInstallmentsCard" class="billing-card">
        <div class="billing-card__header">
          <CalendarClock :size="20" />
          <h3>Upcoming Installments</h3>
        </div>

        <div v-if="installmentsLoading" class="billing-card__body">
          <div class="billing-loading" role="status" aria-live="polite">
            <Loader2 :size="24" class="billing-loading__spinner" aria-hidden="true" />
            <p>Loading installment schedule…</p>
          </div>
        </div>

        <div v-else-if="installmentsError" class="billing-card__body">
          <div class="billing-error" role="alert">
            <AlertCircle :size="20" aria-hidden="true" />
            <span>{{ installmentsError }}</span>
            <button class="billing-btn billing-btn--secondary" @click="fetchInstallments">
              <RefreshCw :size="16" aria-hidden="true" />
              Retry
            </button>
          </div>
        </div>

        <div v-else class="billing-card__body">
          <p class="billing-installments__hint">
            Your plan bills automatically on each due date. Paying early is
            optional — click any installment to open its Stripe invoice.
          </p>

          <div
            v-for="inst in upcomingInstallments"
            :key="inst.n"
            class="billing-installment-row"
            :class="{ 'billing-installment-row--overdue': inst.status === 'overdue' }"
          >
            <div class="billing-installment-row__info">
              <span class="billing-installment-row__label">
                Installment {{ inst.n }}
                <span
                  v-if="inst.status === 'overdue'"
                  class="billing-badge billing-badge--past_due"
                >
                  <AlertCircle :size="12" /> Overdue
                </span>
              </span>
              <span class="billing-installment-row__amount">
                {{ formatCurrency(inst.amountCents, inst.currency) }}
              </span>
              <span v-if="inst.dueDate" class="billing-installment-row__date">
                Due {{ formatIsoDate(inst.dueDate) }}
              </span>
            </div>
            <button
              class="billing-btn billing-btn--primary billing-btn--sm"
              :disabled="payingInstallmentN !== null"
              @click="payInstallmentEarly(inst.n)"
            >
              <Loader2 v-if="payingInstallmentN === inst.n" :size="14" class="billing-loading__spinner" />
              <Zap v-else :size="14" />
              Pay Early
            </button>
          </div>
        </div>
      </div>

      <!-- Pending Charges Card -->
      <div v-if="billing.showPendingCharges" class="billing-card">
        <div class="billing-card__header">
          <Clock :size="20" />
          <h3>Pending Charges</h3>
        </div>

        <!-- Credit on the Stripe balance: Stripe applies it to the next invoice. -->
        <div v-if="creditBalance > 0" class="billing-credit" role="note">
          <div class="billing-credit__row">
            <span class="billing-credit__label">Credit on account</span>
            <span class="billing-credit__amount">{{ formatCurrency(creditBalance) }}</span>
          </div>
          <p v-if="subscription && nextChargeAfterCredit !== null && subscription.nextBillingDate" class="billing-credit__note">
            Applied automatically to your next invoice on {{ formatDate(subscription.nextBillingDate) }},
            which drops from {{ formatCurrency(subscription.amount, subscription.currency) }}
            to {{ formatCurrency(nextChargeAfterCredit, subscription.currency) }}.
          </p>
          <p v-else class="billing-credit__note">Applied automatically to your next invoice.</p>
        </div>

        <div v-if="pendingCharges.length > 0" class="billing-card__body">
          <div v-for="group in pendingChargeGroups" :key="group.key" class="billing-due">
            <div class="billing-due__total">
              <span class="billing-due__label">
                {{ group.lines.length > 1 ? 'Total due' : chargeLabel(group.primary) }}
              </span>
              <span class="billing-due__amount">
                {{ formatCurrency(group.amountDue, group.primary.currency) }}
              </span>
            </div>

            <!-- Breakdown only when the invoice covers more than one thing.
                 A line links to its own invoice when it can be paid alone. -->
            <ul v-if="group.lines.length > 1" class="billing-due__lines">
              <li v-for="(line, i) in group.lines" :key="i" :class="{ 'billing-due__line--paid': line.paid }">
                <a
                  v-if="line.payAlone?.hostedInvoiceUrl"
                  :href="line.payAlone.hostedInvoiceUrl"
                  target="_blank"
                  rel="noopener"
                  class="billing-due__line-link"
                  :title="`Pay only this item (${formatCurrency(line.amount, group.primary.currency)})`"
                >
                  {{ line.description || 'Item' }}
                  <ExternalLink :size="12" aria-hidden="true" />
                </a>
                <!-- No standalone invoice yet: issue one through Pay Early -->
                <button
                  v-else-if="line.payEarlyN !== null"
                  type="button"
                  class="billing-due__line-link"
                  :disabled="payingInstallmentN !== null"
                  :title="`Pay only this item (${formatCurrency(line.amount, group.primary.currency)})`"
                  @click="payInstallmentEarly(line.payEarlyN)"
                >
                  {{ line.description || 'Item' }}
                  <Loader2
                    v-if="payingInstallmentN === line.payEarlyN"
                    :size="12"
                    class="billing-loading__spinner"
                    aria-hidden="true"
                  />
                  <ExternalLink v-else :size="12" aria-hidden="true" />
                </button>
                <span v-else>{{ line.description || 'Item' }}</span>
                <span>{{ line.paid ? 'Paid' : formatCurrency(line.amount, group.primary.currency) }}</span>
              </li>
            </ul>

            <span class="billing-invoice-row__date">
              {{ group.primary.dueDate ? `Due ${formatDate(group.primary.dueDate)}` : formatDate(group.primary.created) }}
            </span>

            <a
              v-if="group.canPayInFull && group.primary.hostedInvoiceUrl"
              :href="group.primary.hostedInvoiceUrl"
              target="_blank"
              rel="noopener"
              class="billing-btn billing-btn--primary billing-btn--full"
            >
              Pay {{ formatCurrency(group.primary.amount, group.primary.currency) }}
              <ExternalLink :size="14" />
            </a>

            <p v-if="!group.canPayInFull" class="billing-due__hint">
              Select the remaining item above to pay it.
            </p>
            <p v-else-if="group.lines.some((l) => l.payAlone || l.payEarlyN !== null)" class="billing-due__hint">
              Or select an item above to pay it on its own.
            </p>

            <!-- Paired invoices that don't map to a line above -->
            <div v-if="group.otherOptions.length > 0" class="billing-due__alt">
              <template v-for="alt in group.otherOptions" :key="alt.id">
                <a
                  v-if="alt.hostedInvoiceUrl"
                  :href="alt.hostedInvoiceUrl"
                  target="_blank"
                  rel="noopener"
                  class="billing-due__line-link"
                >
                  Pay only {{ chargeLabel(alt) }} — {{ formatCurrency(alt.amount, alt.currency) }}
                  <ExternalLink :size="12" aria-hidden="true" />
                </a>
              </template>
            </div>
          </div>
        </div>

        <div v-else class="billing-card__empty">
          <p>You're all caught up. No pending charges.</p>
        </div>
      </div>

      <!-- Recent Payments Card -->
      <div class="billing-card">
        <div class="billing-card__header">
          <Receipt :size="20" />
          <h3>Recent Payments</h3>
        </div>

        <div v-if="recentPayments.length > 0" class="billing-card__body">
          <div v-for="payment in recentPayments" :key="payment.id" class="billing-invoice-row">
            <div class="billing-invoice-row__info">
              <span class="billing-invoice-row__amount">{{ formatCurrency(payment.amount, payment.currency) }}</span>
              <span class="billing-invoice-row__desc">{{ payment.description || payment.number || 'Payment' }}</span>
              <span class="billing-invoice-row__date">
                {{ payment.paidAt ? formatDate(payment.paidAt) : formatDate(payment.created) }}
              </span>
            </div>
            <div class="billing-invoice-row__actions">
              <span class="billing-badge billing-badge--active">{{ payment.paidOffline ? 'Paid offline' : 'Paid' }}</span>
              <a
                v-if="payment.invoicePdf"
                :href="payment.invoicePdf"
                target="_blank"
                rel="noopener"
                class="billing-icon-btn"
                title="Download PDF"
              >
                <Receipt :size="16" />
              </a>
            </div>
          </div>

          <button class="billing-btn billing-btn--secondary billing-btn--full" @click="openPortal">
            <ExternalLink :size="16" />
            View All Invoices
          </button>
        </div>

        <div v-else class="billing-card__empty">
          <p>No payments yet</p>
        </div>
      </div>

      <!-- Payment Method Card -->
      <div class="billing-card">
        <div class="billing-card__header">
          <CreditCard :size="20" />
          <h3>Payment Method</h3>
        </div>

        <div v-if="paymentMethod" class="billing-card__body">
          <div class="billing-payment-method">
            <div class="billing-payment-method__card">
              <CreditCard :size="24" />
              <div>
                <span class="billing-payment-method__brand">{{ capitalizeFirst(paymentMethod.brand) }}</span>
                <span class="billing-payment-method__number">&bull;&bull;&bull;&bull; {{ paymentMethod.last4 }}</span>
              </div>
            </div>
            <span class="billing-payment-method__exp">
              Expires {{ String(paymentMethod.expMonth).padStart(2, '0') }}/{{ paymentMethod.expYear }}
            </span>
          </div>

          <button class="billing-btn billing-btn--secondary" @click="openPortal">
            <ExternalLink :size="16" />
            Update Payment Method
          </button>
        </div>

        <div v-else class="billing-card__empty">
          <template v-if="billing?.collectionMethod === 'invoice'">
            <p>
              You're on invoice billing — invoices are sent to your email each
              period and paid from the link. No card required.
            </p>
            <button class="billing-btn billing-btn--primary" @click="openPortal">
              <CreditCard :size="16" />
              Switch to Auto-pay (Add Card)
            </button>
          </template>
          <template v-else-if="subscription?.status === 'active'">
            <p>No payment method on file</p>
            <button class="billing-btn billing-btn--primary" @click="openPortal">
              <CreditCard :size="16" />
              Add Payment Method
            </button>
          </template>
          <template v-else>
            <p>No card needed while your subscription is inactive.</p>
          </template>
        </div>
      </div>
    </div>

    <!-- Support footer — persistent across loading/error/content states -->
    <p class="billing-support-link">
      <LifeBuoy :size="14" />
      Questions about your billing?
      <RouterLink to="/support" class="billing-support-link__link">Contact support →</RouterLink>
    </p>
  </DashboardLayout>
</template>

<style scoped>
.billing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 1.25rem;
}

/* Installments card — sits between Subscription and Pending Charges,
   uses the same billing-card shell + row treatment as the invoice
   lists so the visual language stays consistent. */
.billing-installments__hint {
  font-size: 0.8125rem;
  color: var(--color-text-secondary, var(--color-text));
  margin: 0 0 0.75rem;
  line-height: 1.5;
}

.billing-installment-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background-color: var(--color-bg);
  margin-bottom: 0.5rem;
}

.billing-installment-row:last-child {
  margin-bottom: 0;
}

.billing-installment-row--overdue {
  /* Same soft-amber pattern as the Overview warning banner so overdue
     reads consistently across the app. */
  background-color: color-mix(in srgb, #d97706 8%, transparent);
  border-color: color-mix(in srgb, #d97706 35%, transparent);
}

.billing-installment-row__info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.billing-installment-row__label {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.billing-installment-row__amount {
  font-size: 0.875rem;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.billing-installment-row__date {
  font-size: 0.75rem;
  color: var(--color-text-secondary, var(--color-text));
}

/* Pending charges — each block is one amount due. Paired invoices
   (alternative ways to pay the same charges) collapse into a single
   block: one total, one primary button, and quiet "pay separately"
   links, so the card never reads as a stack of separate bills. */
.billing-due {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: var(--border-radius);
  background-color: var(--color-bg);
}

.billing-due__total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.billing-due__label {
  font-size: 0.875rem;
  color: var(--color-text);
}

.billing-due__amount {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.billing-due__lines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.billing-due__lines li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-variant-numeric: tabular-nums;
}

.billing-due__lines li span:last-child {
  white-space: nowrap;
}

.billing-due__line-link {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  /* Also used on a <button> (Pay Early line) — reset it to read as a link */
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: var(--color-primary);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.billing-due__line-link:hover {
  opacity: 0.85;
}

.billing-due__line-link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.billing-due__line--paid span:first-child {
  text-decoration: line-through;
}

.billing-due__hint {
  margin: 0;
  font-size: 0.75rem;
  text-align: center;
  color: var(--color-text-secondary, var(--color-text));
}

.billing-due__alt {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
  font-size: 0.8125rem;
}

/* Credit on account — sits above the charges so the client sees it before
   anything they owe. Green, like the "Paid" badge: it's money in their favour. */
.billing-credit {
  margin: 1.25rem 1.25rem 0;
  padding: 0.75rem 0.9rem;
  border-radius: var(--border-radius);
  border: 1px solid color-mix(in srgb, #059669 30%, transparent);
  background-color: color-mix(in srgb, #059669 8%, transparent);
}

.billing-credit__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.billing-credit__label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
}

.billing-credit__amount {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-up, #059669);
  font-variant-numeric: tabular-nums;
}

.billing-credit__note {
  margin: 0.3rem 0 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--color-text-secondary, var(--color-text));
}

.billing-detail__value--credit {
  color: var(--color-up, #059669);
}

.billing-support-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  margin-top: 1.5rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary, var(--color-text));
}

.billing-support-link__link {
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 500;
}

.billing-support-link__link:hover {
  text-decoration: underline;
}

.billing-card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  overflow: hidden;
}

.billing-card__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
}

.billing-card__header h3 {
  font-family: var(--font-heading);
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.billing-card__body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.billing-card__empty {
  padding: 2rem 1.25rem;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.billing-card__empty p {
  margin: 0;
}

/* Details */
.billing-detail {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.billing-detail__label {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.billing-detail__value {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text);
}

/* Badges */
.billing-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.625rem;
  border-radius: 999px;
}

.billing-badge--active {
  background-color: rgba(16, 185, 129, 0.12);
  color: #059669;
}

.billing-badge--past_due {
  background-color: rgba(245, 158, 11, 0.12);
  color: #d97706;
}

.billing-badge--canceled,
.billing-badge--incomplete_expired {
  background-color: rgba(239, 68, 68, 0.12);
  color: #dc2626;
}

.billing-badge--trialing {
  background-color: rgba(99, 102, 241, 0.12);
  color: #4f46e5;
}

/* Invoice rows */
.billing-invoice-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem;
  border-radius: var(--border-radius);
  background-color: var(--color-bg);
}

.billing-invoice-row__info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.billing-invoice-row__amount {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text);
}

.billing-invoice-row__desc {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.billing-invoice-row__date {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.billing-invoice-row__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

/* Payment method */
.billing-payment-method {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border-radius: var(--border-radius);
  background-color: var(--color-bg);
}

.billing-payment-method__card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--color-text);
}

.billing-payment-method__card > div {
  display: flex;
  flex-direction: column;
}

.billing-payment-method__brand {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
}

.billing-payment-method__number {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  letter-spacing: 0.05em;
}

.billing-payment-method__exp {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

/* Buttons */
.billing-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border-radius: var(--border-radius);
  font-size: 0.875rem;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s ease;
  text-decoration: none;
  /* Keep label + icon on one line — otherwise "Pay Now" and "Pay Early"
     wrap in the narrow right-column of invoice rows. */
  white-space: nowrap;
}

.billing-btn:hover {
  opacity: 0.85;
}

.billing-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.billing-btn--primary {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
}

.billing-btn--secondary {
  background-color: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.billing-btn--sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
}

.billing-btn--full {
  width: 100%;
}

.billing-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem;
  border-radius: var(--border-radius);
  color: var(--color-text-secondary);
  transition: background-color 0.15s ease;
}

.billing-icon-btn:hover {
  background-color: var(--color-border);
}

/* Notice */
.billing-notice {
  font-size: 0.8125rem;
  padding: 0.625rem 0.75rem;
  border-radius: var(--border-radius);
}

.billing-notice--warning {
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

/* States */
.billing-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 4rem 2rem;
  text-align: center;
  color: var(--color-text-secondary);
}

.billing-placeholder__icon {
  opacity: 0.3;
}

.billing-placeholder h2 {
  font-family: var(--font-heading);
  color: var(--color-text);
  margin: 0;
}

.billing-placeholder p {
  max-width: 400px;
  line-height: 1.5;
}

.billing-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 4rem 2rem;
  color: var(--color-text-secondary);
}

.billing-loading__spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.billing-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: var(--border-radius);
  background-color: rgba(239, 68, 68, 0.08);
  color: #dc2626;
  font-size: 0.875rem;
}
</style>

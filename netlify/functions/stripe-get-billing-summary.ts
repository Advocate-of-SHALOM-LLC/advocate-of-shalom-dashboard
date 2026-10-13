import Stripe from 'stripe';

interface BillingSummary {
  subscription: {
    id: string;
    status: string;
    planName: string;
    amount: number;
    currency: string;
    interval: string;
    nextBillingDate: number | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  pendingCharges: Array<{
    id: string;
    number: string | null;
    amount: number;
    currency: string;
    description: string | null;
    created: number;
    dueDate: number | null;
    hostedInvoiceUrl: string | null;
    /**
     * Set when the Pipeline Dashboard issued this invoice as one of several
     * alternatives for the same charges (metadata.pair_id). Invoices sharing
     * a pairId are options, not separate bills — paying one voids the ones
     * it makes redundant.
     */
    pairId: string | null;
    /** What the invoice covers, so the UI can show more than a number. */
    lineItems: Array<{ description: string | null; amount: number; installmentNumber: number | null }>;
    /** Installments this invoice bills (line/invoice metadata.installmentNumber). */
    installmentNumbers: number[];
    /** Subscription that generated the invoice, if any. */
    subscriptionId: string | null;
  }>;
  recentPayments: Array<{
    id: string;
    number: string | null;
    amount: number;
    currency: string;
    description: string | null;
    created: number;
    paidAt: number | null;
    hostedInvoiceUrl: string | null;
    invoicePdf: string | null;
  }>;
  paymentMethod: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
}

export async function handler(event: { queryStringParameters: Record<string, string> | null; headers: Record<string, string> }) {
  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const customerId = event.queryStringParameters?.customerId;
  if (!customerId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing customerId' }) };
  }

  const stripeConfig = process.env.STRIPE_CONFIG;
  if (!stripeConfig) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Stripe not configured' }) };
  }

  try {
    const { secretKey } = JSON.parse(stripeConfig);
    const stripe = new Stripe(secretKey);

    // Fetch customer with default payment method expanded
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });

    if (customer.deleted) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Customer not found' }) };
    }

    // Fetch active subscriptions (expand limited to 3 levels)
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 1,
      expand: ['data.default_payment_method'],
    });

    let subscription: BillingSummary['subscription'] = null;
    if (subscriptions.data.length > 0) {
      const sub = subscriptions.data[0];
      const item = sub.items.data[0];
      // Fetch product name separately to avoid deep expand
      let productName = 'Subscription';
      if (item?.price?.product) {
        const productId = typeof item.price.product === 'string' ? item.price.product : item.price.product.id;
        try {
          const product = await stripe.products.retrieve(productId);
          productName = product.name;
        } catch { /* fallback to default */ }
      }

      subscription = {
        id: sub.id,
        status: sub.status,
        planName: productName,
        amount: item?.price?.unit_amount || 0,
        currency: item?.price?.currency || 'usd',
        interval: item?.price?.recurring?.interval || 'month',
        // current_period_end moved from the subscription to its items in
        // newer Stripe API versions — read both. A cancelled subscription
        // keeps its old period end but will never bill again.
        nextBillingDate:
          sub.status === 'canceled'
            ? null
            : (item as any)?.current_period_end ?? (sub as any).current_period_end ?? null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      };
    }

    // Fetch open invoices (pending charges)
    const openInvoices = await stripe.invoices.list({
      customer: customerId,
      status: 'open',
      limit: 10,
    });

    const pendingCharges: BillingSummary['pendingCharges'] = openInvoices.data.map((inv) => {
      const lines = inv.lines?.data ?? [];

      // installmentNumber lives on the line for combined invoices and on the
      // invoice itself for pay-early one-offs — collect from both.
      const installmentNumbers = [inv.metadata?.installmentNumber, ...lines.map((l) => l.metadata?.installmentNumber)]
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0);

      // The subscription reference moved under `parent` in newer Stripe API
      // versions; read both so this survives an account-level version bump.
      const subRef =
        (inv as any).parent?.subscription_details?.subscription ?? (inv as any).subscription ?? null;

      return {
        id: inv.id,
        number: inv.number,
        amount: inv.amount_due,
        currency: inv.currency,
        description: inv.description,
        created: inv.created,
        dueDate: inv.due_date,
        hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
        pairId: inv.metadata?.pair_id || null,
        lineItems: lines.map((l) => ({
          description: l.description,
          amount: l.amount,
          installmentNumber: Number(l.metadata?.installmentNumber) || null,
        })),
        installmentNumbers: [...new Set(installmentNumbers)],
        subscriptionId: typeof subRef === 'string' ? subRef : subRef?.id ?? null,
      };
    });

    // Fetch recent paid invoices
    const paidInvoices = await stripe.invoices.list({
      customer: customerId,
      status: 'paid',
      limit: 10,
    });

    const recentPayments: BillingSummary['recentPayments'] = paidInvoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      amount: inv.amount_paid,
      currency: inv.currency,
      description: inv.description,
      created: inv.created,
      paidAt: inv.status_transitions?.paid_at ?? null,
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      invoicePdf: inv.invoice_pdf ?? null,
    }));

    // Default payment method
    let paymentMethod: BillingSummary['paymentMethod'] = null;
    const defaultPM = customer.invoice_settings?.default_payment_method;
    if (defaultPM && typeof defaultPM === 'object' && 'card' in defaultPM && defaultPM.card) {
      paymentMethod = {
        brand: defaultPM.card.brand || 'unknown',
        last4: defaultPM.card.last4 || '****',
        expMonth: defaultPM.card.exp_month || 0,
        expYear: defaultPM.card.exp_year || 0,
      };
    }

    const summary: BillingSummary = {
      subscription,
      pendingCharges,
      recentPayments,
      paymentMethod,
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, ...summary }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Billing summary error:', message);
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
}

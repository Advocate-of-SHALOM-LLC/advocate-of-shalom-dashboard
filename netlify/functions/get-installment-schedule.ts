// Installment schedule proxy.
//
// The browser calls this; this function forwards to the Client Dashboard's
// installment API (running at INSTALLMENT_API_BASE_URL) using the shared
// secret. Keeps the secret server-side so it never leaves Netlify.
//
// Contract per docs/installment-billing-handoff.md §4 (Client Dashboard side):
//   GET .../get-installment-schedule?stripeCustomerId=cus_XXX
//   Response: { success, clientId, stripeSubscriptionId, installments: [...] }

interface UpstreamInstallment {
  n: number;
  amountCents: number;
  currency: string;
  dueDate: string;
  status: 'paid' | 'upcoming' | 'overdue';
  paidOn?: string | null;
  stripeInvoiceId?: string | null;
}

interface UpstreamResponse {
  success: boolean;
  clientId?: string;
  stripeSubscriptionId?: string;
  installments?: UpstreamInstallment[];
  error?: string;
}

export async function handler(event: {
  httpMethod: string;
  headers: Record<string, string>;
  queryStringParameters: Record<string, string> | null;
}) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Presence-only Auth0 gate — same pattern as stripe-get-billing-summary.
  // The dashboard sends a bearer token from getAccessTokenSilently.
  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const stripeCustomerId = event.queryStringParameters?.stripeCustomerId;
  if (!stripeCustomerId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing stripeCustomerId' }) };
  }

  const baseUrl = process.env.INSTALLMENT_API_BASE_URL;
  const secret = process.env.INSTALLMENT_API_SECRET;

  if (!baseUrl || !secret) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Installment API not configured',
        message: 'INSTALLMENT_API_BASE_URL and INSTALLMENT_API_SECRET must be set.',
      }),
    };
  }

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/.netlify/functions/get-installment-schedule?stripeCustomerId=${encodeURIComponent(stripeCustomerId)}`;
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
    });

    // 404 upstream = this customer isn't on installments. Return an empty
    // schedule rather than an error — the UI silently hides the card in
    // that case.
    if (upstream.status === 404) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, installments: [] }),
      };
    }

    const body: UpstreamResponse = await upstream.json();

    if (!upstream.ok || !body.success) {
      console.error('Installment schedule upstream error:', upstream.status, body);
      return {
        statusCode: upstream.status,
        body: JSON.stringify({
          error: body.error || 'Failed to load installment schedule',
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(body),
    };
  } catch (err) {
    console.error('Installment schedule proxy error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to reach installment API' }),
    };
  }
}

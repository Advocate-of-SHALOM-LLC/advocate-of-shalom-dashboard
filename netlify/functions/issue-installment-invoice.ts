// Early-payment invoice issuer.
//
// Client clicks "Pay Early" on an upcoming installment. Browser hits this
// function, which forwards to the Client Dashboard's issue-installment-invoice
// endpoint using the shared secret. That endpoint is idempotent per
// (clientId, installmentNumber) and returns a Stripe hosted invoice URL
// that the client can pay right away. The Stripe webhook on the Client
// Dashboard side is responsible for voiding the corresponding
// subscription-generated invoice so the client isn't double-charged.
//
// Contract per docs/installment-billing-handoff.md §4:
//   POST .../issue-installment-invoice { stripeCustomerId, installmentNumber }
//   Response 200: { success, invoiceId, hostedInvoiceUrl, amountCents, installmentNumber }
//   Response 409: { success, invoiceId, hostedInvoiceUrl, ... } — already paid
//                  or an unpaid one-off already exists (still returned so the
//                  UI can just open it — the caller doesn't need to distinguish)

interface UpstreamResponse {
  success: boolean;
  invoiceId?: string;
  hostedInvoiceUrl?: string;
  amountCents?: number;
  installmentNumber?: number;
  error?: string;
}

export async function handler(event: {
  httpMethod: string;
  headers: Record<string, string>;
  body: string | null;
}) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let payload: { stripeCustomerId?: string; installmentNumber?: number };
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { stripeCustomerId, installmentNumber } = payload;
  if (!stripeCustomerId || typeof installmentNumber !== 'number') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing stripeCustomerId or installmentNumber' }),
    };
  }

  const baseUrl = process.env.INSTALLMENT_API_BASE_URL;
  const secret = process.env.INSTALLMENT_API_SECRET;

  if (!baseUrl || !secret) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Installment API not configured' }),
    };
  }

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/.netlify/functions/issue-installment-invoice`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ stripeCustomerId, installmentNumber }),
    });

    const body: UpstreamResponse = await upstream.json();

    // Both 200 (fresh invoice) and 409 (already-issued idempotent hit)
    // carry a hostedInvoiceUrl — the caller opens it either way. Only
    // treat other error codes as failures.
    if (upstream.status === 200 || upstream.status === 409) {
      return { statusCode: 200, body: JSON.stringify(body) };
    }

    console.error('Issue installment invoice upstream error:', upstream.status, body);
    return {
      statusCode: upstream.status,
      body: JSON.stringify({ error: body.error || 'Failed to issue invoice' }),
    };
  } catch (err) {
    console.error('Issue installment invoice proxy error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to reach installment API' }),
    };
  }
}

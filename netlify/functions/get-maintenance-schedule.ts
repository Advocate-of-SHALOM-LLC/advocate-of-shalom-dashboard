// Maintenance schedule proxy.
//
// Companion to get-installment-schedule. The Client Dashboard side has
// its own maintenance schedule endpoint because Stripe encodes "quarterly"
// as interval='month' + interval_count=3 — reading price.recurring.interval
// directly always returns 'month' and prints "$850.00/month" in the UI even
// when the subscription is actually quarterly. The upstream endpoint hides
// that quirk and returns a display-ready cycleShortLabel ("quarter").
//
// Contract per installment-billing-handoff.md §4:
//   GET .../get-maintenance-schedule?stripeCustomerId=cus_XXX
//   Response: { cycleLabel, cycleShortLabel, amountCents, nextChargeDate, ... }

interface UpstreamResponse {
  success: boolean;
  cycleLabel?: string;
  cycleShortLabel?: string;
  amountCents?: number;
  nextChargeDate?: string;
  error?: string;
  [key: string]: unknown;
}

export async function handler(event: {
  httpMethod: string;
  headers: Record<string, string>;
  queryStringParameters: Record<string, string> | null;
}) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

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
    const url = `${baseUrl.replace(/\/$/, '')}/.netlify/functions/get-maintenance-schedule?stripeCustomerId=${encodeURIComponent(stripeCustomerId)}`;
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
    });

    // 404 = this customer isn't on maintenance. Return a benign empty
    // success so the UI can fall back to the raw Stripe interval label.
    if (upstream.status === 404) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      };
    }

    const body: UpstreamResponse = await upstream.json();

    if (!upstream.ok || !body.success) {
      console.error('Maintenance schedule upstream error:', upstream.status, body);
      return {
        statusCode: upstream.status,
        body: JSON.stringify({
          error: body.error || 'Failed to load maintenance schedule',
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(body),
    };
  } catch (err) {
    console.error('Maintenance schedule proxy error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to reach maintenance API' }),
    };
  }
}

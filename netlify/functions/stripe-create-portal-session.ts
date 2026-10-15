import Stripe from 'stripe';

import { requireUser } from '../lib/auth';
import dashboardConfig from '../../src/config/dashboard';

interface RequestBody {
  returnUrl?: string;
}

// Stripe sends the client back here when they leave the portal. Only a page
// on this dashboard is accepted, so the portal can't be used to bounce
// someone to another site.
function safeReturnUrl(requested: string | undefined, origin: string | undefined): string {
  const fallback = `${origin || process.env.URL || 'https://localhost:8888'}/billing`;
  if (!requested || !origin) return fallback;
  try {
    const url = new URL(requested);
    return url.origin === origin ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

export async function handler(event: { body: string | null; headers: Record<string, string> }) {
  const auth = await requireUser(event.headers);
  if ('response' in auth) return auth.response;

  if (event.body === null) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing request body' }) };
  }

  const stripeConfig = process.env.STRIPE_CONFIG;
  if (!stripeConfig) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Stripe not configured' }) };
  }

  try {
    const { secretKey } = JSON.parse(stripeConfig);
    const stripe = new Stripe(secretKey);
    const { returnUrl } = JSON.parse(event.body) as RequestBody;

    // Always this dashboard's own customer — never one named in the request.
    const customerId = dashboardConfig.billing?.stripeCustomerId;
    if (!customerId) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Billing is not set up for this dashboard' }) };
    }

    const origin = event.headers['origin'] || event.headers['Origin'];
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: safeReturnUrl(returnUrl, origin),
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, url: session.url }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Portal session error:', message);
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
}

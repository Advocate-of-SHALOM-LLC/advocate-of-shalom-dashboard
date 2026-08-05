export type WidgetType =
  | 'siteAnalytics'
  | 'tutorials'
  | 'links'
  | 'contentEditors';

export interface TutorialVideo {
  title: string;
  url: string;
  category?: string;
  description?: string;
}

/**
 * Unified dashboard link. Without a description renders as a compact pill
 * (the former Quick Action). With a description renders as a resource card
 * (the former Helpful Link).
 */
export interface DashboardLink {
  label: string;
  url: string;
  emoji?: string;
  description?: string;
}

export interface ContentEditor {
  label: string;
  documentType: string;
  description?: string;
}

export interface BillingConfig {
  stripeCustomerId: string;
  showPendingCharges: boolean;
  showOfflineInvoices: boolean;
  /**
   * How this client is billed. 'auto' = Stripe charges a card automatically
   * on renewal (the standard path). 'invoice' = Stripe emails an invoice
   * each period and the client pays from the hosted URL — no card required,
   * but they can still opt into auto-pay by adding one via the portal.
   * Defaults to 'auto' when omitted.
   */
  collectionMethod?: 'auto' | 'invoice';
}

export interface AnalyticsConfig {
  provider: 'simple-analytics' | 'ga4';
  /** Simple Analytics: client domain (e.g. "acmeplumbing.com") */
  simpleAnalyticsId?: string;
  /** GA4: measurement ID (e.g. "G-XXXXXXXXXX") */
  analyticsId?: string;
  /** Dashboard routes filtered from public traffic view */
  internalRoutes?: string[];
  /** Goal page slug for visitor journey funnel (default: '/contact') */
  conversionPage?: string;
}

export interface DashboardAnnouncement {
  /** Body text shown to the client. Keep it short — one or two sentences. */
  message: string;
  /**
   * Visual weight. 'info' = neutral, 'success' = new-feature/positive,
   * 'warning' = heads-up (scheduled maintenance, etc.), 'critical' = incident.
   * Defaults to 'info'.
   */
  level?: 'info' | 'success' | 'warning' | 'critical';
  /** Optional CTA appended to the message (e.g. "Learn more"). */
  link?: { label: string; url: string };
}

export interface DashboardConfig {
  clientId: string;
  clientName: string;
  clientDomain: string;
  clientEmail: string;
  /**
   * Primary contact person for this client — used as the default Name in
   * the Support form so submissions default to the client's canonical
   * point of contact, not whoever happens to be logged in for testing.
   * Team members can override it in the form before submitting.
   */
  clientContactName?: string;
  /**
   * Path (from public/) to a square logo/icon rendered in the sidebar.
   * When omitted, the sidebar falls back to a colored circle showing
   * the first letter of clientName.
   */
  clientLogo?: string;
  /**
   * Optional banner rendered above the Overview widgets. Push messages
   * to the client by setting this and committing — no runtime API needed.
   * Set to undefined (or remove) to hide it.
   */
  announcement?: DashboardAnnouncement;
  enabledWidgets: string[];
  tutorialVideos: TutorialVideo[];
  links: DashboardLink[];
  contentEditors: ContentEditor[];
  billing?: BillingConfig;
  analytics?: AnalyticsConfig;
}

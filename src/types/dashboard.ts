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

export interface ContentKitSection {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  required: boolean;
}

export interface ContentKitConfig {
  enabled: boolean;
  sections: ContentKitSection[];
  maxPersonalityPicks?: number;
  welcomeMessage?: string;
  completionEmailNotify?: boolean;
}

export interface DashboardConfig {
  clientId: string;
  clientName: string;
  clientDomain: string;
  clientEmail: string;
  enabledWidgets: string[];
  tutorialVideos: TutorialVideo[];
  links: DashboardLink[];
  contentEditors: ContentEditor[];
  billing?: BillingConfig;
  analytics?: AnalyticsConfig;
  contentKit?: ContentKitConfig;
}

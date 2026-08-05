import type { DashboardConfig } from '@/types/dashboard';

const config: DashboardConfig = {
  "clientId": "4b53fb97fe44cde2b9e8fdea99e36b0b",
  "clientName": "Advocate Of Shalom",
  "clientDomain": "advocateofshalom.com",
  "clientEmail": "elyse@advocateofshalom.com",
  "clientContactName": "Elyse",
  "clientLogo": "/apple-touch-icon.png",
  "announcement": {
    "message": "You can now pay upcoming installments ahead of schedule from the Billing page.",
    "level": "info",
    "link": { "label": "See installments", "url": "/billing" }
  },
  "enabledWidgets": [
    "links",
    "siteAnalytics"
  ],
  "tutorialVideos": [],
  "links": [
    {
      "label": "Live Site",
      "url": "https://advocateofshalom.com",
      "emoji": "🌐"
    },
    {
      "label": "Facebook",
      "url": "https://facebook.com/advocateofshalom",
      "emoji": "📘"
    },
    {
      "label": "LinkedIn",
      "url": "https://www.linkedin.com/company/advocate-of-shalom",
      "emoji": "💼"
    },
    {
      "label": "Google Profile",
      "url": "https://maps.app.goo.gl/QWLh2kmJxwAxdG2i6",
      "emoji": "📍"
    },
    {
      "label": "Sanity Studio",
      "url": "https://studio.advocateofshalom.com",
      "emoji": "✏️",
      "description": "Edit your content"
    },
    {
      "label": "Netlify Site",
      "url": "https://app.netlify.com/projects/advocate-of-shalom",
      "emoji": "🚀",
      "description": "Deploy history and site logs"
    }
  ],
  "contentEditors": [],
  "billing": {
    "stripeCustomerId": "cus_UVmyRmEDdIrC1H",
    "showPendingCharges": true,
    "showOfflineInvoices": true,
    "collectionMethod": "invoice"
  },
  "analytics": {
    "provider": "simple-analytics",
    "simpleAnalyticsId": "advocateofshalom.com",
    "internalRoutes": [
      "/analytics",
      "/billing",
      "/social",
      "/support"
    ],
    "conversionPage": "/contact"
  }
};

export default config;

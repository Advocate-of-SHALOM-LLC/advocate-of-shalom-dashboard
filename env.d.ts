/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_AUTH0_DOMAIN: string;
  readonly VITE_AUTH0_CLIENT_ID: string;
  readonly VITE_SANITY_DATASET: string;
  /** Google PageSpeed Insights key for the Site Health widget (browser-side, restrict by referrer). */
  readonly VITE_GOOGLE_PAGESPEED_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

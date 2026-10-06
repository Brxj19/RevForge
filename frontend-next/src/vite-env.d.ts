/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional API origin override; defaults to same-origin (/api proxied by Vite in dev). */
  readonly VITE_API_BASE_URL?: string;
  /** "1" starts the MSW worker (npm run dev:mock). */
  readonly VITE_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

/** package.json version, injected by vite.config.ts. */
declare const __APP_VERSION__: string;

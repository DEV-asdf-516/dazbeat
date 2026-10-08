/// <reference types="vite/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_POCKETBASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

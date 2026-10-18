/// <reference types="astro/client" />

declare module '*.html?raw' {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly OPENROUTER_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

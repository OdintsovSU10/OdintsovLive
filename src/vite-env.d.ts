/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FOT_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

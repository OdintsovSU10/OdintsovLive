/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FOT_API?: string
  readonly VITE_FOT_TIMESHEET_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __APP_BUILD_VERSION__: string

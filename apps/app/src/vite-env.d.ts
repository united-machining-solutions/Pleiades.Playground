/// <reference types="vite/client" />

// What `define` in vite.config.ts writes in: the build the sidebar names (see components/app-version.ts).
interface ImportMetaEnv {
  readonly APP_VERSION: string
  readonly APP_REVISION: string
  readonly APP_SOURCE: string
}

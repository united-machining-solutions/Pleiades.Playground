import { definePlugin } from "nitro"

import { startHubRegistration, stopHubRegistration } from "./registration.server.ts"

// A plugin of Nitro, the server under TanStack Start: vite.config.ts names this file. Nitro runs
// it once when the server starts, in development and in the built server, so the app is in the
// hub before anyone opens a page.
export default definePlugin((nitroApp) => {
  try {
    startHubRegistration()
  } catch (error) {
    // Invalid settings: one line names the setting. The built server then does not start, because
    // a server that ran without the registration would look fine and be missing in the hub. The
    // development server goes on without the registration: Nitro starts its server process again
    // whenever it ends, so an exit there would only repeat this line without an end.
    console.error(error instanceof Error ? error.message : error)
    if (!import.meta.dev) process.exit(1)
  }
  // Nitro closes the server on SIGTERM and SIGINT. The sign-off makes the hub drop the app at
  // once, and it ends the connection, which would otherwise keep the process alive.
  nitroApp.hooks.hook("close", () => stopHubRegistration())
})

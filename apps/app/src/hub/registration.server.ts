import { createHubClient } from "@pleiades/hub-sdk"
import type { HubClient } from "@pleiades/hub-sdk"

import { hubRegistration, hubSettings } from "./settings.ts"

// The registration of the app at the Pleiades Hub. It runs on the server only: the connection to
// the broker of the hub belongs to the server, and its URL may carry a password.

// The one hub client of this process. It hangs on globalThis and not in a variable of this
// module: the development server evaluates the module again after a change, and the second
// evaluation must find the connection of the first one instead of opening another.
const key = Symbol.for("pleiades.playground.hub-client")
const store = globalThis as typeof globalThis & { [key]?: HubClient }

// What went wrong, in one line. A refused connection to "localhost" is an AggregateError without
// a message of its own: it holds one error per address.
function describe(error: Error): string {
  if (error.message) return error.message
  if (error instanceof AggregateError) return error.errors.map((inner: Error) => describe(inner)).join(", ")
  return (error as NodeJS.ErrnoException).code ?? error.name
}

/**
 * Registers the app at the hub if the settings name its broker, and once per process: a second
 * call finds the client of the first one and does nothing. Invalid settings throw. A broker that
 * cannot be reached does not: the client goes on trying on its own, and the app does not wait.
 */
export function startHubRegistration(): void {
  if (store[key]) return
  const settings = hubSettings(process.env)
  if (!settings) return
  const { clientId, apps } = hubRegistration(settings.appUrl)
  // The client tries again every two seconds, and a broker that is down fails the same way each
  // time: every distinct message is logged once.
  const reported = new Set<string>()
  store[key] = createHubClient({
    brokerUrl: settings.brokerUrl,
    clientId,
    apps,
    onError: (error) => {
      const message = describe(error)
      if (reported.has(message)) return
      reported.add(message)
      console.error(`Hub registration: ${message}`)
    },
  })
  // The address, and not the broker: its URL may carry a password.
  console.log(`Hub registration: "${clientId}" registers at the Pleiades Hub with the address ${settings.appUrl}`)
}

/**
 * Signs the app off at the hub and ends the connection, so the hub drops the app at once. It
 * never rejects, and it does nothing where the app is not registered. A process that ends without
 * it is signed off by the broker, through the Last Will of the connection.
 */
export function stopHubRegistration(): Promise<void> {
  const client = store[key]
  if (!client) return Promise.resolve()
  delete store[key]
  return client.stop()
}

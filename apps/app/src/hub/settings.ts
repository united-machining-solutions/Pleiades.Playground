import { validateApp } from "@pleiades/hub-sdk/contract"
import type { AppRegistration } from "@pleiades/hub-sdk/contract"

// How the app registers at the Pleiades Hub, the page that lists the apps of a plant. The
// registration is opt-in: without HUB_MQTT_URL, or with HUB_REGISTRATION=false, the app registers
// nowhere. This file reads the settings and holds what the app says about itself. It opens no
// connection and imports no MQTT client, so a test can check both.

export type HubSettings = {
  /** The MQTT broker of the hub. The URL may carry a password: it belongs in no log and no message. */
  brokerUrl: string
  /** Where a person's browser reaches the app: a URL, or a path below the address of the hub. */
  appUrl: string
}

/** What a hub client is created with, next to the URL of the broker. */
export type HubRegistration = { clientId: string; apps: Array<AppRegistration> }

// The name of the client and of its one app. It is the same at every start, so a server that
// starts again replaces the entry of the one before it.
const id = "pleiades-playground"

// Where the development server answers.
const defaultAppUrl = "http://localhost:3000/"

const brokerProtocols = ["mqtt:", "mqtts:", "ws:", "wss:"]

function isBrokerUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return brokerProtocols.includes(url.protocol) && url.hostname !== ""
  } catch {
    return false
  }
}

function playground(appUrl: string): AppRegistration {
  return {
    id,
    label: { en: "Playground", de: "Playground" },
    description: {
      en: "What every machine does now, with a chat for questions",
      de: "Was jede Maschine gerade tut, mit einem Chat für Fragen",
    },
    // Relative to the address of the app, so the icon moves with it: public/hub-icon.svg.
    icon: "hub-icon.svg",
    url: appUrl,
  }
}

/** What the app tells the hub: one client with one app, the Playground under its address. */
export function hubRegistration(appUrl: string): HubRegistration {
  return { clientId: id, apps: [playground(appUrl)] }
}

/**
 * The broker of the hub and the address of the app, or undefined where HUB_REGISTRATION is false or
 * HUB_MQTT_URL is not set or empty: then the app does not register, and HUB_APP_URL is not looked
 * at. An invalid value throws. The message names the setting and never its value.
 */
export function hubSettings(env: Readonly<Record<string, string | undefined>>): HubSettings | undefined {
  // A switch next to the broker, for a setup that cannot pass an empty value: the Margo app. Unset
  // or empty, the broker alone decides.
  const registration = env.HUB_REGISTRATION
  if (registration === "false") return undefined
  if (registration && registration !== "true") throw new Error("HUB_REGISTRATION must be true or false")
  const brokerUrl = env.HUB_MQTT_URL
  if (!brokerUrl) return undefined
  if (!isBrokerUrl(brokerUrl)) {
    throw new Error("HUB_MQTT_URL must be a URL with the scheme mqtt, mqtts, ws or wss, like mqtt://localhost:1883")
  }
  const appUrl = env.HUB_APP_URL || defaultAppUrl
  // The address is the only part of the app that comes from a setting. The hub's own check
  // decides, so its rules for an address stand in one place.
  const checked = validateApp(playground(appUrl))
  if (!checked.ok) throw new Error(`HUB_APP_URL is not an address the hub takes: ${checked.reason}`)
  return { brokerUrl, appUrl }
}

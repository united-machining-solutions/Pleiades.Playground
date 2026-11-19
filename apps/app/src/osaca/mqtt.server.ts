import mqtt from "mqtt"
import type { MqttClient } from "mqtt"

import type { Json, ModelValue, OemValue, OsacaSnapshot } from "./contract.ts"

// The OSACA cell publishes its manufacturer values below `<root>/oem/<path>` and the values of the umati data
// model below `<root>/umati/<path>`, one value envelope per topic. The server of the app holds one connection
// that only subscribes, and keeps the latest value of every topic. Nothing is ever published: this page only
// shows.

/** Where the broker is. In the stack the settings name it; the development server uses the one on this computer. */
const BROKER = process.env.OSACA_MQTT_URL ?? "mqtt://localhost:1883"
/** Which topics carry the drives: the root of the cell has two levels, `machines/<SerialNumber>` for example. */
const TOPIC = process.env.OSACA_MQTT_TOPIC ?? "+/+/oem/#"
/**
 * The root of the cell, e.g. `machines/isw_osaca2`. Optional: without it the page takes the root whose values
 * name the drives of an OSACA cell, because other machines on the same broker publish below `oem/` too.
 */
const ROOT = process.env.OSACA_MQTT_ROOT || undefined
/** The levels that separate the root of the cell from the path of a value. */
const OEM_LEVEL = "/oem/"
const UMATI_LEVEL = "/umati/"
/** A drive of an OSACA cell: the milling machine "osaka X" or the robot "stäubli 1", as path segments. */
const OSACA_DRIVE = /^Drive\/(osa[ck]a[xyzc]|st[a-z]*bli[1-6])\//i
/** How long a chosen cell stays chosen without a new value, before another cell may take its place. */
const KEEP_CHOSEN_MS = 60_000

type Root = { received: number; values: Map<string, OemValue>; umati: Map<string, ModelValue>; osaca: boolean }

type Connection = {
  client: MqttClient
  connected: boolean
  error: string | null
  /** The latest value per root, then per path, e.g. `Drive/OsakaX/ActualPosition`. */
  roots: Map<string, Root>
  /** The root the page shows. It stays while it publishes, so that the page does not jump between cells. */
  chosen: string | null
}

let connection: Connection | undefined

/** The umati values are read for the chosen cell only: the broker may carry those of many machines. */
const umatiTopicOf = (root: string) => `${root}${UMATI_LEVEL}#`

function connect(): Connection {
  const client = mqtt.connect(BROKER, {
    clientId: `pleiades-app-osaca-${Math.random().toString(16).slice(2, 10)}`,
    reconnectPeriod: 5_000,
    connectTimeout: 5_000,
  })
  const state: Connection = { client, connected: false, error: null, roots: new Map(), chosen: null }
  client.on("connect", () => {
    state.connected = true
    state.error = null
    client.subscribe(ROOT === undefined ? TOPIC : `${ROOT}${OEM_LEVEL}#`, { qos: 0 })
    const root = ROOT ?? state.chosen
    if (root !== null) client.subscribe(umatiTopicOf(root), { qos: 0 })
  })
  client.on("close", () => {
    state.connected = false
  })
  client.on("error", (error) => {
    state.error = reasonOf(error)
  })
  client.on("message", (topic, payload) => {
    const oem = topic.indexOf(OEM_LEVEL)
    const umati = topic.indexOf(UMATI_LEVEL)
    const at = oem >= 0 ? oem : umati
    if (at < 0) return
    const root = topic.slice(0, at)
    if (ROOT !== undefined && root !== ROOT) return
    const envelope = envelopeOf(payload)
    if (envelope === null) return
    let entry = state.roots.get(root)
    if (!entry) {
      entry = { received: 0, values: new Map(), umati: new Map(), osaca: false }
      state.roots.set(root, entry)
    }
    entry.received = Date.now()
    if (oem >= 0) {
      const path = topic.slice(at + OEM_LEVEL.length)
      const { value } = envelope
      if (value !== null && typeof value === "object") return
      entry.values.set(path, { ...envelope, value })
      entry.osaca ||= OSACA_DRIVE.test(path)
    } else {
      entry.umati.set(topic.slice(at + UMATI_LEVEL.length), envelope)
    }
  })
  return state
}

/** A value envelope `{ value, timestamp, unit?, correlationId? }`; anything else, a manifest say, is not a value. */
function envelopeOf(payload: Buffer): ModelValue | null {
  try {
    const parsed = JSON.parse(payload.toString("utf8")) as Record<string, Json>
    if (parsed === null || typeof parsed !== "object" || !("value" in parsed)) return null
    const { value, unit, timestamp, correlationId } = parsed
    return {
      value: value ?? null,
      ...(typeof unit === "string" && { unit }),
      ...(typeof timestamp === "string" && { timestamp }),
      ...(typeof correlationId === "string" && { correlationId }),
    }
  } catch {
    return null
  }
}

function reasonOf(error: unknown): string {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown }
  return String(code ?? message ?? error)
}

/**
 * The root the page shows: the one named in the settings, or else an OSACA cell. A cell that is chosen stays
 * while it publishes; only when it has been silent for a minute may another one take its place. A newly chosen
 * cell gets its umati values subscribed, and the cell before loses them.
 */
function choose(state: Connection): string | null {
  if (ROOT !== undefined) return state.roots.has(ROOT) ? ROOT : null
  const now = Date.now()
  const current = state.chosen === null ? undefined : state.roots.get(state.chosen)
  if (current && now - current.received < KEEP_CHOSEN_MS) return state.chosen
  const [next] = [...state.roots.entries()]
    .filter(([, entry]) => entry.osaca)
    .sort((a, b) => b[1].received - a[1].received)
  if (next && next[0] !== state.chosen) {
    if (state.chosen !== null) state.client.unsubscribe(umatiTopicOf(state.chosen))
    state.chosen = next[0]
    state.client.subscribe(umatiTopicOf(next[0]), { qos: 0 })
  }
  return state.chosen
}

/**
 * The latest values of the OSACA cell. The first call opens the connection; until the broker has answered
 * once, the answer says that it has not. Values that came stay while the connection is renewed.
 */
export function readOsaca(): { values: OsacaSnapshot; error: null } | { values: null; error: string } {
  connection ??= connect()
  const { connected, error, roots } = connection
  const root = choose(connection)
  const entry = root === null ? undefined : roots.get(root)
  if (!connected && !entry) {
    return { values: null, error: `The broker at ${BROKER} did not answer${error ? `: ${error}` : ""}.` }
  }
  return {
    values: {
      broker: BROKER,
      topic: TOPIC,
      connected,
      root,
      received: entry ? new Date(entry.received).toISOString() : null,
      values: entry ? Object.fromEntries(entry.values) : {},
      umati: entry ? Object.fromEntries(entry.umati) : {},
    },
    error: null,
  }
}

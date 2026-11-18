import mqtt from "mqtt"
import type { MqttClient } from "mqtt"

import { randomId } from "../random-id.ts"
import { getBrokerAddress } from "./broker-address.ts"
import { matches } from "./messages.ts"

// The one connection of the browser to the broker, MQTT over WebSocket. Every page that is live
// subscribes through it to the topics it shows, and hears every value the moment it is published.
// It reads; it never publishes.

type Listener = (topic: string, payload: string) => void

/** Whether the browser hears the broker now, and how often it has connected so far. */
export type BrokerStatus = { connected: boolean; connections: number; address: string | null }

/** How long the browser waits before it tries again when the broker is away. */
const RECONNECT_MS = 2_000

let client: MqttClient | null = null
let status: BrokerStatus = { connected: false, connections: 0, address: null }
const statusListeners = new Set<() => void>()
const listeners = new Map<Listener, ReadonlyArray<string>>()
/** How many listeners want each topic filter: the broker is asked for a filter once. */
const wanted = new Map<string, number>()

function setStatus(next: Partial<BrokerStatus>) {
  status = { ...status, ...next }
  for (const listener of statusListeners) listener()
}

/** How far the clock of the server is ahead of the clock of this browser, in milliseconds. */
let offset = 0

/**
 * Now, by the clock of the server. Whether a machine is silent is read against it, as the backend
 * reads it: the clock of a laptop in a workshop may be minutes off.
 */
export function serverNow(): string {
  return new Date(Date.now() + offset).toISOString()
}

async function addressOf(): Promise<string> {
  const asked = Date.now()
  const { url, port, now } = await getBrokerAddress()
  // The server read its clock about halfway between the question and the answer.
  offset = Date.parse(now) - (asked + Date.now()) / 2
  if (url) return url
  const scheme = window.location.protocol === "https:" ? "wss" : "ws"
  return `${scheme}://${window.location.hostname}:${port}`
}

/** Connects once, the first time a page subscribes. */
async function connect() {
  const address = await addressOf()
  setStatus({ address })
  // A client of its own name, so that two tabs do not throw each other out.
  const connection = mqtt.connect(address, {
    protocolVersion: 5,
    clean: true,
    clientId: `pleiades-app-${randomId().slice(0, 8)}`,
    reconnectPeriod: RECONNECT_MS,
    connectTimeout: 10_000,
    // This module asks for the filters again after every connect, so the client does not.
    resubscribe: false,
  })
  connection.on("connect", () => {
    if (wanted.size > 0) connection.subscribe([...wanted.keys()], { qos: 0 })
    setStatus({ connected: true, connections: status.connections + 1 })
  })
  connection.on("close", () => {
    if (status.connected) setStatus({ connected: false })
  })
  connection.on("message", (topic, payload) => {
    const text = payload.toString()
    for (const [listener, filters] of listeners) {
      if (filters.some((filter) => matches(filter, topic))) listener(topic, text)
    }
  })
  client = connection
}

let connecting: Promise<void> | null = null

/** Hears the values of the topics that match the filters, until the function it returns is called. */
export function subscribe(filters: ReadonlyArray<string>, listener: Listener): () => void {
  listeners.set(listener, filters)
  const added = filters.filter((filter) => {
    const count = wanted.get(filter) ?? 0
    wanted.set(filter, count + 1)
    return count === 0
  })
  if (client?.connected && added.length > 0) client.subscribe(added, { qos: 0 })
  connecting ??= connect().catch((error: unknown) => {
    // The address could not be read: the server of the app is away. The next page tries again.
    console.error("No connection to the broker:", error)
    connecting = null
  })

  return () => {
    listeners.delete(listener)
    const gone = filters.filter((filter) => {
      const count = (wanted.get(filter) ?? 1) - 1
      if (count > 0) wanted.set(filter, count)
      else wanted.delete(filter)
      return count === 0
    })
    if (client?.connected && gone.length > 0) client.unsubscribe(gone)
  }
}

export function onBrokerStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

export function brokerStatus(): BrokerStatus {
  return status
}

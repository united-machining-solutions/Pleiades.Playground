// Reads the state of the SimpleCAM machine 9042 from the SSE stream of the SimpleCAM backend and publishes it
// to the broker as the MQTT binding of the data model says (contracts/mqtt/README.md): the manifest before the
// values, every value retained with QoS 1, and Connection/State as the state of this adapter.
import { randomUUID } from "node:crypto"
import http from "node:http"
import mqtt from "mqtt"
import {
  ACTIVE_ALERTS,
  ADAPTER_OWNED,
  CONNECTION_STATE,
  EVENT_CONTENT_TYPE,
  HEARTBEAT,
  activityReadings,
  alertChanges,
  buildManifest,
  cloudEvent,
  envelope,
  extensionPrefix,
  isAlert,
  machineId,
  manifestTopic,
  readingsOf,
  sequenceOf,
  topicOf,
  unavailablePaths,
  type Alert,
  type AlertChange,
  type Manifest,
  type Reading,
} from "./binding.ts"

const SSE_URL = process.env.SIMPLECAM_SSE_URL ?? "http://localhost:5450/stream/machine-9042/state"
const BROKER_URL = process.env.MQTT_BROKER_URL ?? "mqtt://broker:1883"
const CLIENT_ID = process.env.MQTT_CLIENT_ID ?? "simplecam-adapter-9042"
const HEALTH_PORT = Number(process.env.HEALTH_PORT ?? 3042)
// The backend's stream says no model and no URI of the manufacturer; the machine id is formed from them.
const MANUFACTURER_URI = process.env.SIMPLECAM_MANUFACTURER_URI ?? "https://www.united-grinding.com"
const MODEL = process.env.SIMPLECAM_MODEL ?? "simplecam"
const SERIAL_NUMBER = process.env.SIMPLECAM_SERIAL_NUMBER ?? "9042"

const HEARTBEAT_SECONDS = 10
// How many events wait at most while they cannot go out; when it is full, the oldest is dropped and logged.
const OUTBOX_CAPACITY = 10_000
const RETRY_MS = 5000
// The backend sends something every ten seconds. A stream that is silent for longer is taken as lost.
const SILENCE_MS = 35_000

const MACHINE_ID = machineId(MANUFACTURER_URI, MODEL, SERIAL_NUMBER)
const SIGNAL_PREFIX = extensionPrefix(MANUFACTURER_URI)
const STATE_TOPIC = topicOf(MACHINE_ID, CONNECTION_STATE)
const STARTED_AT = new Date().toISOString()
const JSON_TYPE = { contentType: "application/json" }

const now = (): string => new Date().toISOString()

const client = mqtt.connect(BROKER_URL, {
  clientId: CLIENT_ID,
  protocolVersion: 5,
  clean: true,
  reconnectPeriod: 5000,
  will: {
    topic: STATE_TOPIC,
    payload: JSON.stringify(envelope("CommunicationFault", now())),
    qos: 1,
    retain: true,
    properties: JSON_TYPE,
  },
})

// True from the end of the connect sequence of a connection until it closes: nothing else goes out before.
let ready = false
let saidInitializing = false
// What the adapter says the machine is: true reached, false not reached, null not asked yet.
let reachable: boolean | null = null
let heartbeats = 0
let manifest: Manifest | null = null
const current = new Map<string, Reading>([
  ["Identification.ManufacturerUri", { path: "Identification.ManufacturerUri", value: MANUFACTURER_URI }],
  ["Identification.Model", { path: "Identification.Model", value: MODEL }],
])
const sent = new Map<string, string>()
// The list of alerts as the backend said it last; null before it said one.
let alerts: Alert[] | null = null
let notifications = 0
const outbox: { topic: string; payload: string }[] = []
const EVENTS_TOPIC = `machines/${MACHINE_ID}/events/notifications`

function put(topic: string, payload: object): void {
  client.publish(topic, JSON.stringify(payload), { qos: 1, retain: true, properties: JSON_TYPE }, (error) => {
    if (error) console.error(`[MQTT] ${topic}: ${error.message}`)
  })
}

function putState(state: string): void {
  console.log(`[Adapter] ${MACHINE_ID} is ${state}`)
  put(STATE_TOPIC, envelope(state, now()))
}

function putReading(reading: Reading): void {
  put(topicOf(MACHINE_ID, reading.path), envelope(reading.value, reading.timestamp ?? STARTED_AT, reading.unit))
  sent.set(reading.path, JSON.stringify(reading.value))
}

function putIfChanged(reading: Reading): void {
  if (sent.get(reading.path) !== JSON.stringify(reading.value)) putReading(reading)
}

/** The manifest, what the machine lacks as null, and every value: what a consumer needs to know the machine whole. */
function putWhole(): void {
  if (manifest === null) return
  put(manifestTopic(MACHINE_ID), manifest)
  for (const path of unavailablePaths(manifest)) put(topicOf(MACHINE_ID, path), envelope(null, STARTED_AT))
  for (const reading of current.values()) putReading(reading)
}

function queueEvent(change: AlertChange): void {
  const since = typeof change.alert.Time === "string" && !Number.isNaN(Date.parse(change.alert.Time)) ? change.alert.Time : undefined
  const event = cloudEvent({
    id: randomUUID(),
    source: String(current.get("Identification.ProductInstanceUri")?.value ?? MACHINE_ID),
    type: change.type,
    // A raised alert has the time it came up; for an alert that changed or went, that is now.
    time: change.type === "Notification.AlertRaised" && since !== undefined ? since : now(),
    sequence: sequenceOf(new Date(STARTED_AT), ++notifications),
    data: change.alert,
  })
  outbox.push({ topic: EVENTS_TOPIC, payload: JSON.stringify(event) })
  if (outbox.length > OUTBOX_CAPACITY) {
    const dropped = outbox.shift()
    console.warn(`[Adapter] The outbox is full (${OUTBOX_CAPACITY}): dropped an event of ${dropped?.topic}`)
  }
}

// An event goes out after the connect sequence of a connection, in the order it came up, not retained.
function drain(): void {
  while (ready && outbox.length > 0) {
    const event = outbox.shift()
    if (event === undefined) return
    client.publish(event.topic, event.payload, { qos: 1, retain: false, properties: { contentType: EVENT_CONTENT_TYPE } }, (error) => {
      if (error) console.error(`[MQTT] ${event.topic}: ${error.message}`)
    })
  }
}

// A change of the list of alerts is an event for each entry that came, changed or went. The list itself goes out first.
function trackAlerts(value: unknown): void {
  if (!Array.isArray(value)) return
  const next = value.filter(isAlert)
  if (next.length !== value.length) console.warn("[Adapter] An alert without an Id is not reported")
  for (const change of alertChanges(alerts, next)) queueEvent(change)
  alerts = next
}

function refreshManifest(): boolean {
  const uri = current.get("Identification.ProductInstanceUri")?.value
  const next = buildManifest(
    MACHINE_ID,
    typeof uri === "string" ? uri : `${MANUFACTURER_URI.replace(/\/$/, "")}/${encodeURIComponent(MODEL)}/${encodeURIComponent(SERIAL_NUMBER)}`,
    [...current.values()],
    HEARTBEAT_SECONDS,
  )
  const changed = JSON.stringify(next) !== JSON.stringify(manifest)
  manifest = next
  return changed
}

// After every connect to the broker: Initializing the first time, then the manifest and every value known, then the
// state of the machine. A new connect says it all again; only the first says Initializing.
function connectSequence(): void {
  sent.clear()
  if (!saidInitializing) {
    putState("Initializing")
    saidInitializing = true
  }
  if (manifest !== null) {
    putWhole()
    putState(reachable === true ? "Running" : "CommunicationFault")
  } else if (reachable === false) {
    putState("CommunicationFault")
  }
  ready = true
  drain()
}

function reached(readings: Reading[]): void {
  const first = reachable !== true
  reachable = true
  for (const reading of readings) current.set(reading.path, reading)
  const changed = refreshManifest()
  const list = readings.find((reading) => reading.path === ACTIVE_ALERTS)
  if (!ready) {
    // The connect sequence says the values; the events wait for it.
    if (list) trackAlerts(list.value)
    return
  }
  if (first) {
    putWhole()
    putState("Running")
  } else {
    if (changed && manifest !== null) put(manifestTopic(MACHINE_ID), manifest)
    for (const reading of readings) putIfChanged(reading)
  }
  if (list) trackAlerts(list.value)
  drain()
}

function lost(): void {
  if (reachable === false) return
  reachable = false
  if (ready) putState("CommunicationFault")
}

function handle(event: string, text: string): void {
  // The backend's heartbeat is no heartbeat of this adapter: Connection/Heartbeat says that the adapter lives.
  if (event === "connection.heartbeat") return
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    console.warn(`[SSE] Not JSON in "${event}": ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const readings = readingsOf(data)
  const backend = readings.find((reading) => reading.path === CONNECTION_STATE)
  if (backend !== undefined && backend.value !== "Connected") {
    lost()
    return
  }
  // The job and its progress come beside State.Status and are no elements of the model: the job is the active work
  // master, the rest signals of the manufacturer.
  const own = readings
    .filter((reading) => !ADAPTER_OWNED.has(reading.path))
    .flatMap((reading) => (reading.path === "State.Status" ? [reading, ...activityReadings(reading, SIGNAL_PREFIX)] : [reading]))
  if (own.length > 0) reached(own)
}

async function readStream(): Promise<void> {
  const controller = new AbortController()
  let watchdog = setTimeout(() => controller.abort(), SILENCE_MS)
  try {
    const response = await fetch(SSE_URL, { headers: { accept: "text/event-stream" }, signal: controller.signal })
    if (!response.ok || response.body === null) throw new Error(`HTTP ${response.status}`)
    console.log(`[SSE] Connected to ${SSE_URL}`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    for (;;) {
      const { done, value } = await reader.read()
      if (done) throw new Error("the stream ended")
      clearTimeout(watchdog)
      watchdog = setTimeout(() => controller.abort(), SILENCE_MS)
      buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n")
      const blocks = buffer.split("\n\n")
      buffer = blocks.pop() ?? ""
      for (const block of blocks) {
        let event = "message"
        const data: string[] = []
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim()
          else if (line.startsWith("data:")) data.push(line.slice(5).trimStart())
        }
        if (data.length > 0) handle(event, data.join("\n"))
      }
    }
  } finally {
    clearTimeout(watchdog)
  }
}

async function followStream(): Promise<void> {
  for (;;) {
    try {
      await readStream()
    } catch (error) {
      console.error(`[SSE] ${error instanceof Error ? error.message : String(error)}`)
    }
    lost()
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
  }
}

client.on("connect", () => {
  console.log(`[MQTT] Connected to ${BROKER_URL}`)
  connectSequence()
})
client.on("close", () => {
  ready = false
})
client.on("error", (error) => console.error(`[MQTT] ${error.message}`))

const heartbeat = setInterval(() => {
  if (ready) put(topicOf(MACHINE_ID, HEARTBEAT), envelope(++heartbeats, now()))
}, HEARTBEAT_SECONDS * 1000)

const health = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(client.connected ? 200 : 503, { "Content-Type": "text/plain" })
    response.end(client.connected ? "OK" : "Not connected to the broker")
  } else {
    response.writeHead(404)
    response.end()
  }
})
health.listen(HEALTH_PORT, "0.0.0.0", () => console.log(`[Health] Listening on port ${HEALTH_PORT}`))

function shutdown(): void {
  clearInterval(heartbeat)
  if (ready) putState("Shutdown")
  client.end(false, {}, () => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

console.log(`SimpleCAM adapter: machine ${MACHINE_ID}, stream ${SSE_URL}, broker ${BROKER_URL}`)
void followStream()

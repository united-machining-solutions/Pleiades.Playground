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
  canonical,
  cloudEvent,
  defaultProductInstanceUri,
  deliveredElements,
  envelope,
  extensionPrefix,
  identityReadings,
  isAlert,
  machineId,
  manifestTopic,
  readingsOf,
  sequenceOf,
  topicOf,
  unavailablePaths,
  type Alert,
  type AlertChange,
  type DeliveredElement,
  type Manifest,
  type Reading,
} from "./binding.ts"
import { sseParser } from "./sse.ts"

const SSE_URL = process.env.SIMPLECAM_SSE_URL ?? "http://localhost:5450/stream/machine-9042/state"
const BROKER_URL = process.env.MQTT_BROKER_URL ?? "mqtt://broker:1883"
const CLIENT_ID = process.env.MQTT_CLIENT_ID ?? "simplecam-adapter-9042"
const HEALTH_PORT = Number(process.env.HEALTH_PORT ?? 3042)
// What the adapter knows of the machine at its start. The stream says the manufacturer, the serial number and the
// ProductInstanceUri again, and then it is the stream that says them; it says no model and no URI of the manufacturer.
const MANUFACTURER = process.env.SIMPLECAM_MANUFACTURER ?? "United Grinding"
const MANUFACTURER_URI = process.env.SIMPLECAM_MANUFACTURER_URI ?? "https://www.united-grinding.com"
const MODEL = process.env.SIMPLECAM_MODEL ?? "simplecam"
const SERIAL_NUMBER = process.env.SIMPLECAM_SERIAL_NUMBER ?? "9042"
const PRODUCT_INSTANCE_URI = process.env.SIMPLECAM_PRODUCT_INSTANCE_URI ?? defaultProductInstanceUri(MANUFACTURER_URI, MODEL, SERIAL_NUMBER)

const HEARTBEAT_SECONDS = 10
// How many events wait at most while they cannot go out; when it is full, the oldest is dropped and logged.
const OUTBOX_CAPACITY = 10_000
const RETRY_MS = 5000
// The backend sends something every ten seconds. A stream that is silent for longer is taken as lost.
const SILENCE_MS = 35_000

const MACHINE_ID = machineId(MANUFACTURER_URI, MODEL, SERIAL_NUMBER)
const SIGNAL_PREFIX = extensionPrefix(MANUFACTURER_URI)
const STATE_TOPIC = topicOf(MACHINE_ID, CONNECTION_STATE)
const EVENTS_TOPIC = `machines/${MACHINE_ID}/events/notifications`
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

// True from the end of the connect sequence of a connection until it closes or the adapter stops: nothing else goes
// out before it, and nothing after Shutdown.
let ready = false
let stopping = false
let saidInitializing = false
// What the adapter says the machine is: true reached, false not reached, null not asked yet.
let reachable: boolean | null = null
let heartbeats = 0

// The manifest is made at the start, from what the adapter delivers, and comes before the first value. An element
// the stream has not sent yet is not "not available": it only has no value yet.
const BASE_DELIVERED = deliveredElements(SIGNAL_PREFIX)
const extras = new Map<string, DeliveredElement>()
let manifest: Manifest = buildManifest(MACHINE_ID, PRODUCT_INSTANCE_URI, BASE_DELIVERED, HEARTBEAT_SECONDS)

const current = new Map<string, Reading>(
  identityReadings({
    manufacturer: MANUFACTURER,
    manufacturerUri: MANUFACTURER_URI,
    model: MODEL,
    serialNumber: SERIAL_NUMBER,
    productInstanceUri: PRODUCT_INSTANCE_URI,
  }).map((reading) => [reading.path, reading]),
)
const sent = new Map<string, string>()
// The time the adapter first read a value that has none of its own, kept while the value stays the same.
const seen = new Map<string, { signature: string; time: string }>()

// The list of alerts as the backend said it last; null before it said one.
let alerts: Alert[] | null = null
let notifications = 0
const outbox: { topic: string; payload: string }[] = []

function put(topic: string, payload: object): void {
  client.publish(topic, JSON.stringify(payload), { qos: 1, retain: true, properties: JSON_TYPE }, (error) => {
    if (error) console.error(`[MQTT] ${topic}: ${error.message}`)
  })
}

function putState(state: string): void {
  console.log(`[Adapter] ${MACHINE_ID} is ${state}`)
  put(STATE_TOPIC, envelope(state, now()))
}

function timeOf(reading: Reading): string {
  if (reading.timestamp !== undefined) return reading.timestamp
  const signature = canonical(reading.value)
  const known = seen.get(reading.path)
  if (known?.signature === signature) return known.time
  const time = now()
  seen.set(reading.path, { signature, time })
  return time
}

function putReading(reading: Reading): void {
  put(topicOf(MACHINE_ID, reading.path), envelope(reading.value, timeOf(reading), reading.unit))
  sent.set(reading.path, canonical(reading.value))
}

function putIfChanged(reading: Reading): void {
  if (sent.get(reading.path) !== canonical(reading.value)) putReading(reading)
}

/** The manifest, what the machine lacks as null, and every value known: what a consumer needs to know the machine whole. */
function putWhole(): void {
  put(manifestTopic(MACHINE_ID), manifest)
  for (const path of unavailablePaths(manifest)) put(topicOf(MACHINE_ID, path), envelope(null, STARTED_AT))
  for (const reading of current.values()) putReading(reading)
}

function queueEvent(change: AlertChange): void {
  const since = typeof change.alert.Time === "string" && !Number.isNaN(Date.parse(change.alert.Time)) ? change.alert.Time : undefined
  const event = cloudEvent({
    id: randomUUID(),
    source: String(current.get("Identification.ProductInstanceUri")?.value ?? PRODUCT_INSTANCE_URI),
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

// An element the stream sends and the manifest does not deliver yet (one the stream adds, or a Core element the
// machine was thought to lack) is declared, so that the manifest names what goes out.
function declare(reading: Reading): void {
  const delivered = manifest.elements.some((element) => element.path === reading.path && element.available !== false)
  if (!delivered) extras.set(reading.path, { path: reading.path, timestampSource: reading.timestamp === undefined ? "adapter" : "source" })
}

function refreshManifest(): boolean {
  const uri = current.get("Identification.ProductInstanceUri")?.value
  const next = buildManifest(
    MACHINE_ID,
    typeof uri === "string" ? uri : PRODUCT_INSTANCE_URI,
    [...BASE_DELIVERED, ...extras.values()],
    HEARTBEAT_SECONDS,
  )
  const changed = canonical(next) !== canonical(manifest)
  manifest = next
  return changed
}

// After every connect to the broker: Initializing the first time, then the manifest and every value known, then the
// state of the machine once it is known. A new connect says it all again; only the first says Initializing.
function connectSequence(): void {
  if (stopping) return
  sent.clear()
  if (!saidInitializing) {
    putState("Initializing")
    saidInitializing = true
  }
  putWhole()
  if (reachable !== null) putState(reachable ? "Running" : "CommunicationFault")
  ready = true
  drain()
}

function reached(readings: Reading[]): void {
  const first = reachable !== true
  reachable = true
  for (const reading of readings) {
    declare(reading)
    current.set(reading.path, reading)
  }
  const changed = refreshManifest()
  const list = readings.find((reading) => reading.path === ACTIVE_ALERTS)
  if (ready) {
    if (first) {
      putWhole()
      putState("Running")
    } else {
      if (changed) put(manifestTopic(MACHINE_ID), manifest)
      for (const reading of readings) putIfChanged(reading)
    }
  }
  // Before the connect sequence the values are not said yet; the events wait for it.
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
  const read = now()
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
    .flatMap((reading) => (reading.path === "State.Status" ? [reading, ...activityReadings(reading, SIGNAL_PREFIX, read)] : [reading]))
  // A message that says only "Connected" says as well that the machine is there again.
  if (own.length > 0 || (backend !== undefined && reachable !== true)) reached(own)
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
    const parse = sseParser()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) throw new Error("the stream ended")
      clearTimeout(watchdog)
      watchdog = setTimeout(() => controller.abort(), SILENCE_MS)
      for (const message of parse(decoder.decode(value, { stream: true }))) handle(message.event, message.data)
    }
  } finally {
    clearTimeout(watchdog)
    // Lets go of the connection also when the status was not OK or a message could not be handled.
    controller.abort()
  }
}

async function followStream(): Promise<void> {
  while (!stopping) {
    try {
      await readStream()
    } catch (error) {
      if (!stopping) console.error(`[SSE] ${error instanceof Error ? error.message : String(error)}`)
    }
    lost()
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
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
  if (stopping) return
  stopping = true
  clearInterval(heartbeat)
  if (ready) putState("Shutdown")
  // Shutdown is the last message: while the client waits for the acknowledgements, nothing else goes out.
  ready = false
  client.end(false, {}, () => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

console.log(`SimpleCAM adapter: machine ${MACHINE_ID}, stream ${SSE_URL}, broker ${BROKER_URL}`)
void followStream()

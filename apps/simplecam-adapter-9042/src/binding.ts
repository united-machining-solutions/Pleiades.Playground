// The MQTT binding of the data model for machines (contracts/mqtt/README.md, "Machines: the binding of the
// data model"). Pure functions: no broker, no clock. The .NET side is Pleiades.Playground.Mqtt.Extensions.Machines.
import { domainToUnicode } from "node:url"

export const MODEL_VERSION = "0.17.1"
export const BINDING_VERSION = "0.1.0-draft"
export const HEARTBEAT = "Connection.Heartbeat"
export const CONNECTION_STATE = "Connection.State"

/** What the adapter says about itself. The backend's own heartbeat and state are not these. */
export const ADAPTER_OWNED: ReadonlySet<string> = new Set([HEARTBEAT, CONNECTION_STATE])

/** The elements of the profile Core, in the order of the manifest. */
export const CORE: readonly string[] = [
  "Identification.Manufacturer",
  "Identification.SerialNumber",
  "Identification.ProductInstanceUri",
  "Identification.ManufacturerUri",
  "Identification.Model",
  "Identification.ProductCode",
  "Identification.YearOfConstruction",
  HEARTBEAT,
  CONNECTION_STATE,
  "State.Status",
  "State.FeedOverride",
  "Notification.ActiveAlerts",
  "OperationCounters.PowerOnDuration",
]

// The adapter delivers these whatever the machine says; the rest of Core is "available": false when it lacks.
const ALWAYS: ReadonlySet<string> = new Set([
  "Identification.Manufacturer",
  "Identification.SerialNumber",
  "Identification.ProductInstanceUri",
  "Identification.ManufacturerUri",
  "Identification.Model",
  HEARTBEAT,
  CONNECTION_STATE,
])

/** One element of the model with its value, as the backend says it. `timestamp` is absent where it says none. */
export interface Reading {
  path: string
  value: unknown
  timestamp?: string
  /** The catalogue unit of a number (`one`, `watt` ...), where the element has one. */
  unit?: string
  /** What the backend says beside `State.Status`: the job and its progress. It is no element of the model. */
  activity?: Record<string, unknown>
}

export interface ManifestElement {
  path: string
  timestampSource?: "adapter" | "source"
  available?: false
  /** A signal of the manufacturer says what it is: its type, its unit and a description. */
  type?: string
  unit?: { code: string; name: string }
  description?: string
}

export interface Manifest {
  modelVersion: string
  bindingVersion: string
  machineId: string
  machine: { ProductInstanceUri: string }
  profiles: string[]
  heartbeatInterval: number
  elements: ManifestElement[]
  events: { path: string }[]
}

/** An entry of `Notification.ActiveAlerts`, as the backend says it: the model's fields (Id, ErrorCode, Message, Severity, ...). */
export type Alert = Record<string, unknown> & { Id: string | number }

export const ACTIVE_ALERTS = "Notification.ActiveAlerts"
export const ALERT_EVENTS = ["Notification.AlertRaised", "Notification.AlertChanged", "Notification.AlertCleared"] as const
export type AlertEventType = (typeof ALERT_EVENTS)[number]

/** The MQTT 5 content type of an event. */
export const EVENT_CONTENT_TYPE = "application/cloudevents+json; charset=utf-8"
export const EVENT_DATA_SCHEMA = `urn:umati2:datamodel:${MODEL_VERSION}:event.schema.json`

/** One part of the machine id: ASCII letters, digits and `-`, at most 64 characters, `unknown` if nothing is left. */
export function machineIdPart(text: string | undefined): string {
  const written = (text ?? "")
    .replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue")
    .replaceAll("Ä", "Ae").replaceAll("Ö", "Oe").replaceAll("Ü", "Ue")
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
  const part = written.replace(/[^A-Za-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/, "")
  return part.length === 0 ? "unknown" : part
}

/** The domain of a URI in lower case, without a leading `www.`. */
export function domainOf(uri: string): string {
  let host: string
  try {
    host = domainToUnicode(new URL(uri).hostname)
  } catch {
    host = uri.trim()
  }
  host = host.toLowerCase()
  return host.startsWith("www.") ? host.slice(4) : host
}

/** `<manufacturer>_<model>_<serial number>`, the manufacturer from the domain of its URI without its top-level domain. */
export function machineId(manufacturerUri: string, model: string | undefined, serialNumber: string | undefined): string {
  let manufacturer = domainOf(manufacturerUri)
  const lastDot = manufacturer.lastIndexOf(".")
  if (lastDot > 0) manufacturer = manufacturer.slice(0, lastDot)
  return [machineIdPart(manufacturer), machineIdPart(model), machineIdPart(serialNumber)].join("_")
}

/** The topic of an element: every `.` of the path a level; `x-<domain>.<path>` lies in `oem`, all else in `umati`. */
export function topicOf(id: string, path: string): string {
  const prefix = /^x-[a-z0-9-]+\./.exec(path)
  if (prefix) return `machines/${id}/oem/${path.slice(prefix[0].length).replaceAll(".", "/")}`
  return `machines/${id}/umati/${path.replaceAll(".", "/")}`
}

export function manifestTopic(id: string): string {
  return `machines/${id}/umati/Manifest`
}

/** The envelope of one value: the time of its source, UTC. */
export function envelope(value: unknown, timestamp: string, unit?: string): { timestamp: string; value: unknown; unit?: string } {
  return unit === undefined ? { timestamp, value } : { timestamp, value, unit }
}

function isRecord(node: unknown): node is Record<string, unknown> {
  return typeof node === "object" && node !== null && !Array.isArray(node)
}

function leaf(node: Record<string, unknown>): Reading | undefined {
  if (typeof node.path !== "string" || !("value" in node)) return undefined
  const reading: Reading = { path: node.path, value: node.value, timestamp: typeof node.timestamp === "string" ? node.timestamp : undefined }
  if (isRecord(node.activity)) reading.activity = node.activity
  return reading
}

/** The prefix of a signal of the manufacturer: `x-` and its domain, every dot a `-` (`united-grinding.com` gives `x-united-grinding-com`). */
export function extensionPrefix(manufacturerUri: string): string {
  return `x-${domainOf(manufacturerUri).trim().replaceAll(".", "-")}`
}

type Signal = Pick<ManifestElement, "type" | "unit" | "description">

// The signals of the manufacturer this adapter delivers, by their path without the prefix.
const SIGNALS: Readonly<Record<string, Signal>> = {
  "Activity.Context": {
    type: "string",
    description: "What the machine does now, as the backend says it, for example printing; null when it says none",
  },
  "Activity.Progress": {
    type: "number",
    unit: { code: "C62", name: "one" },
    description: "Progress of the current job as a fraction, 1.0 = done; null when no job runs",
  },
}

function signalOf(path: string): Signal | undefined {
  const match = /^x-[a-z0-9-]+\.(.+)$/.exec(path)
  return match ? SIGNALS[match[1]] : undefined
}

/**
 * What the backend says about the job beside `State.Status`, as elements. The job is the active work master, the
 * model's name for what the machine works on; what it does and how far it is are signals of the manufacturer. Where
 * the backend says no job, all three are `null`: not available right now. `timestamp` is the time the adapter read
 * them: the time of `State.Status` is that of its last change, and says nothing about the progress made since.
 */
export function activityReadings(status: Reading, prefix: string, timestamp: string): Reading[] {
  const activity = status.activity
  const text = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null)
  const percent = typeof activity?.progressPercent === "number" && Number.isFinite(activity.progressPercent) ? activity.progressPercent : null
  return [
    { path: "WorkMasterMonitoring.ActiveWorkMaster", value: text(activity?.jobName), timestamp },
    { path: `${prefix}.Activity.Context`, value: text(activity?.context), timestamp },
    {
      path: `${prefix}.Activity.Progress`,
      value: percent === null ? null : Math.min(1, Math.max(0, percent / 100)),
      timestamp,
      unit: "one",
    },
  ]
}

/**
 * The elements in a message of the backend's stream: a whole state (groups of `{path, timestamp, value}`, and the
 * identification as plain values) or one element. What lies beside `value`, `path` and `timestamp` is not read.
 */
export function readingsOf(data: unknown): Reading[] {
  const found: Reading[] = []
  const walk = (node: unknown): void => {
    if (!isRecord(node)) return
    const one = leaf(node)
    if (one) {
      found.push(one)
      return
    }
    for (const child of Object.values(node)) walk(child)
  }
  if (!isRecord(data)) return found
  const single = leaf(data)
  if (single) return [single]
  for (const [group, node] of Object.entries(data)) {
    if (group === "identification" && isRecord(node)) {
      for (const [key, value] of Object.entries(node)) found.push({ path: `Identification.${key}`, value })
    } else {
      walk(node)
    }
  }
  return found
}

/** What the adapter knows about the machine at its start, from its settings: the stream may say it again, and then it says it. */
export interface Identity {
  manufacturer: string
  manufacturerUri: string
  model: string
  serialNumber: string
  productInstanceUri: string
}

/** `<manufacturer URI>/<model>/<serial number>`, as the .NET adapters form it when no other is set. */
export function defaultProductInstanceUri(manufacturerUri: string, model: string, serialNumber: string): string {
  return `${manufacturerUri.replace(/\/+$/, "")}/${encodeURIComponent(model)}/${encodeURIComponent(serialNumber)}`
}

/** The five elements of the identification that every adapter delivers. */
export function identityReadings(identity: Identity): Reading[] {
  return [
    { path: "Identification.Manufacturer", value: identity.manufacturer },
    { path: "Identification.SerialNumber", value: identity.serialNumber },
    { path: "Identification.ProductInstanceUri", value: identity.productInstanceUri },
    { path: "Identification.ManufacturerUri", value: identity.manufacturerUri },
    { path: "Identification.Model", value: identity.model },
  ]
}

/** An element the adapter delivers, and whose time it says: that of the machine (`source`) or the time it was read (`adapter`). */
export interface DeliveredElement {
  path: string
  timestampSource: "adapter" | "source"
}

/**
 * What this adapter delivers beside the identification and the connection. It is fixed: the manifest does not
 * wait for the stream, and an element that has not come yet is not "not available".
 */
export function deliveredElements(prefix: string): DeliveredElement[] {
  return [
    { path: "State.Status", timestampSource: "source" },
    { path: ACTIVE_ALERTS, timestampSource: "source" },
    { path: "WorkMasterMonitoring.ActiveWorkMaster", timestampSource: "adapter" },
    { path: `${prefix}.Activity.Context`, timestampSource: "adapter" },
    { path: `${prefix}.Activity.Progress`, timestampSource: "adapter" },
  ]
}

/** The manifest of an adapter that delivers `delivered` and the profile Core. What Core has and the machine lacks is "available": false. */
export function buildManifest(id: string, productInstanceUri: string, delivered: readonly DeliveredElement[], heartbeatSeconds: number): Manifest {
  const byPath = new Map(delivered.map((element) => [element.path, element]))
  const elements: ManifestElement[] = []
  const element = (path: string): ManifestElement => ({
    path,
    timestampSource: byPath.get(path)?.timestampSource ?? "adapter",
    ...signalOf(path),
  })
  for (const path of CORE) {
    if (byPath.has(path) || ALWAYS.has(path)) elements.push(element(path))
    else elements.push({ path, available: false })
  }
  for (const { path } of delivered) {
    if (!CORE.includes(path)) elements.push(element(path))
  }
  return {
    modelVersion: MODEL_VERSION,
    bindingVersion: BINDING_VERSION,
    machineId: id,
    machine: { ProductInstanceUri: productInstanceUri },
    profiles: ["Core"],
    heartbeatInterval: heartbeatSeconds,
    elements,
    events: ALERT_EVENTS.map((path) => ({ path })),
  }
}

/** An entry of a list of alerts that can be told from the others: an object with an `Id`. */
export function isAlert(node: unknown): node is Alert {
  return isRecord(node) && (typeof node.Id === "string" || typeof node.Id === "number")
}

export interface AlertChange {
  type: AlertEventType
  alert: Alert
}

// The number 2 and the text "2" are two alerts.
const alertKey = (alert: Alert): string => `${typeof alert.Id}:${String(alert.Id)}`

/** A text of a value that does not depend on the order of the fields: the same alert in another order is the same alert. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

/**
 * The events a change of `Notification.ActiveAlerts` makes: an entry that is new is raised, one that is gone is
 * cleared, one whose fields changed is changed. `previous` is `null` before the list is known: every entry of the
 * first list is raised, as the binding asks ("the first entries included").
 */
export function alertChanges(previous: readonly Alert[] | null, next: readonly Alert[]): AlertChange[] {
  const before = new Map((previous ?? []).map((alert) => [alertKey(alert), alert]))
  const after = new Map(next.map((alert) => [alertKey(alert), alert]))
  const changes: AlertChange[] = []
  for (const [id, alert] of after) {
    const old = before.get(id)
    if (old === undefined) changes.push({ type: "Notification.AlertRaised", alert })
    else if (canonical(old) !== canonical(alert)) changes.push({ type: "Notification.AlertChanged", alert })
  }
  for (const [id, alert] of before) {
    if (!after.has(id)) changes.push({ type: "Notification.AlertCleared", alert })
  }
  return changes
}

/** `<start of the adapter as yyyyMMddTHHmmssZ>.<count of twelve digits>`: the count of the events of a group, from 1. */
export function sequenceOf(start: Date, count: number): string {
  const prefix = start.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
  return `${prefix}.${String(count).padStart(12, "0")}`
}

/** A CloudEvent 1.0 in structured JSON mode, as the binding asks. */
export function cloudEvent(event: { id: string; source: string; type: string; time: string; sequence: string; data: unknown }): object {
  return {
    specversion: "1.0",
    id: event.id,
    source: event.source,
    type: event.type,
    time: event.time,
    sequence: event.sequence,
    dataschema: EVENT_DATA_SCHEMA,
    data: event.data,
  }
}

/** The elements the manifest names as not available: they go out once as `null`. */
export function unavailablePaths(manifest: Manifest): string[] {
  return manifest.elements.filter((element) => element.available === false).map((element) => element.path)
}

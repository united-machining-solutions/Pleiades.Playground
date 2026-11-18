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
}

export interface ManifestElement {
  path: string
  timestampSource?: "adapter" | "source"
  available?: false
}

export interface Manifest {
  modelVersion: string
  bindingVersion: string
  machineId: string
  machine: { ProductInstanceUri: string }
  profiles: string[]
  heartbeatInterval: number
  elements: ManifestElement[]
}

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
  return { path: node.path, value: node.value, timestamp: typeof node.timestamp === "string" ? node.timestamp : undefined }
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

/** The manifest of an adapter that delivers `readings` and the profile Core. What Core has and the machine lacks is "available": false. */
export function buildManifest(id: string, productInstanceUri: string, readings: readonly Reading[], heartbeatSeconds: number): Manifest {
  const delivered = new Map(readings.map((reading) => [reading.path, reading]))
  const elements: ManifestElement[] = []
  const element = (path: string): ManifestElement => ({
    path,
    timestampSource: delivered.get(path)?.timestamp === undefined ? "adapter" : "source",
  })
  for (const path of CORE) {
    if (delivered.has(path) || ALWAYS.has(path)) elements.push(element(path))
    else elements.push({ path, available: false })
  }
  for (const path of delivered.keys()) {
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
  }
}

/** The elements the manifest names as not available: they go out once as `null`. */
export function unavailablePaths(manifest: Manifest): string[] {
  return manifest.elements.filter((element) => element.available === false).map((element) => element.path)
}

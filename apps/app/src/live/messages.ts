import { SNAPSHOT_PATHS, machineId, severity } from "@pleiades/cards/machine/contract.ts"
import type { Severity } from "@pleiades/cards/machine/contract.ts"

// What arrives from the broker, as the MQTT binding (contracts/mqtt) writes it: the tree of the umati
// data model below `machines/{machineId}/`. A message that is not what the binding says is left out:
// consumers ignore what they do not know.

/** A value of a topic: one value per message, measured at `at`. */
export type Value = {
  at: string
  value: string | number | boolean
  /** The unit of a number, as the data model names it. Null for text and for a yes or no. */
  unit: string | null
}

/** An instant as the backend writes it, to the millisecond in UTC, so two instants compare as text. */
function instantOf(written: unknown): string | null {
  if (typeof written !== "string") return null
  const time = Date.parse(written)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

function objectOf(parsed: unknown): Record<string, unknown> | null {
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
}

function jsonOf(payload: string): Record<string, unknown> | null {
  try {
    return objectOf(JSON.parse(payload))
  } catch {
    return null
  }
}

/**
 * How far ahead of the clock a value may be stamped. One stamped further ahead comes from a wrong
 * clock: the backend reads stored values only up to now, so it would not show it yet either.
 */
export const AHEAD_MS = 30_000

/** Whether an instant lies further ahead of `now`, in milliseconds since 1970, than a clock may be wrong. */
function ahead(at: string, now: number): boolean {
  return Date.parse(at) > now + AHEAD_MS
}

/** The envelope of a message whose instant is one the page takes: its instant and whatever its value is. */
function envelopeOf(payload: string, now: number): { at: string; value: unknown; unit: string | null } | null {
  const json = jsonOf(payload)
  const at = instantOf(json?.timestamp)
  if (at === null || ahead(at, now)) return null
  return { at, value: json?.value, unit: typeof json?.unit === "string" ? json.unit : null }
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}

/** The value envelope of the binding: `{ "timestamp": …, "value": …, "unit": … }`, with one value. */
export function valueOf(payload: string, now = Date.now()): Value | null {
  const envelope = envelopeOf(payload, now)
  return envelope && isScalar(envelope.value) ? { at: envelope.at, value: envelope.value, unit: envelope.unit } : null
}

/**
 * The values of a message, each on the topic the Timeseries store keeps it on, so that a page reads
 * the broker as the backend reads the store. A value is one, on its topic. A snapshot, whose value is
 * an object such as `State/Status`, is one for each field that is text or a yes or no, on the topic
 * of the snapshot and the name of the field, at the instant of the snapshot; a number inside a
 * snapshot carries no unit and is not kept. A list and `null`, "not available right now", are none.
 */
export function valuesOf(topic: string, payload: string, now = Date.now()): Array<{ topic: string; value: Value }> {
  const envelope = envelopeOf(payload, now)
  if (envelope === null) return []
  if (isScalar(envelope.value)) return [{ topic, value: { at: envelope.at, value: envelope.value, unit: envelope.unit } }]
  const snapshot = objectOf(envelope.value)
  if (snapshot === null) return []
  return Object.entries(snapshot).flatMap(([field, value]) =>
    typeof value === "string" || typeof value === "boolean"
      ? [{ topic: `${topic}/${field}`, value: { at: envelope.at, value, unit: null } }]
      : [],
  )
}

/** The entries of a list of the data model, such as `JobMonitoring/JobOrders`: always the whole list. */
export function listOf(payload: string, now = Date.now()): { at: string; entries: Array<Record<string, unknown>> } | null {
  const envelope = envelopeOf(payload, now)
  if (envelope === null || !Array.isArray(envelope.value)) return null
  const entries = (envelope.value as Array<unknown>).flatMap((entry) => {
    const object = objectOf(entry)
    return object ? [object] : []
  })
  return { at: envelope.at, entries }
}

/**
 * An alert event of the data model, a CloudEvent on `events/notifications`: an alert is raised, changes
 * or is cleared. A `Notification.NotificationEvent`, a message that does not stay, is none.
 */
export type AlertEvent = {
  /** When the event came up. */
  at: string
  action: "Raised" | "Changed" | "Cleared"
  /** The id of the alert, the same in its raise, its changes and its clear. */
  alertId: string
  /** The error code of the manufacturer. */
  errorCode: string
  message: string
  /** The category after NAMUR NE 107. */
  severity: Severity | null
  /** Since when the alert stands, as the machine says it, or null where the event does not say. */
  since: string | null
}

const alertActions: Record<string, AlertEvent["action"]> = {
  "Notification.AlertRaised": "Raised",
  "Notification.AlertChanged": "Changed",
  "Notification.AlertCleared": "Cleared",
}

export function alertOf(payload: string, now = Date.now()): AlertEvent | null {
  const json = jsonOf(payload)
  const at = instantOf(json?.time)
  const action = typeof json?.type === "string" ? alertActions[json.type] : undefined
  const data = objectOf(json?.data)
  if (at === null || ahead(at, now) || action === undefined || data === null) return null
  if (typeof data.Id !== "string" || data.Id === "") return null
  const category = severity.safeParse(data.Severity)
  return {
    at,
    action,
    alertId: data.Id,
    errorCode: typeof data.ErrorCode === "string" ? data.ErrorCode : "",
    message: typeof data.Message === "string" ? data.Message : "",
    severity: category.success ? category.data : null,
    since: instantOf(data.Time),
  }
}

/**
 * `machines/alcyone-machines_AX-400_P-04/umati/Connection/State` belongs to the machine
 * `alcyone-machines_AX-400_P-04`. A level that is no machine id by the rule of the contract names no
 * machine.
 */
export function machineOf(topic: string): string | undefined {
  const level = /^machines\/([^/]+)\//.exec(topic)?.[1]
  return machineId.safeParse(level).success ? level : undefined
}

/** The topic filter for a path below `machines/{machineId}/`: of one machine, or of every one. */
export function filterOf(path: string, machine = "+"): string {
  return `machines/${machine}/${path}`
}

/**
 * Where the broker carries a path the store keeps: the path itself, or, for a field of a snapshot,
 * the topic of the snapshot, which arrives as one message.
 */
export function brokerPathOf(path: string): string {
  return SNAPSHOT_PATHS.find((snapshot) => path.startsWith(`${snapshot}/`)) ?? path
}

/**
 * The topics to hear for a path the store keeps. A field of a snapshot is heard on the topic of the
 * snapshot, as the data model sends it, and on its own topic as well: an adapter that does not send
 * snapshots yet, such as the Ultimaker telemetry, publishes the field as a value of its own, and the
 * store keeps both on the same topic.
 */
export function brokerPathsOf(path: string): Array<string> {
  return [...new Set([brokerPathOf(path), path])]
}

/** Whether a topic matches a filter, with the wildcards of MQTT: `+` for one level, `#` for the rest. */
export function matches(filter: string, topic: string): boolean {
  const wanted = filter.split("/")
  const levels = topic.split("/")
  for (let index = 0; index < wanted.length; index++) {
    if (wanted[index] === "#") return true
    if (index >= levels.length) return false
    if (wanted[index] !== "+" && wanted[index] !== levels[index]) return false
  }
  return wanted.length === levels.length
}

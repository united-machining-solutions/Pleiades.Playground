import { serialNumber } from "@pleiades/cards/machine/contract.ts"

// What arrives from the broker, as the MQTT binding (contracts/mqtt) writes it. A message that is
// not what the binding says is left out: consumers ignore what they do not know.

/** A value of a topic: one value per message, measured at `at`. */
export type Value = {
  at: string
  value: string | number | boolean
  /** The SI unit of a number, as the binding names it. Null for text and for a yes or no. */
  unit: string | null
}

/** An instant as the backend writes it, to the millisecond in UTC, so two instants compare as text. */
function instantOf(written: unknown): string | null {
  if (typeof written !== "string") return null
  const time = Date.parse(written)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

function jsonOf(payload: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(payload)
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
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

/** The value envelope of the binding: `{ "timestamp": …, "value": …, "unit": … }`. */
export function valueOf(payload: string, now = Date.now()): Value | null {
  const json = jsonOf(payload)
  const at = instantOf(json?.timestamp)
  const value = json?.value
  if (at === null || ahead(at, now)) return null
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return null
  return { at, value, unit: typeof json?.unit === "string" ? json.unit : null }
}

/** A notification event of the Events API: an alarm or a message that is raised, and later reset. */
export type NotificationEvent = {
  at: string
  action: "Raised" | "Reset"
  level: string
  title: string
  notificationId: string
  /** The same for the event that raises a notification and the one that resets it. */
  correlationId: string
}

export function notificationOf(payload: string, now = Date.now()): NotificationEvent | null {
  const json = jsonOf(payload)
  const at = instantOf(json?.timestamp)
  const { action, level, title, notificationId, correlationId } = json ?? {}
  if (at === null || ahead(at, now) || (action !== "Raised" && action !== "Reset")) return null
  if (typeof correlationId !== "string" || correlationId === "") return null
  return {
    at,
    action,
    level: typeof level === "string" ? level : "",
    title: typeof title === "string" ? title : "",
    notificationId: typeof notificationId === "string" ? notificationId : "",
    correlationId,
  }
}

/**
 * `machines/P-04/umati/State/MachineryItemState` belongs to the machine `P-04`. A level that is
 * no serial number by the rule of the contract names no machine.
 */
export function machineOf(topic: string): string | undefined {
  const level = /^machines\/([^/]+)\//.exec(topic)?.[1]
  return serialNumber.safeParse(level).success ? level : undefined
}

/** The topic filter for a path below `machines/{SerialNumber}/`: of one machine, or of every one. */
export function filterOf(path: string, machine = "+"): string {
  return `machines/${machine}/${path}`
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

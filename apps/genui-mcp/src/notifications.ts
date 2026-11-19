import { HORIZON_SECONDS, NOTIFICATIONS_PATH } from "@pleiades/cards/machine/contract.ts"
import { NOTIFICATION_ROWS } from "@pleiades/cards/notification/contract.ts"
import type { LevelTotal, NotificationEntry, NotificationList } from "@pleiades/cards/notification/contract.ts"

import { listTopics, readAlertsOf } from "./apis.ts"
import type { AlertStanding, Apis } from "./apis.ts"
import { machineNamed, machineOf } from "./machines.ts"
import { secondsBefore } from "./time.ts"

// The warnings and errors of one machine, each with when it came, when it went and how long it
// stood. The Events API answers with the alerts that stood at some time in the range, each with the
// time it really came, so one that came up before the range and still stands is among them. As the
// list of machines names no alert that is older than 24 hours and has not been cleared, neither does
// this. The list of machines reads the alerts of all machines in one page of 1000 and so may miss
// open ones where more stood in 24 hours; this reads one machine and lists them (see the guide).

/** How many hours back the list goes, if nobody asks for more or less. */
export const NOTIFICATION_HOURS = 8
/** How many hours the list covers at most: as far back as the list of machines looks. */
export const MOST_NOTIFICATION_HOURS = HORIZON_SECONDS / 3600

/** What the card shows of an alert: with a duration only where it has been cleared. */
export function entryOf(alert: AlertStanding, from: string, topic: string): NotificationEntry {
  return {
    correlationId: alert.correlationId,
    notificationId: alert.notificationId,
    severity: alert.severity,
    level: alert.level,
    title: alert.title,
    raisedAt: alert.raisedAt,
    goneAt: alert.goneAt,
    durationSeconds: alert.goneAt === null ? null : (Date.parse(alert.goneAt) - Date.parse(alert.raisedAt)) / 1000,
    open: alert.goneAt === null,
    beforeRange: alert.raisedAt < from,
    topic,
  }
}

/** The ones that have not gone first, then the others, each group with the newest first. */
function inOrder(entries: Array<NotificationEntry>): Array<NotificationEntry> {
  return [...entries].sort(
    (a, b) =>
      Number(b.open) - Number(a.open) || b.raisedAt.localeCompare(a.raisedAt) || a.correlationId.localeCompare(b.correlationId),
  )
}

/**
 * What the notifications of one level add up to: how many, and how long they stood in the range,
 * each from its raise or the start of the range, whichever is later, to its clear or now. The whole
 * duration of an alert is the one of its row; a total of a range holds only the range.
 */
function totalOf(entries: ReadonlyArray<NotificationEntry>, from: string, asOf: string): LevelTotal {
  const seconds = entries.reduce((sum, entry) => {
    const [start, end] = [Math.max(Date.parse(entry.raisedAt), Date.parse(from)), Math.min(Date.parse(entry.goneAt ?? asOf), Date.parse(asOf))]
    return sum + Math.max(0, end - start) / 1000
  }, 0)
  return { count: entries.length, seconds }
}

export async function listNotifications(
  apis: Apis,
  name: string,
  hours = NOTIFICATION_HOURS,
  now = new Date(),
): Promise<NotificationList> {
  if (!(hours > 0 && hours <= MOST_NOTIFICATION_HOURS)) {
    throw new Error(`The list reaches back between 0 and ${MOST_NOTIFICATION_HOURS} hours, as far back as the list of machines looks.`)
  }
  const asOf = now.toISOString()
  const from = secondsBefore(now, hours * 3600).toISOString()
  const horizon = secondsBefore(now, HORIZON_SECONDS).toISOString()
  // The machine is named by its id or as people call it, so the alerts are read once it is known.
  const topics = await listTopics(apis, new Date(horizon), now)
  const known = [...new Set(topics.flatMap((one) => machineOf(one) ?? []))].sort()
  const machine = machineNamed(known, name)
  // An id that no machine published a value under is no machine: an empty list would read as an all-clear.
  if (!known.includes(machine)) {
    throw new Error(`No machine "${machine}" published a value in the last 24 hours. Machines that did: ${known.join(", ") || "none"}.`)
  }
  const topic = `machines/${machine}/${NOTIFICATIONS_PATH}`
  const { alerts, hasMore } = await readAlertsOf(apis, machine, new Date(from), now)

  const found = alerts
    // An alert that stands and came up before the horizon is none the list of machines names.
    .filter((alert) => alert.goneAt !== null || alert.raisedAt >= horizon)
    .map((alert) => entryOf(alert, from, topic))
  const listed = inOrder(found).slice(0, NOTIFICATION_ROWS)
  const open = found.filter((entry) => entry.open).length
  return {
    asOf,
    machine,
    from,
    topic,
    notifications: listed,
    total: found.length,
    open,
    gone: found.length - open,
    levels: {
      error: totalOf(found.filter((entry) => entry.level === "Error"), from, asOf),
      warning: totalOf(found.filter((entry) => entry.level === "Warning"), from, asOf),
    },
    omitted: found.length - listed.length,
    hasMore,
  }
}

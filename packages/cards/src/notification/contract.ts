import { z } from "zod"

import { instant, machineId, severity } from "../machine/contract.ts"

// The contract of the notification card: the alerts of one machine as warnings and errors, each
// with when it came, when it went and how long it stood. The backend takes these shapes as the
// output of its tool, and the properties of the component are inferred from them. Every value names
// the topic it comes from.

/** How many notifications the card lists at most. The counts say how many there were. */
export const NOTIFICATION_ROWS = 50

export const notificationEntry = z.object({
  correlationId: z.string().describe("The id of the alert, the same in its raise and its clear."),
  notificationId: z.string().describe("The error code of the manufacturer."),
  severity: severity.nullable().describe("The category after NAMUR NE 107."),
  level: z.enum(["Warning", "Error"]).describe("A `Failure` is an error, every other category a warning."),
  title: z.string().describe("The message of the alert."),
  raisedAt: instant.describe("When the alert was raised."),
  goneAt: instant.nullable().describe("When the alert was cleared. Null as long as it stands."),
  durationSeconds: z
    .number()
    .nullable()
    .describe("How long the alert stood, from `raisedAt` to `goneAt`, in seconds. Null while it stands."),
  open: z.boolean().describe("True if the alert has not been cleared: `goneAt` is null."),
  beforeRange: z.boolean().describe("True if the alert was raised before `from` and stood into the range."),
  topic: z.string().describe("The MQTT topic the alert comes from."),
})
export type NotificationEntry = z.infer<typeof notificationEntry>

/** What the notifications of one level add up to. */
export const levelTotal = z.object({
  count: z.number().int().describe("How many notifications of this level stood in the range, among those the Events API returned."),
  seconds: z
    .number()
    .describe(
      "How long they stood in the range, added up, in seconds: each from `raisedAt` or `from`, whichever is later, to `goneAt`, or to `asOf` where it has not been cleared. The part before `from` is not in it.",
    ),
})
export type LevelTotal = z.infer<typeof levelTotal>

/**
 * The notification card: the alerts that stood on one machine at any time between `from` and
 * `asOf`. An alert that was raised before `from` and has not been cleared, or was cleared after
 * `from`, stands in the range, and says so (`beforeRange`). A row is not cut at `from`: its duration is
 * its whole one. The totals of the levels are cut: they hold the time in the range only. An alert that has not been cleared and was raised more than 24 hours before `asOf`
 * is not listed, as the list of machines names none that old.
 */
export const notificationList = z.object({
  asOf: instant,
  machine: machineId.describe("The machine id."),
  from: instant.describe("The beginning of the range. It ends at `asOf`."),
  topic: z.string().describe("The MQTT topic the alerts of the machine come from."),
  notifications: z
    .array(notificationEntry)
    .describe("At most 50: the ones that stand first, then the others, each group with the newest first."),
  total: z.number().int().describe("How many notifications stood in the range, among those the Events API returned."),
  open: z.number().int().describe("How many of them have not been cleared."),
  gone: z.number().int().describe("How many of them have been cleared."),
  levels: z.object({ error: levelTotal, warning: levelTotal }).describe("The same notifications by level."),
  omitted: z.number().int().describe("How many of `total` are not in `notifications`, because the list holds only so many."),
  hasMore: z
    .boolean()
    .describe(
      "True if the Events API had more alerts than it returned: the oldest are missing, and the counts are lower bounds. It returns at most 1000.",
    ),
})
export type NotificationList = z.infer<typeof notificationList>

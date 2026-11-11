import { z } from "zod"

// The contract of what is shown about a machine. The backend takes these shapes as the output of
// its tools, and the properties of the components are inferred from them, so the two cannot drift
// apart. Every value names the topic or the notification it comes from.

/**
 * A machine publishes its state every few seconds. Silent for longer than this, it is not live,
 * and a run of a value ends: what the value was in between is not known.
 */
export const SILENT_AFTER_SECONDS = 30

const instant = z.iso.datetime()

export const reading = z.object({
  value: z.string().nullable().describe("The newest value, or null if the topic had none."),
  at: instant.nullable().describe("When the newest value was measured."),
  since: instant.nullable().describe("Since when the value has been the same."),
  sinceIsLowerBound: z
    .boolean()
    .describe("True if the value was already the same where the window starts, so `since` is only the earliest time known."),
  topic: z.string().describe("The MQTT topic the value comes from."),
})
export type Reading = z.infer<typeof reading>

export const notification = z.object({
  correlationId: z.string(),
  notificationId: z.string(),
  level: z.enum(["Warning", "Error"]),
  title: z.string(),
  raisedAt: instant,
  topic: z.string().describe("The MQTT topic the notification comes from."),
})
export type Notification = z.infer<typeof notification>

/** What a machine does now. */
export const machine = z.object({
  machine: z.string().describe("The serial number, which identifies the machine in every topic."),
  connection: reading,
  itemState: reading,
  operationMode: reading,
  program: reading,
  lastValueAt: instant.nullable().describe("The newest value of any of the readings."),
  notifications: z.array(notification).describe("Warnings and errors that have not gone."),
})
export type Machine = z.infer<typeof machine>

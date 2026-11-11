import { z } from "zod"

// The contract of what is shown about a machine. The backend takes these shapes as the output of
// its tools, and the properties of the components are inferred from them, so the two cannot drift
// apart. Every value names the topic or the notification it comes from.

/**
 * A machine publishes its state every few seconds. Silent for longer than this, it is not live,
 * and a run of a value ends: what the value was in between is not known.
 */
export const SILENT_AFTER_SECONDS = 30

/**
 * An instant is ISO 8601: in UTC, or as a clock in the time zone a tool was asked for shows it,
 * with its offset to UTC. Either way it is one point in time.
 */
export const instant = z.iso.datetime({ offset: true })

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

/** What a machine does, as a list and a card name it. `state.ts` decides which values are which state. */
export const state = z.enum(["alarm", "stopped", "no-data", "setup", "running"])
export type State = z.infer<typeof state>

export const span = z.object({ state, from: instant, to: instant })
export type Span = z.infer<typeof span>

/** The machine card: what one machine does now, and what it did in the hours before. */
export const machineShow = z.object({
  asOf: instant,
  windowSeconds: z.number().describe("How far back the values were read to find `since`."),
  machine,
  history: z.object({
    from: instant,
    to: instant,
    spans: z.array(span).describe("The states between `from` and `to`, oldest first and without a gap."),
  }),
})
export type MachineShow = z.infer<typeof machineShow>

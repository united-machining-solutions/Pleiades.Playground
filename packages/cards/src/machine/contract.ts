import { z } from "zod"

// The contract of what is shown about a machine. The backend takes these shapes as the output of
// its tools, and the properties of the components are inferred from them, so the two cannot drift
// apart. Every value names the topic or the notification it comes from.

/**
 * A machine gives a sign of life every few seconds: its heartbeat, or any value it publishes.
 * Its state it may publish only when the state changes, so a value holds until the next one.
 * Silent for longer than this, the machine is not live, and a run of a value ends: what the
 * value was in between is not known.
 */
export const SILENT_AFTER_SECONDS = 30

/**
 * An instant is ISO 8601: in UTC, or as a clock in the time zone a tool was asked for shows it,
 * with its offset to UTC. Either way it is one point in time.
 */
export const instant = z.iso.datetime({ offset: true })

/**
 * The machine id: the level after `machines/` in every topic, `<manufacturer>_<model>_<serial
 * number>`, for example `alcyone-machines_AX-400_P-04`. The MQTT binding forms it so that it holds
 * nothing that would break a topic; this rule forbids `/`, `+` and `#` and nothing else. Whoever
 * takes or lists a machine id uses this rule, so a machine that is listed can also be asked for.
 */
export const machineId = z.string().regex(/^[^/+#]+$/)

/**
 * How a caller names one machine to a tool that answers a question about it: by its id, or as people
 * call it. The backend finds the machine; nobody has to list the machines first to learn its id.
 */
export const MACHINE_NAMING =
  "The machine: its id, <manufacturer>_<model>_<serial number>, for example alcyone-machines_AX-400_P-04, or what people call it, such as its serial number (P-04) or its model and serial number (AX-400 P-04). A name that fits several machines is refused, with their ids."

/**
 * Where each reading of a machine is kept, below `machines/{machineId}/`: the topics of the umati data
 * model. The backend reads the stored values of these topics, and a page that is live hears them at
 * the broker. The state and the operation mode are the two fields of the snapshot `State/Status`: see
 * `SNAPSHOT_PATHS`.
 */
export const READING_PATHS = {
  connection: "umati/Connection/State",
  heartbeat: "umati/Connection/Heartbeat",
  itemState: "umati/State/Status/MachineryItemState",
  operationMode: "umati/State/Status/MachineryOperationMode",
  program: "umati/WorkMasterMonitoring/ActiveWorkMaster",
} as const
export type ReadingName = keyof typeof READING_PATHS

/**
 * The snapshots among the readings. A snapshot is one topic at the broker, its value an object with
 * a field for each reading; the Timeseries store keeps it field by field, each below the topic of the
 * snapshot: `umati/State/Status` arrives as one message and is read as
 * `umati/State/Status/MachineryItemState` and `umati/State/Status/MachineryOperationMode`.
 */
export const SNAPSHOT_PATHS = ["umati/State/Status"] as const

/** Who a machine is: its identification values, published once and retained. */
export const IDENTITY_PATHS = {
  manufacturer: "umati/Identification/Manufacturer",
  model: "umati/Identification/Model",
  serialNumber: "umati/Identification/SerialNumber",
} as const

/** Where the alerts and notifications of a machine are published, as CloudEvents, below `machines/{machineId}/`. */
export const NOTIFICATIONS_PATH = "events/notifications"

/**
 * The job orders of a machine and what came of them, below `machines/{machineId}/`: two lists of the
 * data model, retained, each message the whole list. The backend reads the job order that runs from
 * the events of the Events API; a page that is live hears these lists, which say the same.
 */
export const JOB_ORDERS_PATH = "umati/JobMonitoring/JobOrders"
export const JOB_ORDER_RESULTS_PATH = "umati/JobMonitoring/JobOrderResults"

/**
 * How far back a machine and its alerts are still looked for, in seconds. A machine that published
 * nothing for longer is not listed, by the backend and by a page that is live alike: at the broker
 * its retained values still stand.
 */
export const HORIZON_SECONDS = 24 * 60 * 60

export const reading = z.object({
  value: z.string().nullable().describe("The newest value, or null if the topic had none."),
  at: instant.nullable().describe("When the newest value was measured."),
  since: instant.nullable().describe("Since when the value has been the same."),
  sinceIsLowerBound: z
    .boolean()
    .describe("True if the value was already the same before the values that were read, so `since` is only the earliest time known."),
  topic: z.string().describe("The MQTT topic the value comes from."),
})
export type Reading = z.infer<typeof reading>

/** The categories of an alert after NAMUR NE 107, from the most urgent. */
export const severity = z.enum(["Failure", "CheckFunction", "OffSpec", "MaintenanceRequired"])
export type Severity = z.infer<typeof severity>

/**
 * An alert of the machine that stands: raised and not cleared. `level` is what a display that knows
 * errors and warnings shows: a `Failure` is an error, every other category a warning.
 */
export const notification = z.object({
  correlationId: z.string().describe("The id of the alert, the same in its raise and its clear."),
  notificationId: z.string().describe("The error code of the manufacturer."),
  severity: severity.nullable().describe("The category after NAMUR NE 107."),
  level: z.enum(["Warning", "Error"]),
  title: z.string().describe("The message of the alert."),
  raisedAt: instant,
  topic: z.string().describe("The MQTT topic the alert comes from."),
})
export type Notification = z.infer<typeof notification>

/** Who the machine is, from its identification values; null where it reported none. */
export const identity = z.object({
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  serialNumber: z.string().nullable(),
})
export type Identity = z.infer<typeof identity>

/** The job order the machine works on, with what came of it so far. */
export const jobOrder = z.object({
  jobOrderId: z.string(),
  state: z.string().describe("Running or Interrupted."),
  producedQuantity: z.number().nullable(),
  runsPlanned: z.number().nullable(),
})
export type JobOrder = z.infer<typeof jobOrder>

/** What a machine does now. */
export const machine = z.object({
  machine: machineId.describe("The machine id, which identifies the machine in every topic."),
  identity,
  connection: reading.describe("The state of the adapter: Initializing, Running, CommunicationFault or Shutdown."),
  heartbeat: reading.describe("The sign of life of the machine. Its value counts up and says nothing else."),
  itemState: reading,
  operationMode: reading,
  program: reading.describe("The work master the machine carries out."),
  jobOrder: jobOrder.nullable().describe("The job order that runs or is interrupted, or null."),
  lastValueAt: instant.nullable().describe("The newest value of any of the readings: the last sign of life."),
  notifications: z
    .array(notification)
    .describe("Alerts that were raised in the last 24 hours and have not been cleared."),
})
export type Machine = z.infer<typeof machine>

/** What a machine does, as a list and a card name it. `state.ts` decides which values are which state. */
export const state = z.enum(["alarm", "stopped", "no-data", "setup", "running"])
export type State = z.infer<typeof state>

export const span = z.object({ state, from: instant, to: instant })
export type Span = z.infer<typeof span>

export const total = z.object({
  state,
  seconds: z.number().describe("How long the machine was in that state between `from` and `to`, in seconds."),
})
export type Total = z.infer<typeof total>

/** The list of machines: what every machine does now. An application draws it with rows of its own. */
export const machineList = z.object({
  asOf: instant,
  windowSeconds: z.number().describe("How far back the values were read to find `since`."),
  machines: z.array(machine),
})
export type MachineList = z.infer<typeof machineList>

/**
 * The machine card: what one machine does now, and how long each state lasted in the hours
 * before. These values are few, so a language model can read them. The states themselves, the
 * spans of the band, are not among them: a card asks for those itself (`spanList`).
 */
export const machineShow = z.object({
  asOf: instant,
  windowSeconds: z.number().describe("How far back the values were read to find `since`."),
  machine,
  history: z.object({
    from: instant,
    to: instant,
    totals: z
      .array(total)
      .describe(
        "How long each state lasted in total between `from` and `to`, in the order a display reads the states. A state that did not occur is not listed.",
      ),
  }),
})
export type MachineShow = z.infer<typeof machineShow>

/**
 * The states of one machine between two instants: what the band of the machine card draws. A
 * card asks for them after its values, with the `from` and `to` of their history, so the band and
 * the sums are about the same hours. They grow with time, so they are not part of what a language
 * model reads.
 */
export const spanList = z.object({
  machine: machineId.describe("The machine id."),
  from: instant,
  to: instant,
  spans: z.array(span).describe("The states between `from` and `to`, oldest first and without a gap."),
})
export type SpanList = z.infer<typeof spanList>

/**
 * A job order as the stack knows it from its events: what is ordered (an entry of
 * `JobMonitoring/JobOrders`) and what came of it from its start (an entry of
 * `JobMonitoring/JobOrderResults`). Quantities are counts.
 */
export const jobOrderEntry = z.object({
  machine: machineId.describe("The machine id of the machine the job order is on."),
  jobOrderId: z.string(),
  state: z
    .string()
    .describe("NotAllowedToStart, AllowedToStart, Running, Interrupted, Ended or Aborted (ISA-95); empty if unknown."),
  changedAt: instant.describe("When its last event happened."),
  jobName: z.string().nullable(),
  workMaster: z.string().nullable().describe("The work master it carries out."),
  orderNumbers: z.array(z.string()).describe("The order numbers of the ERP it belongs to; empty ones are left out."),
  runsPlanned: z.number().nullable(),
  plannedStart: instant.nullable(),
  plannedEnd: instant.nullable(),
  start: instant.nullable().describe("When it started; null before its start, as every field of its result."),
  end: instant.nullable().describe("When it ended or was aborted."),
  produced: z.number().nullable().describe("Parts produced."),
  good: z.number().nullable().describe("Of those, the good ones."),
  result: z.string().nullable().describe("Unknown until it ends, then Successful or Unsuccessful."),
})
export type JobOrderEntry = z.infer<typeof jobOrderEntry>

/** The job orders on the lists of the machines. */
export const jobOrderList = z.object({
  asOf: instant,
  windowSeconds: z.number().describe("How far back the last event of a job order may lie."),
  jobOrders: z
    .array(jobOrderEntry)
    .describe("Every job order still on the list of its machine, by machine, then the oldest change first."),
})
export type JobOrderList = z.infer<typeof jobOrderList>

/** How many spans a band has room for: about one for each pixel of its width. */
export const BAND_SLOTS = 720

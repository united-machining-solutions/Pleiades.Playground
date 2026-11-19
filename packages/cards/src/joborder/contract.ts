import { z } from "zod"

import { instant, jobOrderEntry, machineId } from "../machine/contract.ts"

// The contract of the job order card: the job order a machine works on (`JobMonitoring.JobOrders` with its
// `JobMonitoring.JobOrderResults`), the program execution in it (`WorkMasterMonitoring.ProgramExecution`),
// and both over the last hours. Every name is the name of the umati data model 0.17.1, and every value comes
// from the events of the machine, as the Events API puts them together. The backend takes these shapes as
// the output of its tools, and the properties of the component are inferred from them.

/** How many hours the card looks back if nobody asks, and at most. */
export const JOB_ORDER_HOURS = 8
export const MOST_JOB_ORDER_HOURS = 24

/** A program execution: a `ProgramExecutionStarted` with its `ProgramExecutionEnded` or `ProgramExecutionAborted`. */
export const programExecution = z.object({
  ExecutionId: z.string(),
  JobOrderID: z.string().nullable().describe("The job order the program execution belongs to, if any."),
  ActiveWorkMaster: z.string().nullable().describe("The work master, the program, it carries out."),
  State: z.string().describe("Running, Interrupted, Ended or Aborted."),
  StartTime: instant,
  EndTime: instant.nullable().describe("When it ended or was aborted. Null while it runs."),
  Duration: z.number().nullable().describe("How long it ran, in seconds, its interruptions included. Null while it runs."),
  Interruptions: z.number().int().nullable().describe("How often it was interrupted."),
  PartsProduced: z.number().nullable(),
})
export type ProgramExecution = z.infer<typeof programExecution>

/**
 * The job order card: the job order of one machine that runs or is interrupted, else the one that changed
 * last, and its program execution that runs, else the newest that ended; how many of both there were in the
 * last hours. The spans of both over those hours grow with time: the card asks for them itself
 * (`jobOrderTimeline`).
 */
export const jobOrderShow = z.object({
  asOf: instant,
  machine: machineId.describe("The machine id."),
  from: instant.describe("The beginning of the hours the counts are about. They end at `asOf`."),
  hours: z.number().int().describe("How many hours back `from` lies."),
  jobOrder: jobOrderEntry
    .nullable()
    .describe(
      "The job order that runs or is interrupted, else the one whose last event is the newest; one left open by an earlier run of the adapter only where there is no other. Null if the machine has none.",
    ),
  programExecution: programExecution
    .nullable()
    .describe("The program execution of the machine that runs or is interrupted, else the newest that ended. Null if it has none."),
  jobOrders: z.number().int().describe("How many job orders were on the list of the machine at some time between `from` and `asOf`."),
  programExecutions: z.number().int().describe("How many program executions ran at some time between `from` and `asOf`."),
  aborted: z.number().int().describe("How many of those program executions were aborted."),
  hasMore: z
    .boolean()
    .describe("True if the Events API had more job orders or program executions than it returned, 1000 at most: the counts are then lower bounds."),
  topics: z
    .object({ jobs: z.string(), workmasters: z.string() })
    .describe("The MQTT topics of the events the values come from: of the job orders and of the program executions."),
})
export type JobOrderShow = z.infer<typeof jobOrderShow>

/** A stretch of time of a job order or a program execution, clipped to the hours of the timeline. */
export const jobOrderSpan = z.object({
  from: instant,
  to: instant,
  id: z.string().describe("The JobOrderID or the ExecutionId."),
  label: z.string().describe("What the span is called: the JobOrderID, or the ActiveWorkMaster of a program execution."),
  state: z
    .string()
    .describe("Its last known state: Running, Interrupted, Ended or Aborted. One that runs on past `to` (`open`) may have ended since."),
  open: z.boolean().describe("True if it had not ended at `to`: it runs on."),
  details: z
    .array(z.object({ name: z.string(), value: z.string().nullable() }))
    .describe("Its fields by the names of the data model, for a display to show on hover."),
})
export type JobOrderSpan = z.infer<typeof jobOrderSpan>

/**
 * The job orders and program executions of one machine between two instants: what the timeline of the
 * job order card draws, a lane for each. A job order or a program execution that never ended stands until
 * the adapter of the machine started again (`umati/Connection/State` became `Initializing`): a new start
 * begins with empty lists, so one left open by the run before does not run on.
 */
export const jobOrderTimeline = z.object({
  machine: machineId,
  from: instant,
  to: instant,
  jobOrders: z.array(jobOrderSpan).describe("JobMonitoring.JobOrders from their StartTime to their EndTime, oldest first."),
  programExecutions: z.array(jobOrderSpan).describe("WorkMasterMonitoring.ProgramExecution from StartTime to EndTime, oldest first."),
  hasMore: z.boolean().describe("True if the Events API had more than it returned: the oldest spans may be missing."),
  topics: z.object({ jobs: z.string(), workmasters: z.string() }),
})
export type JobOrderTimeline = z.infer<typeof jobOrderTimeline>

import { JOB_ORDER_HOURS, MOST_JOB_ORDER_HOURS } from "@pleiades/cards/joborder/contract.ts"
import type { JobOrderShow, JobOrderSpan, JobOrderTimeline, ProgramExecution } from "@pleiades/cards/joborder/contract.ts"
import { HORIZON_SECONDS } from "@pleiades/cards/machine/contract.ts"

import { readJobOrders, readProgramExecutions, readStrings } from "./apis.ts"
import type { Apis, StoredJobOrder, StoredProgramExecution } from "./apis.ts"
import { entryOf } from "./job-orders.ts"
import { knownMachines, machineNamed } from "./machines.ts"
import { secondsBefore } from "./time.ts"

// The job orders and program executions of one machine, by the names of the umati data model:
// `JobMonitoring.JobOrders` with their results and `WorkMasterMonitoring.ProgramExecution`, as the Events
// API puts them together from the events of the machine. What the job order card shows now, and both
// over the last hours for its timeline.

/** How many entries the Events API returns at most in one answer. */
const MOST_ITEMS = 1000

/** Where the adapter publishes the state of its connection: a new start of it begins with empty lists. */
const CONNECTION_STATE = "umati/Connection/State"

/** An instant as an ISO 8601 string in UTC, or null: the Events API may leave out zeros or write an offset. */
function utc(written: string | null | undefined): string | null {
  if (!written) return null
  const at = Date.parse(written)
  return Number.isNaN(at) ? null : new Date(at).toISOString()
}

/** A job order that has not ended: running, interrupted, or not yet started. */
const isOpen = (state: string) => state === "Running" || state === "Interrupted"

/** A program execution of the Events API by the names of the data model. */
export function executionOf(stored: StoredProgramExecution): ProgramExecution {
  return {
    ExecutionId: stored.executionId,
    JobOrderID: stored.jobOrderId ?? null,
    ActiveWorkMaster: stored.workMasterId ?? null,
    State: stored.state,
    StartTime: utc(stored.startTime) ?? new Date(0).toISOString(),
    EndTime: utc(stored.endTime),
    Duration: stored.duration ?? null,
    Interruptions: stored.interruptions ?? null,
    PartsProduced: stored.partsProduced ?? null,
  }
}

/** When the adapter of the machine started, each time, between two instants: its connection became `Initializing`. */
async function adapterStarts(apis: Apis, machine: string, from: Date, to: Date): Promise<Array<number>> {
  const topic = `machines/${machine}/${CONNECTION_STATE}`
  const [series] = (await readStrings(apis, topic, from, to)).filter((one) => one.topic === topic)
  return (series?.samples ?? []).filter((one) => one.value === "Initializing").map((one) => Date.parse(one.at)).sort((a, b) => a - b)
}

/**
 * Until when something ran that began at `since`: its end, else the next start of the adapter after
 * `since`, else Infinity, as long as it runs. One left open by an earlier run of the adapter does not run on.
 */
export function endOf(end: string | null, since: string, starts: ReadonlyArray<number>): number {
  if (end !== null) return Date.parse(end)
  const begun = Date.parse(since)
  return starts.find((start) => start > begun) ?? Infinity
}

/** The job order a card shows: one that runs or is interrupted and still stands, else the one that changed last. */
export function currentJobOrder(stored: ReadonlyArray<StoredJobOrder>, starts: ReadonlyArray<number>): StoredJobOrder | null {
  const listed = [...stored].filter((one) => !one.removed).sort((a, b) => b.lastChange.localeCompare(a.lastChange))
  const standing = listed.find((one) => isOpen(one.state) && endOf(utc(one.endTime), one.lastChange, starts) === Infinity)
  return standing ?? listed.find((one) => !isOpen(one.state)) ?? listed[0] ?? null
}

/** The hours asked for, refused with a sentence if they are not ones the card looks back. */
function hoursOf(hours: number): number {
  if (!(Number.isInteger(hours) && hours >= 1 && hours <= MOST_JOB_ORDER_HOURS)) {
    throw new Error(`The card looks back between 1 and ${MOST_JOB_ORDER_HOURS} whole hours.`)
  }
  return hours
}

/** What the card needs of one machine between two instants: its job orders, program executions and the starts of its adapter. */
async function readHistory(apis: Apis, machine: string, from: Date, to: Date) {
  // A job order or program execution that began up to a day before still runs into the hours.
  const earlier = secondsBefore(from, HORIZON_SECONDS)
  const [jobOrders, { executions, hasMore }] = await Promise.all([
    readJobOrders(apis, earlier, to, machine),
    readProgramExecutions(apis, machine, earlier, to),
  ])
  const starts = await adapterStarts(apis, machine, earlier, to)
  return { jobOrders, executions, starts, hasMore: hasMore || jobOrders.length >= MOST_ITEMS }
}

/** Whether a stretch from `start` until `end` overlaps the hours from `from` to `to`. */
const overlaps = (start: string | null, end: number, from: number, to: number) => start !== null && Date.parse(start) < to && end > from

/** The topics of the events the values come from. */
const topicsOf = (machine: string) => ({ jobs: `machines/${machine}/events/jobs`, workmasters: `machines/${machine}/events/workmasters` })

/**
 * The job order card of one machine: its job order now, its newest program execution, and how many of
 * both ran in the last hours. The machine is named by its id or as people call it.
 */
export async function showJobOrder(apis: Apis, name: string, hours = JOB_ORDER_HOURS, now = new Date()): Promise<JobOrderShow> {
  const back = hoursOf(hours)
  const machine = machineNamed(await knownMachines(apis, now), name)
  const from = secondsBefore(now, back * 3600)
  const { jobOrders, executions, starts, hasMore } = await readHistory(apis, machine, from, now)
  const [start, end] = [from.getTime(), now.getTime()]
  const current = currentJobOrder(jobOrders, starts)
  const newest = [...executions].sort((a, b) => b.startTime.localeCompare(a.startTime))
  const running = newest.find((one) => endOf(utc(one.endTime), one.startTime, starts) === Infinity)
  const inHours = executions.filter((one) => overlaps(one.startTime, endOf(utc(one.endTime), one.startTime, starts), start, end))
  return {
    asOf: now.toISOString(),
    machine,
    from: from.toISOString(),
    hours: back,
    jobOrder: current && entryOf(current),
    programExecution: (running ?? newest[0]) ? executionOf((running ?? newest[0])!) : null,
    // On the list in the hours: an event of it lies in them, or it started before and ran into them.
    jobOrders: jobOrders.filter(
      (one) =>
        Date.parse(one.lastChange) >= start || overlaps(utc(one.startTime), endOf(utc(one.endTime), one.lastChange, starts), start, end),
    ).length,
    programExecutions: inHours.length,
    aborted: inHours.filter((one) => one.state === "Aborted").length,
    hasMore,
    topics: topicsOf(machine),
  }
}

/** A stretch clipped to the hours, with whether it runs on past them. */
function clipped(begin: string, end: number, from: number, to: number) {
  return { from: new Date(Math.max(from, Date.parse(begin))).toISOString(), to: new Date(Math.min(to, end)).toISOString(), open: end > to }
}

/** The job orders and program executions of one machine between two instants, for the timeline of the card. */
export async function listJobOrderTimeline(apis: Apis, machine: string, fromText: string, toText: string): Promise<JobOrderTimeline> {
  const [from, to] = [new Date(fromText), new Date(toText)]
  const [start, end] = [from.getTime(), to.getTime()]
  if (!(end > start) || end - start > MOST_JOB_ORDER_HOURS * 3600_000) {
    throw new Error(`\`to\` lies after \`from\`, at most ${MOST_JOB_ORDER_HOURS} hours.`)
  }
  const { jobOrders, executions, starts, hasMore } = await readHistory(apis, machine, from, to)
  const jobSpans = jobOrders.flatMap((one): Array<JobOrderSpan> => {
    const begun = utc(one.startTime)
    // A job order that never started has no stretch on the timeline.
    if (begun === null) return []
    const until = endOf(utc(one.endTime), one.lastChange, starts)
    if (!overlaps(begun, until, start, end)) return []
    return [
      {
        ...clipped(begun, until, start, end),
        id: one.jobOrderId,
        label: one.jobOrderId,
        // One left open by an earlier run of the adapter shows the state it had then.
        state: one.state,
        details: [
          { name: "JobOrderID", value: one.jobOrderId },
          { name: "JobName", value: one.jobName ?? null },
          { name: "WorkMasterID", value: one.workMasterId ?? null },
          { name: "State", value: one.state },
          { name: "StartTime", value: begun },
          { name: "EndTime", value: utc(one.endTime) },
          { name: "ProducedQuantity", value: one.producedQuantity == null ? null : String(one.producedQuantity) },
          { name: "JobResult", value: one.jobResult ?? null },
        ],
      },
    ]
  })
  const runSpans = executions.flatMap((one): Array<JobOrderSpan> => {
    const begun = utc(one.startTime)!
    const until = endOf(utc(one.endTime), one.startTime, starts)
    if (!overlaps(begun, until, start, end)) return []
    const run = executionOf(one)
    return [
      {
        ...clipped(begun, until, start, end),
        id: run.ExecutionId,
        label: run.ActiveWorkMaster ?? run.ExecutionId,
        state: run.State,
        details: [
          { name: "ActiveWorkMaster", value: run.ActiveWorkMaster },
          { name: "ExecutionId", value: run.ExecutionId },
          { name: "JobOrderID", value: run.JobOrderID },
          { name: "State", value: run.State },
          { name: "StartTime", value: run.StartTime },
          { name: "EndTime", value: run.EndTime },
          { name: "Interruptions", value: run.Interruptions === null ? null : String(run.Interruptions) },
          { name: "PartsProduced", value: run.PartsProduced === null ? null : String(run.PartsProduced) },
        ],
      },
    ]
  })
  const oldestFirst = (a: JobOrderSpan, b: JobOrderSpan) => a.from.localeCompare(b.from)
  return {
    machine,
    from: from.toISOString(),
    to: to.toISOString(),
    jobOrders: jobSpans.sort(oldestFirst),
    programExecutions: runSpans.sort(oldestFirst),
    hasMore,
    topics: topicsOf(machine),
  }
}

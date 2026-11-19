import { JOB_ORDER_HOURS, MOST_JOB_ORDER_HOURS } from "@pleiades/cards/joborder/contract.ts"
import type { JobOrderShow, JobOrderSpan, JobOrderTimeline, ProgramExecution } from "@pleiades/cards/joborder/contract.ts"
import { HORIZON_SECONDS } from "@pleiades/cards/machine/contract.ts"

import { EVER, readJobOrders, readProgramExecutions, readStrings } from "./apis.ts"
import type { Apis, StoredJobOrder, StoredProgramExecution } from "./apis.ts"
import { entryOf, utc } from "./job-orders.ts"
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

/** A job order that has begun and not ended: running or interrupted. One not yet started is not open. */
const isOpen = (state: string) => state === "Running" || state === "Interrupted"

/**
 * Newest first, by an instant of each. Compared as instants, not as text: the Events API may leave out
 * zeros of the fraction, and then the text does not order two instants of the same second.
 */
const newestBy =
  <TOne>(instantOf: (one: TOne) => string) =>
  (a: TOne, b: TOne) =>
    Date.parse(instantOf(b)) - Date.parse(instantOf(a))

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

/**
 * Until when a job order stood: as `endOf`, and one taken off the list (`JobOrderRemoved`) stands no
 * longer than until then, also where it had no EndTime.
 */
export function jobOrderEnd(stored: StoredJobOrder, starts: ReadonlyArray<number>): number {
  const end = endOf(utc(stored.endTime), stored.lastChange, starts)
  return stored.removed ? Math.min(end, Date.parse(stored.lastChange)) : end
}

/** Since when a job order stood on the list: its first event. */
function listedSince(stored: StoredJobOrder): string | null {
  return utc(stored.firstSeen) ?? utc(stored.startTime) ?? utc(stored.lastChange)
}

/**
 * Until when a job order stood on the list, whether it ran or waited: until it was taken off, else until
 * the next start of the adapter after its last change, which begins with an empty list, else on.
 */
export function listedUntil(stored: StoredJobOrder, starts: ReadonlyArray<number>): number {
  return stored.removed ? Date.parse(stored.lastChange) : endOf(null, stored.lastChange, starts)
}

/**
 * The job order a card shows: one that runs or is interrupted and still stands, else the one that changed
 * last; one left open by an earlier run of the adapter only where there is no other.
 */
export function currentJobOrder(stored: ReadonlyArray<StoredJobOrder>, starts: ReadonlyArray<number>): StoredJobOrder | null {
  const listed = stored.filter((one) => !one.removed).sort(newestBy((one) => one.lastChange))
  const standing = listed.find((one) => isOpen(one.state) && jobOrderEnd(one, starts) === Infinity)
  return standing ?? listed.find((one) => !isOpen(one.state)) ?? listed[0] ?? null
}

/**
 * The program execution a card shows: the one that runs or is interrupted and still stands, else the
 * newest that ended. One left open by an earlier run of the adapter does not run on, so it is shown only
 * where there is no other.
 */
export function currentExecution(
  stored: ReadonlyArray<StoredProgramExecution>,
  starts: ReadonlyArray<number>,
): StoredProgramExecution | null {
  const newest = [...stored].sort(newestBy((one) => one.startTime))
  const standing = newest.find((one) => endOf(utc(one.endTime), one.startTime, starts) === Infinity)
  return standing ?? newest.find((one) => utc(one.endTime) !== null) ?? newest[0] ?? null
}

/** The hours asked for, refused with a sentence if they are not ones the card looks back. */
function hoursOf(hours: number): number {
  if (!(Number.isInteger(hours) && hours >= 1 && hours <= MOST_JOB_ORDER_HOURS)) {
    throw new Error(`The card looks back between 1 and ${MOST_JOB_ORDER_HOURS} whole hours.`)
  }
  return hours
}

/**
 * What the card needs of one machine between two instants: its job orders, program executions and the
 * starts of its adapter.
 */
async function readHistory(apis: Apis, machine: string, from: Date, to: Date, now: Date) {
  // A program execution that began up to a day before still runs into the hours.
  const earlier = secondsBefore(from, HORIZON_SECONDS)
  // The Events API picks a job order by its last change and has only its last state, so every job order is
  // read up to now: one that changed after the hours, as the one that runs does a moment after a card
  // asked, and one that stands on the list without an event for longer than a day, interrupted or waiting.
  // Whether one of those still stands, the starts of the adapter after its last change say.
  const lastChange = new Date(Math.max(to.getTime(), now.getTime()))
  const [stored, { executions, hasMore }, starts] = await Promise.all([
    readJobOrders(apis, EVER, lastChange, machine),
    readProgramExecutions(apis, machine, earlier, to),
    adapterStarts(apis, machine, EVER, to),
  ])
  // One taken off the list before the day before the hours did not stand in them.
  const jobOrders = stored.filter((one) => !one.removed || Date.parse(one.lastChange) >= earlier.getTime())
  // The API answers the newest 1000 first: only where the oldest of them is younger than that day may some be missing.
  const cut = stored.length >= MOST_ITEMS && Date.parse(stored[stored.length - 1]!.lastChange) >= earlier.getTime()
  return { jobOrders, executions, starts, hasMore: hasMore || cut }
}

/** Whether a stretch from `start` until `end` overlaps the hours from `from` to `to`. */
const overlaps = (start: string | null, end: number, from: number, to: number) => start !== null && Date.parse(start) < to && end > from

/** The topics of the events the values come from. */
const topicsOf = (machine: string) => ({ jobs: `machines/${machine}/events/jobs`, workmasters: `machines/${machine}/events/workmasters` })

/**
 * The job order card of one machine: its job order now, its program execution that runs, else the newest
 * that ended, and how many of
 * both ran in the last hours. The machine is named by its id or as people call it.
 */
export async function showJobOrder(apis: Apis, name: string, hours = JOB_ORDER_HOURS, now = new Date()): Promise<JobOrderShow> {
  const back = hoursOf(hours)
  const machine = machineNamed(await knownMachines(apis, now), name)
  const from = secondsBefore(now, back * 3600)
  const { jobOrders, executions, starts, hasMore } = await readHistory(apis, machine, from, now, now)
  const [start, end] = [from.getTime(), now.getTime()]
  const current = currentJobOrder(jobOrders, starts)
  const execution = currentExecution(executions, starts)
  const inHours = executions.filter((one) => overlaps(one.startTime, endOf(utc(one.endTime), one.startTime, starts), start, end))
  return {
    asOf: now.toISOString(),
    machine,
    from: from.toISOString(),
    hours: back,
    jobOrder: current && entryOf(current),
    programExecution: execution && executionOf(execution),
    // On the list at some time in the hours, whether it ran or waited.
    jobOrders: jobOrders.filter((one) => overlaps(listedSince(one), listedUntil(one, starts), start, end)).length,
    programExecutions: inHours.length,
    // By how it ended, not by its State: an event of the end need not carry one.
    aborted: inHours.filter((one) => one.endType === "Aborted").length,
    hasMore,
    topics: topicsOf(machine),
  }
}

/** A stretch clipped to the hours, with whether it runs on past them. */
function clipped(begin: string, end: number, from: number, to: number) {
  return { from: new Date(Math.max(from, Date.parse(begin))).toISOString(), to: new Date(Math.min(to, end)).toISOString(), open: end > to }
}

/** The job orders and program executions of one machine between two instants, for the timeline of the card. */
export async function listJobOrderTimeline(
  apis: Apis,
  machine: string,
  fromText: string,
  toText: string,
  now = new Date(),
): Promise<JobOrderTimeline> {
  const [from, to] = [new Date(fromText), new Date(toText)]
  const [start, end] = [from.getTime(), to.getTime()]
  if (!(end > start) || end - start > MOST_JOB_ORDER_HOURS * 3600_000) {
    throw new Error(`\`to\` lies after \`from\`, at most ${MOST_JOB_ORDER_HOURS} hours.`)
  }
  const { jobOrders, executions, starts, hasMore } = await readHistory(apis, machine, from, to, now)
  const jobSpans = jobOrders.flatMap((one): Array<JobOrderSpan> => {
    const begun = utc(one.startTime)
    // A job order that never started has no stretch on the timeline.
    if (begun === null) return []
    const until = jobOrderEnd(one, starts)
    if (!overlaps(begun, until, start, end)) return []
    return [
      {
        ...clipped(begun, until, start, end),
        id: one.jobOrderId,
        label: one.jobOrderId,
        // Its last state: one left open by an earlier run of the adapter shows the state it had then, one
        // that changed after `to` the state it has now.
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
    const begun = utc(one.startTime)
    const until = endOf(utc(one.endTime), one.startTime, starts)
    if (begun === null || !overlaps(begun, until, start, end)) return []
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

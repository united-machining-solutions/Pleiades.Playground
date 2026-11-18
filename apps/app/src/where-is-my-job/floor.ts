import { JOB_ORDER_RESULTS_PATH, JOB_ORDERS_PATH } from "@pleiades/cards/machine/contract.ts"
import type { JobOrderList, MachineShow } from "@pleiades/cards/machine/contract.ts"

import { chartsAt, chartsWith, machineFilters } from "../live/machines.ts"
import type { ChartsPage } from "../live/machines.ts"
import { instantOf, listOf, machineOf } from "../live/messages.ts"

/**
 * The shop floor of the page "Where is My Job?", from the values of the stack: every machine with
 * its card values, and its job orders with their results. The loader reads the job orders from the
 * backend (`genui_job_order_list`); from then on the two lists of `JobMonitoring` that the broker
 * sends replace those of their machine. From these the page follows an order across the machines.
 *
 * The grouping into orders and the utilisation are computed in the app: the page is a basis for
 * discussion. If it stays, both move into a tool, and the page only draws.
 */

/** The state of a job order, as the data model names it. */
export type JobState = "NotAllowedToStart" | "AllowedToStart" | "Running" | "Interrupted" | "Ended" | "Aborted"

/** What is ordered: an entry of `JobMonitoring/JobOrders`. */
export type Job = {
  jobOrderId: string
  /** Empty if the source names none. */
  state: JobState | string
  /** When it got its state, as far as the source knows; for sorting only. */
  stateSince: string | null
  jobName: string | null
  workMaster: string | null
  /** Never an empty one. */
  orderNumbers: ReadonlyArray<string>
  runsPlanned: number | null
  plannedStart: string | null
  plannedEnd: string | null
}

/** What came of a job order, from its start: an entry of `JobMonitoring/JobOrderResults`. */
export type JobResult = {
  jobOrderId: string
  start: string | null
  end: string | null
  produced: number | null
  good: number | null
  result: string | null
}

/** The two lists of one machine; null until one is known. */
export type Jobs = { orders: ReadonlyArray<Job> | null; results: ReadonlyArray<JobResult> | null }

export type FloorPage = ChartsPage & { jobs: Readonly<Record<string, Jobs>> }

const text = (value: unknown) => (typeof value === "string" ? value : null)
const number = (value: unknown) => (typeof value === "number" ? value : null)
const numbersOf = (value: unknown): Array<string> =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === "string" && one.trim() !== "") : []

/** An entry of the list of the broker, by the same rules as `genui_job_order_list`: instants in one form, no empty order number. */
export function jobOf(entry: Record<string, unknown>): Job | null {
  const jobOrderId = text(entry.JobOrderID)
  if (jobOrderId === null) return null
  return {
    jobOrderId,
    state: text(entry.State) ?? "",
    stateSince: instantOf(entry.StateSince),
    jobName: text(entry.JobName),
    workMaster: text(entry.WorkMasterID),
    orderNumbers: numbersOf(entry.OrderNumbers),
    runsPlanned: number(entry.RunsPlanned),
    plannedStart: instantOf(entry.PlannedStartTime),
    plannedEnd: instantOf(entry.PlannedEndTime),
  }
}

export function resultOf(entry: Record<string, unknown>): JobResult | null {
  const jobOrderId = text(entry.JobOrderID)
  if (jobOrderId === null) return null
  return {
    jobOrderId,
    start: instantOf(entry.StartTime),
    end: instantOf(entry.EndTime),
    produced: number(entry.ProducedQuantity),
    good: number(entry.GoodQuantity),
    result: text(entry.JobResult),
  }
}

/** The job orders the backend read, as the two lists of each machine. Without them, none is known yet. */
export function jobsOf(list: JobOrderList | null): Record<string, Jobs> {
  const jobs: Record<string, { orders: Array<Job>; results: Array<JobResult> }> = {}
  for (const one of list?.jobOrders ?? []) {
    const lists = (jobs[one.machine] ??= { orders: [], results: [] })
    lists.orders.push({
      jobOrderId: one.jobOrderId,
      state: one.state,
      stateSince: one.changedAt,
      jobName: one.jobName,
      workMaster: one.workMaster,
      orderNumbers: one.orderNumbers,
      runsPlanned: one.runsPlanned,
      plannedStart: one.plannedStart,
      plannedEnd: one.plannedEnd,
    })
    if (one.start !== null) {
      lists.results.push({ jobOrderId: one.jobOrderId, start: one.start, end: one.end, produced: one.produced, good: one.good, result: one.result })
    }
  }
  return jobs
}

/** The page as the loader read it: the machines, and the job orders of the backend. */
export function floorOf(page: ChartsPage, jobOrders: JobOrderList | null): FloorPage {
  return { ...page, jobs: jobsOf(jobOrders) }
}

/** The topics the page hears: those of the machines, the two lists of job orders among them. */
export const floorFilters = machineFilters()

/** What a message does to the page: a value of a machine, or one of its two lists of job orders. */
export function floorWith(page: FloorPage, topic: string, payload: string, now = Date.now()): FloorPage {
  const charts = chartsWith(page, topic, payload, now)
  const id = machineOf(topic)
  const below = (path: string) => id !== undefined && topic === `machines/${id}/${path}`
  const isOrders = below(JOB_ORDERS_PATH)
  if (!id || (!isOrders && !below(JOB_ORDER_RESULTS_PATH))) return charts === page ? page : { ...page, ...charts }
  const list = listOf(payload, now)
  if (list === null) return charts === page ? page : { ...page, ...charts }
  const before = page.jobs[id] ?? { orders: null, results: null }
  const jobs: Jobs = isOrders
    ? { ...before, orders: list.entries.flatMap((entry) => jobOf(entry) ?? []) }
    : { ...before, results: list.entries.flatMap((entry) => resultOf(entry) ?? []) }
  return { ...page, ...charts, jobs: { ...page.jobs, [id]: jobs } }
}

/** The page at a later instant: the machines go on as on the page Charts; the job orders wait for the broker. */
export function floorAt(page: FloorPage, now: string): FloorPage {
  const charts = chartsAt(page, now)
  return charts === page ? page : { ...page, ...charts }
}

/** The share of its history a machine was producing, from the sums of its card; null without a history. */
export function utilisation(show: MachineShow): number | null {
  const total = show.history.totals.reduce((sum, one) => sum + one.seconds, 0)
  if (total <= 0) return null
  return (show.history.totals.find((one) => one.state === "running")?.seconds ?? 0) / total
}

const resultFor = (jobs: Jobs | undefined, job: Job) => jobs?.results?.find((one) => one.jobOrderId === job.jobOrderId) ?? null

/**
 * A job order the planner took back before it ran: aborted, and never started. It is no order
 * anybody waits for, so the page leaves it out.
 */
function cancelled(job: Job, result: JobResult | null): boolean {
  return job.state === "Aborted" && !result?.start
}

/** The job orders of a machine the page shows, with their results: all but the cancelled ones. */
export function jobsWithResults(jobs: Jobs | undefined): ReadonlyArray<{ job: Job; result: JobResult | null }> {
  return (jobs?.orders ?? []).map((job) => ({ job, result: resultFor(jobs, job) })).filter(({ job, result }) => !cancelled(job, result))
}

/** The job orders that are released and wait for their start. */
export function waiting(jobs: Jobs | undefined): ReadonlyArray<Job> {
  return (jobs?.orders ?? []).filter((one) => one.state === "AllowedToStart" || one.state === "NotAllowedToStart")
}

/** The job orders that ended or were aborted while they ran, newest first, with their results. */
export function finished(jobs: Jobs | undefined): ReadonlyArray<{ job: Job; result: JobResult | null }> {
  return jobsWithResults(jobs)
    .filter(({ job }) => job.state === "Ended" || job.state === "Aborted")
    .sort((a, b) => (b.result?.end ?? b.job.stateSince ?? "").localeCompare(a.result?.end ?? a.job.stateSince ?? ""))
}

/**
 * The job order a machine works on: the one that runs or is interrupted whose state changed last,
 * by the rule the tile takes it by (`withJobOrders`), or the one the backend named for it.
 */
export function workingOn(jobs: Jobs | undefined, named: string | null): Job | null {
  const working = (jobs?.orders ?? []).filter((one) => one.state === "Running" || one.state === "Interrupted")
  return (
    working.find((one) => one.jobOrderId === named) ??
    [...working].sort((a, b) => (b.stateSince ?? "").localeCompare(a.stateSince ?? ""))[0] ??
    null
  )
}

/** One step of an order: a job order on one machine. */
export type Step = { machine: string; job: Job; result: JobResult | null }

/** Where an order stands: at a machine that works on it, held up there, waiting for its start, or through. */
export type OrderState = "running" | "interrupted" | "waiting" | "ended" | "aborted"

/**
 * An order across the shop floor: every job order that names the same order number, on whatever
 * machine, in the order they started. A job order without an order number is an order of its own.
 * `key` tells the orders apart, `label` names one: the order number, or else the job order.
 */
export type Order = {
  key: string
  number: string | null
  label: string
  jobName: string | null
  steps: ReadonlyArray<Step>
  state: OrderState
  at: Step
}

const begun = (step: Step) => step.result?.start ?? step.job.stateSince ?? ""

/** Whether a step is through: it ended, or was aborted while it ran. */
const through = (step: Step) => step.job.state === "Ended" || step.job.state === "Aborted"

function stateOfSteps(steps: ReadonlyArray<Step>): { state: OrderState; at: Step } {
  const working = steps.find((one) => one.job.state === "Running" || one.job.state === "Interrupted")
  if (working) return { state: working.job.state === "Running" ? "running" : "interrupted", at: working }
  // A step of a state the page does not know is not through: it waits, as its step is drawn.
  const next = steps.find((one) => !through(one))
  if (next) return { state: "waiting", at: next }
  const last = steps[steps.length - 1]!
  return { state: last.job.state === "Aborted" ? "aborted" : "ended", at: last }
}

/** Orders that need someone first: held up, then working, waiting, through. */
const urgency: Record<OrderState, number> = { interrupted: 0, aborted: 1, running: 2, waiting: 3, ended: 4 }

/** The orders of the job orders of the machines, in the order of the machines. */
export function ordersOf(machines: ReadonlyArray<string>, jobs: FloorPage["jobs"]): ReadonlyArray<Order> {
  const byKey = new Map<string, { number: string | null; label: string; steps: Array<Step> }>()
  for (const machine of machines) {
    for (const { job, result } of jobsWithResults(jobs[machine])) {
      const number = job.orderNumbers[0] ?? null
      // Without an order number, a job order is an order of its own: by machine, as job orders are numbered.
      const key = number === null ? `job:${machine}:${job.jobOrderId}` : `order:${number}`
      const group = byKey.get(key) ?? { number, label: number ?? job.jobOrderId, steps: [] }
      group.steps.push({ machine, job, result })
      byKey.set(key, group)
    }
  }
  return [...byKey.entries()]
    .map(([key, { number, label, steps }]) => {
      // Started ones by their start; those still waiting after them.
      const sorted = [...steps].sort((a, b) => Number(!a.result) - Number(!b.result) || begun(a).localeCompare(begun(b)))
      return { key, number, label, jobName: sorted[0]!.job.jobName, steps: sorted, ...stateOfSteps(sorted) }
    })
    .sort((a, b) => urgency[a.state] - urgency[b.state] || a.label.localeCompare(b.label))
}

/**
 * The places of the shop floor besides the machines: steps of an order that publish nothing yet.
 * They stand on the map so the path of an order reads from its start to its end.
 */
export const conceptStations = {
  program: { id: "concept:program", name: "Programming", missing: "The CAM system publishes nothing yet: no sheet, no position." },
  pack: { id: "concept:pack", name: "Packing", missing: "Packing publishes nothing yet: no box, no pallet, no shipping." },
} as const

export const TILE_WIDTH = 150
export const TILE_HEIGHT = 128
const GAP_X = 40
const GAP_Y = 48
const ROWS = 3

export type Place = { id: string; x: number; y: number }

/**
 * Where each tile stands: programming at the left, the machines in columns of three in the order
 * the backend listed them, packing at the right. The machines stand in no flow: the stack knows
 * none. The flow is the path of an order, drawn when one is chosen.
 */
export function layout(machines: ReadonlyArray<string>): { places: ReadonlyArray<Place>; width: number; height: number } {
  const rows = Math.min(ROWS, Math.max(1, machines.length))
  const columns = Math.max(1, Math.ceil(machines.length / ROWS))
  const middle = ((rows - 1) * (TILE_HEIGHT + GAP_Y)) / 2
  const column = (index: number) => index * (TILE_WIDTH + GAP_X)
  const places: Array<Place> = [
    { id: conceptStations.program.id, x: 0, y: middle },
    ...machines.map((id, index) => ({
      id,
      x: column(1 + Math.floor(index / ROWS)),
      y: (index % ROWS) * (TILE_HEIGHT + GAP_Y),
    })),
    { id: conceptStations.pack.id, x: column(columns + 1), y: middle },
  ]
  // The last row keeps its gap below: the markers stand there, and a line may run under them.
  return { places, width: column(columns + 2) - GAP_X, height: rows * (TILE_HEIGHT + GAP_Y) }
}

/** A straight piece of a line: horizontal from `a` to `b` at height `c`, or vertical at `a` from `b` to `c`. */
export type Segment = readonly ["h" | "v", number, number, number]

const horizontal = (a: number, b: number, at: number): Segment => ["h", Math.min(a, b), Math.max(a, b), at]
const vertical = (at: number, a: number, b: number): Segment => ["v", at, Math.min(a, b), Math.max(a, b)]

/** How far below a tile the lane of the lines runs: under the markers, in the gap to the next row. */
const LANE = TILE_HEIGHT + GAP_Y - 8

/**
 * The line from one tile to the next, at right angles and only through the gaps, so it crosses no
 * other tile: out of the right edge of the first into the gap of its column, down or up to the lane
 * under the row of the next, along it to the gap beside the next, and into it. A next tile further
 * right is entered from its left, one in the same column or further left from its right. Two steps
 * in a row on the same tile need no line.
 */
export function connector(from: Place, to: Place): ReadonlyArray<Segment> {
  if (from.id === to.id) return []
  const fromY = from.y + TILE_HEIGHT / 2
  const toY = to.y + TILE_HEIGHT / 2
  const right = from.x + TILE_WIDTH
  const out = right + GAP_X / 2
  const forward = to.x > from.x
  const edge = forward ? to.x : to.x + TILE_WIDTH
  const beside = forward ? to.x - GAP_X / 2 : edge + GAP_X / 2
  if (out === beside) return [horizontal(right, out, fromY), vertical(out, fromY, toY), horizontal(out, edge, toY)]
  const lane = to.y + LANE
  return [
    horizontal(right, out, fromY),
    vertical(out, fromY, lane),
    horizontal(out, beside, lane),
    vertical(beside, lane, toY),
    horizontal(beside, edge, toY),
  ]
}

/** The tiles an order passes, programming and packing included. */
export function pathOf(order: Order): ReadonlyArray<string> {
  return [conceptStations.program.id, ...order.steps.map((one) => one.machine), conceptStations.pack.id]
}

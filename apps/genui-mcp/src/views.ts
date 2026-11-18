import type { Block, BlockRequest, Measure, Unit, ViewShow } from "@pleiades/cards/view/contract.ts"

import { readFirstAndLast, readMessageStats, readRaised } from "./apis.ts"
import type { Apis } from "./apis.ts"
import { listMachines, showMachine } from "./machines.ts"
import { shopfloorOf } from "./shopfloor.ts"
import { secondsBefore } from "./time.ts"

// A view: the blocks a language model laid out, with their values computed here. The model says
// what to show; every number of a view is read and computed from the stored values in this file.

const DEFAULT_HOURS = 24

/** The topic of the energy a machine took from the grid since it was built: a counter in joule. */
/** The categories of NE 107 that are warnings, not failures. */
const WARNINGS = ["CheckFunction", "OffSpec", "MaintenanceRequired"] as const

const energyTopic = (machine: string) => `machines/${machine}/umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp`

const measures: Record<Measure, { label: string; unit: Unit; source: string }> = {
  errors: {
    label: "Errors",
    unit: "count",
    source: "Events API: the failures raised, /alerts/pairs",
  },
  warnings: {
    label: "Warnings",
    unit: "count",
    source: "Events API: the other alerts raised, /alerts/pairs",
  },
  "running-share": {
    label: "Running",
    unit: "one",
    source: "Timeseries API: machines/{SerialNumber}/umati/State/MachineryItemState and the rules of the machine card, over the time the machine gave data",
  },
  energy: {
    label: "Energy",
    unit: "joule",
    source: "Timeseries API: machines/{SerialNumber}/umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp",
  },
}

/** What a measure adds up to for one machine: a value, or for running-share a part of a whole. */
type Amount = { value: number; of: number } | null


async function amountOf(apis: Apis, measure: Measure, machine: string, hours: number, now: Date): Promise<Amount> {
  const from = secondsBefore(now, hours * 3600)
  switch (measure) {
    case "errors":
      return { value: (await readRaised(apis, "Failure", machine, from, now)).length, of: 1 }
    case "warnings":
      // Every category of NE 107 but a failure is a warning (levelOf in apis.ts).
      const counts = await Promise.all(WARNINGS.map(async (severity) => (await readRaised(apis, severity, machine, from, now)).length))
      return { value: counts.reduce((sum, one) => sum + one, 0), of: 1 }
    case "running-share": {
      // The share of the time the machine gave data: while it was silent, nobody knows whether it ran.
      const { history } = await showMachine(apis, machine, hours, now)
      const known = history.totals.filter((one) => one.state !== "no-data").reduce((sum, one) => sum + one.seconds, 0)
      const running = history.totals.find((one) => one.state === "running")?.seconds ?? 0
      return known > 0 ? { value: running, of: known } : null
    }
    case "energy": {
      // A counter: what it went up by between its oldest and its newest value in the window.
      const ends = await readFirstAndLast(apis, energyTopic(machine), from, now)
      return ends ? { value: ends.last - ends.first, of: 1 } : null
    }
  }
}

/** The value of a measure from the amounts of the machines: a sum, or for running-share a share. */
export function valueOf(measure: Measure, amounts: ReadonlyArray<Amount>): number | null {
  const known = amounts.filter((one): one is NonNullable<Amount> => one !== null)
  if (known.length === 0) return null
  const value = known.reduce((sum, one) => sum + one.value, 0)
  if (measure !== "running-share") return value
  const of = known.reduce((sum, one) => sum + one.of, 0)
  return of > 0 ? value / of : null
}

function spanOf(hours: number, now: Date) {
  return { from: secondsBefore(now, hours * 3600).toISOString(), to: now.toISOString() }
}

async function blockOf(apis: Apis, request: BlockRequest, machines: ReadonlyArray<string>, now: Date): Promise<Block> {
  switch (request.type) {
    case "kpi": {
      const hours = request.hours ?? DEFAULT_HOURS
      const about = request.machine === undefined ? machines : [request.machine]
      const amounts = await Promise.all(about.map((one) => amountOf(apis, request.measure, one, hours, now)))
      const { label, unit, source } = measures[request.measure]
      return {
        type: "kpi",
        label: request.label ?? `${label}${request.machine ? ` · ${request.machine}` : ""}`,
        measure: request.measure,
        machine: request.machine ?? null,
        value: valueOf(request.measure, amounts),
        unit,
        ...spanOf(hours, now),
        source,
      }
    }
    case "ranking": {
      const hours = request.hours ?? DEFAULT_HOURS
      const values = await Promise.all(
        machines.map(async (one) => ({ machine: one, value: valueOf(request.measure, [await amountOf(apis, request.measure, one, hours, now)]) })),
      )
      // The largest first, a machine without a value last.
      values.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
      const { label, unit, source } = measures[request.measure]
      return { type: "ranking", title: request.title ?? `${label} by machine`, measure: request.measure, unit, items: values, ...spanOf(hours, now), source }
    }
    case "causes": {
      const hours = request.hours ?? DEFAULT_HOURS
      const stats = await readMessageStats(apis, secondsBefore(now, hours * 3600), now, request.machine)
      const items = stats.slice(0, 5).map(({ title, level, count, seconds }) => ({ title, level, count, seconds }))
      return {
        type: "causes",
        title: request.title ?? `Most frequent faults${request.machine ? ` · ${request.machine}` : ""}`,
        machine: request.machine ?? null,
        items,
        ...spanOf(hours, now),
        source: "Events API: /alerts/pairs, counted by error code",
      }
    }
    case "hall": {
      const shopfloor = shopfloorOf(await listMachines(apis, now))
      return { type: "hall", title: request.title ?? shopfloor.hall.name, highlight: request.highlight ?? [], shopfloor }
    }
    case "note":
      return { type: "note", text: request.text, tone: request.tone ?? "info" }
    case "gaps":
      return { type: "gaps", title: request.title ?? "What I have, and what is missing", have: request.have, missing: request.missing }
  }
}

/** The view a language model laid out, with every value read and computed here. */
export async function showView(apis: Apis, title: string, requests: ReadonlyArray<BlockRequest>, now = new Date()): Promise<ViewShow> {
  const { machines } = await listMachines(apis, now)
  const serials = machines.map((one) => one.machine)
  const blocks = await Promise.all(requests.map((request) => blockOf(apis, request, serials, now)))
  return { title, asOf: now.toISOString(), blocks }
}

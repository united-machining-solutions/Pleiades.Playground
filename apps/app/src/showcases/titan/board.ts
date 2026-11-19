import type { Machine, MachineList, State } from "@pleiades/cards/machine/contract.ts"
import { clock } from "@pleiades/cards/machine/format.ts"
import { openError, openWarning, stateOf } from "@pleiades/cards/machine/state.ts"
import { tell } from "@pleiades/cards/machine/tell.ts"

import { inGerman } from "./words.ts"
import { serialOf } from "./words.ts"

// The board of Titan: what the person who runs the hall needs, in the order of a good brief.
//
// 1. The headline: how many machines produce, in one line, with the counts of the states.
// 2. Where to act: only the machines that need someone, the most urgent first, each with the
//    problem, what it costs (the job order and since when), and the next step.
// 3. As planned: the machines that produce or are being set up, one line each.
//
// The board is computed from the values of the machines, never by a language model, so its figures
// are always right and always in the same place. What needs judgement, a problem in plain words and
// the next step, the model adds to a machine by its serial number (facts.ts); without it, the board
// still says what the machine reports.

/** What the model adds to a machine: the problem in plain words, and the next step. */
export type Advice = { problem?: string; step?: string }

export type Issue = {
  /** The serial number, as people call the machine: P-04. */
  name: string
  /** Its model, as a quieter word beside the name: AX-400. */
  model: string | null
  state: State
  /** What is the matter: the words of the model, or what the machine reports. */
  problem: string
  /** The code of the alert, if there is one: Fehler 31002. */
  code: string | null
  since: string | null
  /** What the standstill costs: the job order that waits, and how far it got. */
  impact: string | null
  step: string | null
}

export type Planned = { name: string; model: string | null; state: State; line: string }

export type Board = {
  asOf: string
  total: number
  producing: number
  counts: Record<State, number>
  issues: Array<Issue>
  planned: Array<Planned>
}

/** States that need someone: an error, a stop without a plan, a machine without data. */
const NEEDS_ACTION: ReadonlyArray<State> = ["alarm", "stopped", "no-data"]

/** The order of urgency. */
const URGENCY: Record<State, number> = { alarm: 0, stopped: 1, "no-data": 2, setup: 3, running: 4 }

/** A job order in words: "Auftrag 4711/01 unterbrochen, 5 von 12 Teilen". */
export function jobInWords(jobOrder: Machine["jobOrder"]): string | null {
  if (!jobOrder) return null
  const parts =
    jobOrder.producedQuantity === null
      ? ""
      : jobOrder.runsPlanned
        ? `, ${jobOrder.producedQuantity} von ${jobOrder.runsPlanned} Teilen`
        : `, ${jobOrder.producedQuantity} Teile`
  const interrupted = jobOrder.state === "Interrupted" ? " unterbrochen" : ""
  return `Auftrag ${jobOrder.jobOrderId}${interrupted}${parts}`
}

function codeOf(machine: Machine, state: State): string | null {
  if (state === "alarm") {
    const error = openError(machine)
    return error ? `Fehler ${error.notificationId}` : null
  }
  if (state === "stopped") {
    const warning = openWarning(machine)
    return warning ? `Warnung ${warning.notificationId}` : null
  }
  return null
}

const reported: Record<State, (machine: Machine, told: string) => string> = {
  alarm: (_, told) => told,
  stopped: (machine, told) => (openWarning(machine) ? told : "Kein Grund erfasst"),
  "no-data": () => "Keine Daten vom Adapter",
  setup: () => "Wird eingerichtet",
  running: () => "Produziert",
}

/** The board from the list of machines and the advice of the model, by serial number. */
export function boardOf(list: MachineList, advice: ReadonlyMap<string, Advice> = new Map()): Board {
  const counts: Record<State, number> = { alarm: 0, stopped: 0, "no-data": 0, setup: 0, running: 0 }
  const issues: Array<Issue & { order: number }> = []
  const planned: Array<Planned> = []
  for (const machine of list.machines) {
    const state = stateOf(machine, list.asOf)
    counts[state] += 1
    const name = serialOf(machine.machine)
    const model = machine.identity.model
    const job = jobInWords(machine.jobOrder)
    if (NEEDS_ACTION.includes(state)) {
      const told = tell(machine, state)
      const given = advice.get(name) ?? {}
      issues.push({
        name,
        model,
        state,
        problem: given.problem ?? reported[state](machine, told.message),
        code: codeOf(machine, state),
        since: told.since,
        impact: job,
        step: given.step ?? null,
        order: URGENCY[state] * 1e15 + (told.since ? Date.parse(told.since) : 0),
      })
    } else {
      const program = machine.program.value
      planned.push({ name, model, state, line: [state === "setup" ? "Wird eingerichtet" : program, job].filter(Boolean).join(" · ") })
    }
  }
  return {
    asOf: list.asOf,
    total: list.machines.length,
    producing: counts.running,
    counts,
    // The most urgent first; of equal urgency, the one that stands longest.
    issues: issues.sort((a, b) => a.order - b.order).map(({ order: _, ...issue }) => issue),
    planned: planned.sort((a, b) => URGENCY[a.state] - URGENCY[b.state] || a.name.localeCompare(b.name)),
  }
}

/** The headline of the board, in one line: what the person sees first. */
export function headlineOf(board: Board): string {
  if (board.total === 0) return "Keine Maschine meldet sich"
  const down = board.issues.length
  if (down === 0) return board.counts.setup > 0 ? `Keine Störung, ${board.counts.setup} wird eingerichtet` : "Alle Maschinen produzieren"
  if (down === 1) return `1 von ${board.total} Maschinen braucht dich`
  return `${down} von ${board.total} Maschinen brauchen dich`
}

/** How long since an instant, in minutes or hours: "15 min", "2 h 5 min". */
export function sinceInWords(since: string | null, asOf: string): string | null {
  if (!since) return null
  const minutes = Math.max(0, Math.round((Date.parse(asOf) - Date.parse(since)) / 60_000))
  if (minutes < 1) return "gerade eben"
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** The first sentence of the answer is its headline; what follows explains it, smaller. */
export function splitHeadline(summary: string): [string, string] {
  // A sentence ends at its mark; a colon also ends the headline: what follows it explains.
  const end = /[.!?…](?=\s+\p{Lu})|:(?=\s+\p{L})/u.exec(summary)
  if (!end) return [summary.trim(), ""]
  const headline = summary.slice(0, end.index).trim() + (end[0] === ":" ? "." : end[0])
  return [headline, summary.slice(end.index + 1).trim()]
}

/** The states in words, as an operator says them. */
export const stateWord: Record<State, string> = {
  alarm: "Störung",
  stopped: "Steht",
  "no-data": "Keine Daten",
  setup: "Wird eingerichtet",
  running: "Produziert",
}

/** One fact of a machine, as the focus shows it: a label, the value, and a quieter line. */
export type KeyFact = { label: string; value: string; detail?: string }

/** The few facts of one machine that an answer about it needs, from the values. */
export type MachineFacts = { name: string; state: State; facts: Array<KeyFact> }

/**
 * The key facts of a machine, by its serial number: its state and since when, the error or warning
 * it reports, and the job order it works on. Undefined for a machine the list does not have.
 */
export function keyFactsOf(list: MachineList, name: string): MachineFacts | undefined {
  const machine = list.machines.find((one) => serialOf(one.machine) === name)
  if (!machine) return undefined
  const state = stateOf(machine, list.asOf)
  const told = tell(machine, state)
  const facts: Array<KeyFact> = []
  const lasting = sinceInWords(told.since, list.asOf)
  facts.push({
    label: "Zustand",
    value: stateWord[state],
    detail: told.since ? `seit ${clock(told.since)}${lasting ? ` · ${lasting}` : ""}` : undefined,
  })
  // What the person needs is the cause in words and how far the job got; a code and a number of a
  // job order only identify them, so they stand small beneath.
  const error = openError(machine)
  const warning = openWarning(machine)
  const cause = state === "running" || state === "setup" ? "Warnung" : "Ursache"
  if (error) facts.push({ label: cause, value: inGerman(error.title), detail: `Fehler ${error.notificationId}` })
  else if (warning) facts.push({ label: cause, value: inGerman(warning.title), detail: `Warnung ${warning.notificationId}` })
  else if (state === "stopped") facts.push({ label: cause, value: "Nicht erfasst", detail: "Die Maschine meldet keinen Grund" })
  const { jobOrder } = machine
  if (jobOrder) {
    const progress =
      jobOrder.producedQuantity === null
        ? undefined
        : jobOrder.runsPlanned
          ? `${jobOrder.producedQuantity} von ${jobOrder.runsPlanned} Teilen`
          : `${jobOrder.producedQuantity} Teile`
    const detail = [`Auftrag ${jobOrder.jobOrderId}`, jobOrder.state === "Interrupted" ? "unterbrochen" : undefined].filter(Boolean).join(" · ")
    facts.push({ label: "Auftrag", value: progress ?? jobOrder.jobOrderId, detail: progress ? detail : undefined })
  }
  return { name, state, facts }
}

/** The serial numbers an answer names, in the order it names them: P-04, M-02. */
export function machinesNamed(text: string): Array<string> {
  return [...new Set([...text.matchAll(/\b([A-Z]{1,4})[-‑](\d{1,4})\b/g)].map((match) => `${match[1]}-${match[2]}`))]
}

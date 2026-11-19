import type { MachineList, State } from "@pleiades/cards/machine/contract.ts"
import { openWarning, stateOf } from "@pleiades/cards/machine/state.ts"

import { boardOf } from "./board.ts"
import { inGerman } from "./words.ts"
import { serialOf } from "./words.ts"

// The escalation of Titan: what stands beside every answer, once Titan was started. Two levels and
// nothing else, so it is read at a glance:
//
// - Stillstand (red): a machine that does not produce and needs someone: an error, a stop without a
//   plan, a machine without data.
// - Vorbeugen (amber): a machine that still produces but reports a warning: something to do so that
//   it does not fail.
//
// Each line is one machine with what it reports, in a few German words, and how long. The details
// come when the person asks.

export type Escalation = {
  /** The serial number: P-07. */
  name: string
  state: State
  /** What is the matter, in a few words: what the machine reports. */
  what: string
  since: string | null
}

export type Escalations = {
  asOf: string
  stops: Array<Escalation>
  risks: Array<Escalation>
  /** How many machines run without anything to do. */
  fine: number
}

/** The escalation from the list of machines. */
export function escalationsOf(list: MachineList): Escalations {
  const stops = boardOf(list).issues.map(({ name, state, problem, since }) => ({ name, state, what: inGerman(problem), since }))
  const risks: Array<Escalation> = []
  let fine = 0
  for (const machine of list.machines) {
    const state = stateOf(machine, list.asOf)
    if (state !== "running" && state !== "setup") continue
    const warning = openWarning(machine)
    if (!warning) {
      fine += 1
      continue
    }
    risks.push({ name: serialOf(machine.machine), state, what: inGerman(warning.title), since: warning.raisedAt })
  }
  risks.sort((a, b) => (a.since ?? "").localeCompare(b.since ?? "") || a.name.localeCompare(b.name))
  return { asOf: list.asOf, stops, risks, fine }
}

import type { SiteList, UnplacedMachine } from "@pleiades/cards/site/contract.ts"
import { modelOf } from "@pleiades/cards/site/in-words.ts"

import { placementOf, problemOfId } from "./placing.ts"

// The machines that send values and stand on no site, as Home names them: a few by what they are,
// then how many more. They are no rows of the list; they come to a site from the bar above it.

/** How many machines a bar or a line names before it says how many more there are. */
export const NAMED = 3

/** A few machines by what they are, and how many more: "TP-800 P-07, Laser2D L-01, Punch PU-01 +2". */
export function namesInWords(names: ReadonlyArray<string>, named = NAMED): string {
  const shown = names.slice(0, named).join(", ")
  return names.length > named ? `${shown} +${names.length - named}` : shown
}

/** What the machines on no site are, in the order of the backend. */
export function namesOf(unplaced: ReadonlyArray<UnplacedMachine>): Array<string> {
  return unplaced.map((one) => modelOf(one))
}

/** The bar above the list: how many machines send and stand on no site, and a few of them by name. */
export function unplacedInWords(unplaced: ReadonlyArray<UnplacedMachine>): { title: string; names: string } {
  const count = unplaced.length
  const title =
    count === 1 ? "1 machine sends data but is not on a site yet:" : `${count} machines send data but are not on a site yet:`
  return { title, names: namesInWords(namesOf(unplaced)) }
}

/**
 * A machine id a person typed, against the list Home has: one that stands on a site already, one
 * that sends and stands on none, one the stack has heard nothing from, or one that is no id.
 */
export type TypedMachine =
  | { kind: "invalid"; problem: string }
  | { kind: "placed"; siteName: string }
  | { kind: "sending"; machine: UnplacedMachine }
  | { kind: "unknown" }

export function typedMachineOf(list: SiteList, typed: string): TypedMachine {
  const problem = problemOfId(typed, "machine id")
  if (problem) return { kind: "invalid", problem }
  const placed = placementOf(list, typed)
  if (placed) return { kind: "placed", siteName: placed.siteName }
  const sending = list.unplaced.find((one) => one.machine === typed)
  return sending ? { kind: "sending", machine: sending } : { kind: "unknown" }
}

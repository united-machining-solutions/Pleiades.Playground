import type { SiteList, UnplacedMachine } from "@pleiades/cards/site/contract.ts"
import { modelOf } from "@pleiades/cards/site/in-words.ts"

import { placementOf, problemOfId } from "./placing.ts"

// The machines that sent values in the last 24 hours and stand on no site, as Home names them: a few
// by what they are, then how many more. They are no rows of the list; they come to a site from the bar
// above it. Some of them may have fallen silent since, so the words say "sent", not "send".

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

/** The bar above the list: how many machines sent data and stand on no site, and a few of them by name. */
export function unplacedInWords(unplaced: ReadonlyArray<UnplacedMachine>): { title: string; names: string } {
  const count = unplaced.length
  const title =
    count === 1
      ? "1 machine sent data in the last 24 hours but is not on a site yet:"
      : `${count} machines sent data in the last 24 hours but are not on a site yet:`
  return { title, names: namesInWords(namesOf(unplaced)) }
}

/** The line of Home while the sites cannot be read: why, and a few of the machines that sent data. */
export function unreadableInWords(unplaced: ReadonlyArray<UnplacedMachine>): string {
  const why = "The sites cannot be read now: the Sites API did not answer."
  if (unplaced.length === 0) return why
  const count = unplaced.length === 1 ? "1 machine" : `${unplaced.length} machines`
  return `${why} ${count} sent data in the last 24 hours: ${namesInWords(namesOf(unplaced))}.`
}

/**
 * The line under the title: the machines on the sites, how many of them send data now and how many
 * need someone, as the backend counted them.
 */
export function headInWords(list: Pick<SiteList, "machineCount" | "sites" | "sending" | "needsYou">): string {
  const machines = list.machineCount === 1 ? "1 machine" : `${list.machineCount} machines`
  const sites = list.sites.length === 1 ? "1 site" : `${list.sites.length} sites`
  const sending = `${list.sending} ${list.sending === 1 ? "sends" : "send"} data now`
  const needs = `${list.needsYou} ${list.needsYou === 1 ? "needs" : "need"} you`
  return `${machines} at ${sites} · ${sending} · ${needs}`
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

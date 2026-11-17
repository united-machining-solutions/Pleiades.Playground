import type { MachineList, State } from "@pleiades/cards/machine/contract.ts"
import { stateLabel, stateOf } from "@pleiades/cards/machine/state.ts"

/** The hours of history the page of a machine offers. The backend takes 1 to 24; the page offers three. */
export const HOURS = [1, 8, 24] as const
export type Hours = (typeof HOURS)[number]

/**
 * The `hours` of the address as the page offers it, or nothing: an address that carries anything
 * else, such as `?hours=3` or `?hours=many`, shows the history of the backend's own default.
 */
export function hoursOf(raw: unknown): Hours | undefined {
  return HOURS.find((hours) => hours === Number(raw))
}

/** How many whole hours lie between two instants: what the history a card was read for covers. */
export function hoursBetween(from: string, to: string): Hours | undefined {
  return hoursOf(Math.round((Date.parse(to) - Date.parse(from)) / 3_600_000))
}

/** One entry of the machine switcher: a machine and what it does now. */
export type Choice = { machine: string; state: State }

/** The machines of the list, in the order the backend gave them, each with its state. */
export function choicesOf({ asOf, machines }: MachineList): Array<Choice> {
  return machines.map((machine) => ({ machine: machine.machine, state: stateOf(machine, asOf) }))
}

/**
 * Whether a choice answers what was typed. Case does not matter, and every word must be found in
 * the serial number or in the name of the state: "p 0" finds P-04, "alarm" every machine in alarm.
 */
export function matches(choice: Choice, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const text = `${choice.machine} ${stateLabel[choice.state]}`.toLowerCase()
  return words.every((word) => text.includes(word))
}

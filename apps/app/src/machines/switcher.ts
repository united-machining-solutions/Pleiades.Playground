import type { MachineList, State } from "@pleiades/cards/machine/contract.ts"
import { titleOf } from "@pleiades/cards/machine/in-words.ts"
import { stateLabel, stateOf } from "@pleiades/cards/machine/state.ts"

/** The hours of history the page of a machine offers. The backend takes 1 to 24; the page offers three. */
export const HOURS = [1, 8, 24] as const
export type Hours = (typeof HOURS)[number]

/**
 * The `hours` of the address as the page offers it, or nothing: an address that carries anything
 * else, such as `?hours=3` or `?hours=many`, is the default: see `chosenHours`.
 */
export function hoursOf(raw: unknown): Hours | undefined {
  return HOURS.find((hours) => hours === Number(raw))
}

/** How far back the history goes if the address says nothing valid. */
export const DEFAULT_HOURS: Hours = 8

/**
 * The hours the page shows: the length of the history, which the window rolls along to now. Only
 * the length is chosen, it comes from the address and from nothing the card has read.
 */
export function chosenHours(raw: unknown): Hours {
  return hoursOf(raw) ?? DEFAULT_HOURS
}

/** One entry of the machine switcher: a machine by its id, what it is called and what it does now. */
export type Choice = { machine: string; title: string; state: State }

/** The machines of the list, in the order the backend gave them, each with its state. */
export function choicesOf({ asOf, machines }: MachineList): Array<Choice> {
  return machines.map((machine) => ({ machine: machine.machine, title: titleOf(machine), state: stateOf(machine, asOf) }))
}

/**
 * Whether a choice answers what was typed. Case does not matter, and every word must be found in
 * the title, the machine id or the name of the state: "p 0" finds P-04, "alcyone" the machines of
 * that manufacturer, "alarm" every machine in alarm.
 */
export function matches(choice: Choice, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const text = `${choice.title} ${choice.machine} ${stateLabel[choice.state]}`.toLowerCase()
  return words.every((word) => text.includes(word))
}

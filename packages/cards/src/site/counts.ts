import type { State } from "../machine/contract.ts"
import { NEEDS_YOU, stateOrder } from "../machine/state.ts"
import type { StateCount } from "./contract.ts"

/**
 * How many machines are in each state, in the order a display reads the states, without a state no
 * machine is in. The backend counts the sites with it, and a page that keeps them live counts again
 * with the same rule.
 */
export function countsOf(states: ReadonlyArray<State>): Array<StateCount> {
  return stateOrder.flatMap((state) => {
    const machines = states.filter((one) => one === state).length
    return machines > 0 ? [{ state, machines }] : []
  })
}

/** How many machines send values now: every one that is not without data. */
export function sendingOf(states: ReadonlyArray<State>): number {
  return states.filter((one) => one !== "no-data").length
}

/** How many machines need someone: in alarm, stopped or without data, as "Needs you" chooses them. */
export function needsYouOf(states: ReadonlyArray<State>): number {
  return states.filter((one) => NEEDS_YOU.includes(one)).length
}

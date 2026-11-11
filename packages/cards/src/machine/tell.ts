import type { Machine } from "./contract.ts"
import { clock } from "./format.ts"
import { openError, openWarning } from "./state.ts"
import type { State } from "./state.ts"

// What is the matter with a machine, in words. A list and a card say the same about a machine.

export type Told = {
  /** What is the matter, and the quieter line below it. */
  message: string
  detail: string
  since: string | null
  /** The state began before the values that were read: "since" is only the earliest time known. */
  atLeast: boolean
}

export function tell(machine: Machine, state: State): Told {
  const { itemState, operationMode, program } = machine
  const warning = openWarning(machine)
  switch (state) {
    case "alarm": {
      const error = openError(machine)
      return {
        message: error?.title ?? "Error",
        detail: `Error ${error?.notificationId ?? ""}`.trim(),
        since: error?.raisedAt ?? null,
        atLeast: false,
      }
    }
    case "stopped":
      return {
        message: warning?.title ?? "No alarm, no reason recorded",
        detail: warning ? `Warning ${warning.notificationId}` : `${itemState.value ?? "No state"}, as the control reports`,
        since: itemState.since,
        atLeast: itemState.sinceIsLowerBound,
      }
    case "no-data":
      return {
        message: "No data from the adapter",
        detail:
          itemState.value && itemState.at
            ? `Last known: ${itemState.value} at ${clock(itemState.at)}`
            : "Nothing known about this machine",
        since: machine.lastValueAt,
        atLeast: false,
      }
    case "setup":
      return {
        message: "Setup mode",
        detail: "Operation mode, as the control reports",
        since: operationMode.since,
        atLeast: operationMode.sinceIsLowerBound,
      }
    case "running":
      return {
        message: program.value ?? "No program",
        detail: warning ? `Warning: ${warning.title}` : "",
        since: itemState.since,
        atLeast: itemState.sinceIsLowerBound,
      }
  }
}

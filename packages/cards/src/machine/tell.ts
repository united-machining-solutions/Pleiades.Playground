import type { Machine, State } from "./contract.ts"
import { clock } from "./format.ts"
import { openError, openWarning } from "./state.ts"

// What is the matter with a machine, in words. A list and a card say the same about a machine.

export type Told = {
  /** What is the matter, and the quieter line below it. */
  message: string
  detail: string
  /** The quieter line only says what the control itself reports, because nothing else explains the state. */
  reported: boolean
  since: string | null
  /** The state began before the values that were read: "since" is only the earliest time known. */
  atLeast: boolean
}

/** `time` writes an instant as a time of day: the clock of the browser, unless the caller has another. */
export function tell(machine: Machine, state: State, time: (instant: string) => string = clock): Told {
  const { connection, itemState, operationMode, program } = machine
  const warning = openWarning(machine)
  switch (state) {
    case "alarm": {
      const error = openError(machine)
      return {
        message: error?.title ?? "Error",
        detail: `Error ${error?.notificationId ?? ""}`.trim(),
        reported: false,
        since: error?.raisedAt ?? null,
        atLeast: false,
      }
    }
    case "stopped":
      return {
        message: warning?.title ?? "No alarm, no reason recorded",
        detail: warning ? `Warning ${warning.notificationId}` : `${itemState.value ?? "No state"}, as the control reports`,
        reported: !warning,
        since: itemState.since,
        atLeast: itemState.sinceIsLowerBound,
      }
    case "no-data": {
      const lastKnown =
        itemState.value && itemState.at ? `Last known: ${itemState.value} at ${time(itemState.at)}` : "Nothing known about this machine"
      // An adapter that is there and says it is not Running (it starts, does not reach the machine or
      // stops) has no data since it said so, however often it repeats it. One that says nothing, or
      // said Running last, is silent since its last sign of life.
      if (connection.value !== null && connection.value !== "Running") {
        return {
          message: "No data from the adapter",
          detail: `The adapter says ${connection.value}. ${lastKnown}`,
          reported: false,
          since: connection.since,
          atLeast: connection.sinceIsLowerBound,
        }
      }
      return { message: "No data from the adapter", detail: lastKnown, reported: false, since: machine.lastValueAt, atLeast: false }
    }
    case "setup":
      return {
        message: "Setup mode",
        detail: "Operation mode, as the control reports",
        reported: true,
        since: operationMode.since,
        atLeast: operationMode.sinceIsLowerBound,
      }
    case "running":
      return {
        message: program.value ?? "No work master",
        detail: warning ? `Warning: ${warning.title}` : "",
        reported: false,
        since: itemState.since,
        atLeast: itemState.sinceIsLowerBound,
      }
  }
}

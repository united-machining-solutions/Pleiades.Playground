import type { Machine, MachineList } from "@pleiades/cards/machine/contract.ts"
import { written } from "@pleiades/cards/machine/format.ts"
import { openError, openWarning, stateOf } from "@pleiades/cards/machine/state.ts"
import { tell } from "@pleiades/cards/machine/tell.ts"
import type { Place, Reason, ShopfloorShow, Station } from "@pleiades/cards/shopfloor/contract.ts"

import { hallPlan, placesOf } from "./hall.ts"

// The shop floor: the hall, every machine of the list at its place, whether it runs, and why not.
// Which values are which state is decided in the card catalogue (state.ts), and the words of a
// reason are those of the machine card (tell.ts), so the hall and the machine card never say two
// things. Where a machine stands comes from the plan of the hall (hall.ts).

/** Where the reason of a machine that does not run comes from. */
function reasonTopic(machine: Machine, state: Station["state"]): string {
  switch (state) {
    case "alarm":
      return openError(machine)?.topic ?? machine.itemState.topic
    case "stopped":
      return openWarning(machine)?.topic ?? machine.itemState.topic
    case "no-data":
      return machine.connection.topic
    case "setup":
      return machine.operationMode.topic
    case "running":
      return machine.itemState.topic
  }
}

export function stationOf(machine: Machine, asOf: string, place: Place): Station {
  const state = stateOf(machine, asOf)
  const running = state === "running"
  let reason: Reason | null = null
  if (!running) {
    const { message, detail, since, atLeast } = tell(machine, state, written)
    reason = { message, detail, since, atLeast, topic: reasonTopic(machine, state) }
  }
  return {
    machine: machine.machine,
    state,
    running,
    reason,
    // Without data the program would be the last known one, not the present.
    program: state === "no-data" ? null : machine.program.value,
    place,
    topics: [machine.connection.topic, machine.heartbeat.topic, machine.itemState.topic, machine.operationMode.topic],
  }
}

/** The shop floor from the list of machines, in the order of the list, on the plan of the hall. */
export function shopfloorOf({ asOf, machines }: MachineList): ShopfloorShow {
  const places = placesOf(machines.map((one) => one.machine))
  const stations = machines.map((machine) => stationOf(machine, asOf, places.get(machine.machine)!))
  return { asOf, hall: hallPlan(), machines: stations, notRunning: stations.filter((one) => !one.running).length }
}

import { energyShow } from "@pleiades/cards/energy/contract.ts"
import type { EnergyShow } from "@pleiades/cards/energy/contract.ts"

import { jsonOf } from "../../chat/tool-results.ts"

// The values of the energy card in the result of a tool call, as a chat has it. They are checked
// against the contract: what does not keep it is not drawn.

/** The energy in the result of `genui_energy_show`, checked against the contract of the card. */
export function energyShowOf(content: unknown): EnergyShow | null {
  const shown = energyShow.safeParse(jsonOf(content))
  return shown.success ? shown.data : null
}

/**
 * The machines of a card as one text, so that an effect sees a change of them and not a new list
 * with the same machines.
 */
export function machinesKey(machines: ReadonlyArray<string>): string {
  // A machine id never contains `/`: the MQTT binding forbids it, a comma it allows.
  return machines.join("/")
}

/** The machines of a key again. */
export function machinesOf(key: string): Array<string> {
  return key === "" ? [] : key.split("/")
}

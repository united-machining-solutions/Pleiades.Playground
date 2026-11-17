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

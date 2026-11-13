import { machineList, machineShow } from "@pleiades/cards/machine/contract.ts"
import type { MachineList, MachineShow } from "@pleiades/cards/machine/contract.ts"

import { jsonOf } from "../chat/tool-results.ts"

// The values of the machine card in the result of a tool call, as a chat has it. Each is checked
// against its contract: what does not keep it is not drawn.

/** The machines in the result of `genui_machine_list`, checked against the contract of the list. */
export function machineListOf(content: unknown): MachineList | null {
  const list = machineList.safeParse(jsonOf(content))
  return list.success ? list.data : null
}

/** The values of the machine card in the result of `genui_machine_show`, checked against its contract. */
export function machineShowOf(content: unknown): MachineShow | null {
  const shown = machineShow.safeParse(jsonOf(content))
  return shown.success ? shown.data : null
}

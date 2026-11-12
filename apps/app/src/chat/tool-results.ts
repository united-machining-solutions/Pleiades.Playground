import { machineList, machineShow } from "@pleiades/cards/machine/contract.ts"
import type { MachineList, MachineShow } from "@pleiades/cards/machine/contract.ts"

// What the app shows for the result of a tool call. The result reaches the chat as text; the
// tools of the generative UI backend write their values as JSON into it.

type ToolLabel = { running: string; done: string; failed: string }

/**
 * What a tool call is called in the chat while it runs, after it has finished and when it failed.
 * A title says the state in words, so it does not hang on colour and motion alone.
 */
const toolLabels: Record<string, ToolLabel> = {
  genui_machine_list: {
    running: "Reading the machines",
    done: "Read the machines",
    failed: "Failed to read the machines",
  },
  genui_machine_show: {
    running: "Reading the machine",
    done: "Read the machine",
    failed: "Failed to read the machine",
  },
  genui_describe_server: {
    running: "Looking at the backend",
    done: "Looked at the backend",
    failed: "Failed to look at the backend",
  },
  genui_get_skill_guide: {
    running: "Reading the guide of the backend",
    done: "Read the guide of the backend",
    failed: "Failed to read the guide of the backend",
  },
}

/** The words for a tool call, also for a tool the chat has none of its own for. */
export function toolLabel(name: string): ToolLabel {
  return toolLabels[name] ?? { running: `Running ${name}`, done: `Ran ${name}`, failed: `Failed to run ${name}` }
}

function jsonOf(content: unknown): unknown {
  if (typeof content !== "string") return null
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

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

import type { MachineList } from "@pleiades/genui-mcp"

// What the app shows for the result of a tool call. The result reaches the chat as text; the
// tools of the generative UI backend write their values as JSON into it.

/** What a tool call is called in the chat while it runs and after it has finished. */
export const toolLabels: Record<string, { running: string; done: string }> = {
  genui_machine_list: { running: "Reading the machines", done: "Read the machines" },
  genui_describe_server: { running: "Looking at the backend", done: "Looked at the backend" },
  genui_get_skill_guide: { running: "Reading the guide of the backend", done: "Read the guide of the backend" },
}

/** The machines in the result of `genui_machine_list`, or null if the text is something else. */
export function machineListOf(content: unknown): MachineList | null {
  if (typeof content !== "string") return null
  try {
    const value: unknown = JSON.parse(content)
    if (typeof value !== "object" || value === null) return null
    const list = value as Partial<MachineList>
    return typeof list.asOf === "string" && Array.isArray(list.machines) ? (list as MachineList) : null
  } catch {
    return null
  }
}

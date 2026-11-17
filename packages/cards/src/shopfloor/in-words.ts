import { duration, written } from "../machine/format.ts"
import { stateLabel } from "../machine/state.ts"
import type { ShopfloorShow, Station } from "./contract.ts"

// The shop floor in words: what the card shows, for a reader that does not see it. A language model
// reads these lines as the result of the tool. Every time stands as the result writes it.

function stationInWords({ machine, state, reason }: Station, asOf: string): string {
  if (reason === null) return `${machine}: ${stateLabel[state]}.`
  const since = reason.since
    ? ` since ${reason.atLeast ? "before " : ""}${written(reason.since)}, ${reason.atLeast ? "at least " : ""}${duration(reason.since, asOf)}`
    : ""
  const detail = reason.detail ? ` (${reason.detail})` : ""
  return `${machine}: ${stateLabel[state]}${since}. ${reason.message}${detail}.`
}

export function shopfloorShowInWords({ asOf, machines, notRunning }: ShopfloorShow): string {
  if (machines.length === 0) return "No machine published a value in the last 24 hours."
  const running = machines.length - notRunning
  const head =
    notRunning === 0
      ? `All ${machines.length} machines run.`
      : `${running} of ${machines.length} machines run, ${notRunning} ${notRunning === 1 ? "does" : "do"} not.`
  const notRunningLines = machines.filter((one) => !one.running).map((one) => stationInWords(one, asOf))
  const runningNames = machines.filter((one) => one.running).map((one) => one.machine)
  const lines = [head, ...notRunningLines]
  if (runningNames.length > 0 && notRunning > 0) lines.push(`Running: ${runningNames.join(", ")}.`)
  lines.push(`Read at ${written(asOf)}.`)
  return lines.join("\n")
}

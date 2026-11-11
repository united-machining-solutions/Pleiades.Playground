import type { Machine, MachineList, MachineShow, SpanList } from "./contract.ts"
import { duration, lasting, written } from "./format.ts"
import { openWarning, stateLabel, stateOf } from "./state.ts"
import { tell } from "./tell.ts"
import type { Told } from "./tell.ts"

// A result in words: what a list or a card shows, for a reader that does not see it. A language
// model reads these sentences as the result of a tool, and a host without cards shows them. They
// are the words of the card, from the same rules, and every time stands as the result writes it.

function sinceWhen({ since, atLeast }: Told, asOf: string): string {
  if (!since) return ""
  return ` since ${atLeast ? "before " : ""}${written(since)}, ${atLeast ? "at least " : ""}${duration(since, asOf)}`
}

/** What one machine does now, in a line. */
export function machineInWords(machine: Machine, asOf: string): string {
  const state = stateOf(machine, asOf)
  const told = tell(machine, state, written)
  const warning = openWarning(machine)
  const sentences = [`${machine.machine}: ${stateLabel[state]}${sinceWhen(told, asOf)}`]
  // A running machine has nothing the matter: its program follows.
  if (state !== "running") sentences.push(told.detail ? `${told.message} (${told.detail})` : told.message)
  else if (warning) sentences.push(`Warning: ${warning.title}`)
  // Without data the program would be the last known one, not the present.
  if (state !== "no-data" && machine.program.value) sentences.push(`Program ${machine.program.value}`)
  return `${sentences.join(". ")}.`
}

/** What a machine did over the hours before, in a line: how long each state lasted in total. */
function historyInWords({ from, to, totals }: MachineShow["history"]): string {
  const hours = Math.round((Date.parse(to) - Date.parse(from)) / 3_600_000)
  const sums = totals.map(({ state, seconds }) => `${stateLabel[state].toLowerCase()} ${lasting(seconds * 1000)}`)
  return `${hours <= 1 ? "Last hour" : `Last ${hours} hours`}, ${written(from)} to ${written(to)}: ${sums.join(", ")}.`
}

/** The machine card in words. */
export function machineShowInWords({ machine, asOf, history }: MachineShow): string {
  return [machineInWords(machine, asOf), historyInWords(history), `Read at ${written(asOf)}.`].join("\n")
}

/**
 * The spans of a band in words. They are for a display: a reader of words has the sums of the
 * card, so this says only what the list is.
 */
export function spanListInWords({ machine, from, to, spans }: SpanList): string {
  const count = `${spans.length} ${spans.length === 1 ? "span" : "spans"}`
  return `${count} of ${machine}, ${written(from)} to ${written(to)}, for the band of the machine card. How long each state lasted in total is in the result of genui_machine_show.`
}

/** The list of machines in words: a line for each machine. */
export function machineListInWords({ machines, asOf }: MachineList): string {
  if (machines.length === 0) return "No machine published a value in the last 24 hours."
  return [...machines.map((machine) => machineInWords(machine, asOf)), `Read at ${written(asOf)}.`].join("\n")
}

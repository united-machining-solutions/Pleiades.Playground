import { written } from "../machine/format.ts"
import { labelOf, titleOf } from "../machine/in-words.ts"
import { stateLabel } from "../machine/state.ts"
import type { PlacedMachine, Site, SiteList, StateCount } from "./contract.ts"

// The site card in words, for a reader that does not see it: a line for each site, and one for
// the machines that stand on no site. A language model reads these sentences as the result.

/** "2 running, 1 stopped". */
export function countsInWords(counts: ReadonlyArray<StateCount>): string {
  return counts.map(({ state, machines }) => `${machines} ${stateLabel[state].toLowerCase()}`).join(", ")
}

/** "3 machines", "1 machine". */
export function machinesInWords(count: number): string {
  return `${count} ${count === 1 ? "machine" : "machines"}`
}

/** What a machine is, by its model and serial number: from its identification, or from its machine id. */
export function modelOf({ machine, now }: Pick<PlacedMachine, "machine" | "now">): string {
  return now ? titleOf(now) : labelOf(machine)
}

/** The title of a machine on a site: the name people know it by, or what it is. */
export function titleOfPlaced(placed: Pick<PlacedMachine, "machine" | "displayName" | "now">): string {
  return placed.displayName || modelOf(placed)
}

/** A machine on a site in words: its title, and its machine id, by which a tool asks for it. */
function placedInWords(placed: PlacedMachine): string {
  return `${titleOfPlaced(placed)} (${placed.machine})`
}

function siteInWords(site: Site): string {
  const head = `${site.name}, ${site.company} (site ${site.siteId}): ${machinesInWords(site.machineCount)}`
  if (site.halls.length === 0) return `${head}, no hall.`
  // Every hall is named, one without a machine too: a reader asks which halls a site has, and which is free.
  const halls = site.halls.map((hall) => {
    const machines = hall.machines.map((one) => `${placedInWords(one)} ${stateLabel[one.state].toLowerCase()}`).join(", ")
    return `${hall.name ?? "No hall"}: ${machines || "no machine"}`
  })
  const counts = site.machineCount === 0 ? "" : `, ${countsInWords(site.counts)}`
  return `${head}${counts}. ${halls.join(". ")}.`
}

/** The site card in words. */
export function siteListInWords(list: SiteList): string {
  const lines =
    list.sites.length === 0
      ? ["No site is entered in the Sites API yet."]
      : [
          `${machinesInWords(list.machineCount)} on ${list.sites.length} ${list.sites.length === 1 ? "site" : "sites"}${list.machineCount > 0 ? `: ${countsInWords(list.counts)}` : ""}.`,
          ...list.sites.map(siteInWords),
        ]
  if (list.unplaced.length > 0) {
    const machines = list.unplaced.map((one) => `${labelOf(one.machine)} (${one.machine}) ${stateLabel[one.state].toLowerCase()}`).join(", ")
    lines.push(`Sent values in the last 24 hours and stand on no site: ${machines}.`)
  }
  lines.push(`Read at ${written(list.asOf)}.`)
  return lines.join("\n")
}

import { siteList } from "@pleiades/cards/site/contract.ts"
import { siteListInWords } from "@pleiades/cards/site/in-words.ts"
import { toolDefinition } from "@tanstack/ai"
import { z } from "zod"

import { card } from "../card.ts"
import { listSites } from "../sites.ts"
import { inTimeZoneOf, knownTimeZone } from "../time.ts"
import { inWords, readOnly, timeZone } from "../tool.ts"
import type { Context } from "../tool.ts"

// The site card: where the machines stand, what each does now, how many on each site are in each
// state, and the machines that send values and stand on no site. What computes it is in sites.ts.

/** The site card as a file for other hosts. */
export const SITE_CARD_URI = "ui://genui/site"

const shownAsCard =
  "Where the host shows MCP Apps, the person already sees this result as the site card: every site with its halls and machines, and the machines on no site. Then a sentence or two is the whole answer. Do not list the machines again."

const siteListTool = toolDefinition({
  name: "genui_site_list",
  description:
    "List every site with the machines that stand on it, hall by hall, what each of them does now, and how many on each site are in each state. Also the machines that sent values in the last 24 hours and stand on no site. The sites and where a machine stands are what people entered in the Sites API. Use it for a question about where machines stand, or about the machines of a site, plant or hall.",
  inputSchema: z.object({ timeZone }),
  outputSchema: siteList,
  metadata: { title: "List sites", annotations: readOnly, _meta: { ui: { resourceUri: SITE_CARD_URI } } },
}).server<Context>(async (input, ctx) => {
  const zone = knownTimeZone(input.timeZone)
  const list = inTimeZoneOf(await listSites(ctx.context.apis), zone)
  return inWords(list, `${siteListInWords(list)}\n\n${shownAsCard}`)
})

const siteGuide = `## Sites

\`genui_site_list\` lists every site with the machines on it. A site is a plant of a company with its
halls; people enter the sites, and which machine stands where, in the Sites API. No machine sends it.

- \`sites\`: every site by site id, with \`machineCount\` and \`counts\`, how many of its machines are
  in each state now. Its \`halls\` come in the order of the site, a hall without machines too; the
  machines in no hall follow under a hall whose \`name\` is null.
- Each machine has its \`state\` and, in \`now\`, what it does as \`genui_machine_list\` says it. \`now\`
  is null if it published no value in the last 24 hours: then it has no data.
- \`machineCount\` and \`counts\` at the top are all sites together.
- \`unplaced\`: the machines that published a value in the last 24 hours and stand on no site. They
  can be put on one; only a person can, in the Sites API, not a tool of this server.

The counts come from this server. Do not count again, and do not add states up.
`

export const siteCard = card({
  tools: [siteListTool],
  describes: [
    "- genui_site_list: every site of the Sites API with its machines by hall and state, and the machines on no site.",
  ],
  guide: siteGuide,
  file: { name: "site", uri: SITE_CARD_URI },
})

import { shopfloorShow } from "@pleiades/cards/shopfloor/contract.ts"
import { shopfloorShowInWords } from "@pleiades/cards/shopfloor/in-words.ts"
import { toolDefinition } from "@tanstack/ai"
import { z } from "zod"

import { card } from "../card.ts"
import { listMachines } from "../machines.ts"
import { shopfloorOf } from "../shopfloor.ts"
import { inTimeZoneOf, knownTimeZone } from "../time.ts"
import { inWords, readOnly, timeZone } from "../tool.ts"
import type { Context } from "../tool.ts"

// The shop floor card: every machine of the hall at a glance, the ones that run greyed out, and over
// each one that does not, why. What computes it is in shopfloor.ts.

const SHOPFLOOR_CARD_URI = "ui://genui/shopfloor"

/** What a language model is told with the words of the card: who sees what, and what is left to say. */
const shownAsCard =
  "Where the host shows MCP Apps, the person already sees this result as the shop floor card: every machine of the hall, the running ones greyed out, and over each machine that does not run its reason. Then a sentence or two is the whole answer. Do not list the machines again. For one machine, genui_machine_show shows its card."

const shopfloorShowTool = toolDefinition({
  name: "genui_shopfloor_show",
  description:
    "Show the shop floor: every machine of the hall, whether it runs now, and for each one that does not, why (the open error, a warning, setup, or no data). Use it for a question like \"which machine is not running?\" or \"show me the hall\". The result says it in words and carries the values of the shop floor card. For one machine in detail, use genui_machine_show.",
  inputSchema: z.object({ timeZone }),
  outputSchema: shopfloorShow,
  // The link to the card: a host that shows MCP Apps loads that resource and draws the result with it.
  metadata: { title: "Show shop floor", annotations: readOnly, _meta: { ui: { resourceUri: SHOPFLOOR_CARD_URI } } },
}).server<Context>(async (input, ctx) => {
  const zone = knownTimeZone(input.timeZone)
  const shown = shopfloorOf(inTimeZoneOf(await listMachines(ctx.context.apis), zone))
  return inWords(shown, `${shopfloorShowInWords(shown)}\n\n${shownAsCard}`)
})

const shopfloorGuide = `## The shop floor

\`genui_shopfloor_show\` shows every machine of the hall at once: its \`state\`, whether it is
\`running\`, and for a machine that does not run its \`reason\`, in the words of the machine card,
with the \`topic\` it comes from. \`notRunning\` counts the machines that do not run. Take it from
there, and do not count yourself. The state is decided as for \`genui_machine_list\`.

Do not derive a reason the data does not give: a machine that stands without an open notification
says "No alarm, no reason recorded". For details of one machine, call \`genui_machine_show\`.`

export const shopfloorCard = card({
  tools: [shopfloorShowTool],
  describes: ["- genui_shopfloor_show: every machine of the hall, whether it runs, and why not."],
  guide: shopfloorGuide,
  file: { name: "shopfloor", uri: SHOPFLOOR_CARD_URI },
})

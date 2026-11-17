import { blockRequest, viewShow } from "@pleiades/cards/view/contract.ts"
import { viewShowInWords } from "@pleiades/cards/view/in-words.ts"
import { toolDefinition } from "@tanstack/ai"
import { z } from "zod"

import { card } from "../card.ts"
import { inTimeZoneOf, knownTimeZone } from "../time.ts"
import { inWords, readOnly, timeZone } from "../tool.ts"
import type { Context } from "../tool.ts"
import { showView } from "../views.ts"

// The view card: an answer a language model lays out itself, from blocks. The model says what to
// show; every value is computed in views.ts.

const VIEW_CARD_URI = "ui://genui/view"

const shownAsCard =
  "Where the host shows MCP Apps, the person already sees this view. Then a sentence or two is the whole answer: say what matters most in it, and do not read every value out."

const viewShowTool = toolDefinition({
  name: "genui_view_show",
  description: [
    "Lay out a view for the person: a title and one to six blocks, in the order they are shown. Use it whenever a picture answers better than words: to compare machines, to show how often something happened, to show the hall, or to show what the data can and cannot answer.",
    "You choose the blocks; the values are read and computed by this server. Never put a number into a title, a label or a note.",
    "Blocks: kpi (one figure), ranking (every machine as a bar), causes (the most frequent warnings and errors), hall (the plan of the hall, with machines to mark), note (a short remark or next step), gaps (what there is, what is missing, and where it could come from).",
    "Measures for kpi and ranking: errors and warnings (how often raised), running-share (the share of the time a machine ran), energy (taken from the grid).",
  ].join(" "),
  inputSchema: z.object({
    title: z.string().describe("The title of the view, in the language of the person, for example Faults today."),
    blocks: z.array(blockRequest).min(1).max(6),
    timeZone,
  }),
  outputSchema: viewShow,
  metadata: { title: "Show view", annotations: readOnly, _meta: { ui: { resourceUri: VIEW_CARD_URI } } },
}).server<Context>(async (input, ctx) => {
  const zone = knownTimeZone(input.timeZone)
  const shown = inTimeZoneOf(await showView(ctx.context.apis, input.title, input.blocks), zone)
  return inWords(shown, `${viewShowInWords(shown)}\n\n${shownAsCard}`)
})

const viewGuide = `## Views

\`genui_view_show\` lets you lay out an answer yourself: a \`title\` and one to six \`blocks\`. You
choose what to show and in which order; the server reads and computes every value, and says where it
comes from. So a view never shows a number you wrote: put none into a title, a label or a note.

- \`kpi\`: one figure, of a \`measure\` for one \`machine\` or the whole hall, over \`hours\` (24 if omitted).
- \`ranking\`: every machine with the measure as a bar, the largest first.
- \`causes\`: the warnings and errors that occurred most often, for one machine or all.
- \`hall\`: the plan of the hall; \`highlight\` marks the machines a question is about.
- \`note\`: one or two sentences: a conclusion, a suggestion, a next step.
- \`gaps\`: for a question the stored values cannot answer, for example about costs: \`have\` lists what
  they can tell, \`missing\` what is needed and its \`source\`, for example the ERP system or the
  production planning.

Measures: \`errors\` and \`warnings\` count how often they were raised; \`running-share\` is the share of
the time a machine ran; \`energy\` is what it took from the grid, in joule.

A good view answers one question: two or three blocks are often enough. Start with the block that
answers it, and end with a note when there is a next step.`

export const viewCard = card({
  tools: [viewShowTool],
  describes: ["- genui_view_show: a view you lay out yourself from blocks; the server computes every value."],
  guide: viewGuide,
  file: { name: "view", uri: VIEW_CARD_URI },
})

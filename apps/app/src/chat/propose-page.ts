import { toolDefinition } from "@tanstack/ai"
import { z } from "zod"

import { PROPOSE_PAGE_TOOL, pageToolNames, proposePage } from "../pages/proposal.ts"
import { MAX_PARTS, MAX_TITLE_LENGTH } from "../pages/recipe.ts"
import type { ChatTool } from "./tool-results.ts"

// The one tool of the app itself that the language model gets: it proposes a page. It runs on the
// server of the app, in the harness of the chat (assistant.server.ts), calls nothing and keeps
// nothing. It checks what the model sent against the chat's list of tools and the schema of a recipe,
// and gives back what is left; the chat draws that as a proposal, and the person keeps it or not.

/**
 * The tool, with the tools a page can call read from `tools`, the chat's list (cards.tsx): a new card
 * is offered without another line here. The schema is loose where the check is strict, so that one
 * wrong part does not refuse the others and every refusal comes back in words the model can act on.
 */
export function proposePageTool(tools: ReadonlyArray<ChatTool>) {
  const names = pageToolNames(tools).join(", ")
  return toolDefinition({
    name: PROPOSE_PAGE_TOOL,
    description: `Propose a page that the person can keep: a title, and the parts of the page in their order. A part is a tool whose card the page shows, with its arguments. The page keeps no value: each time it is opened, the app calls the tools again. A page can hold the cards of ${names}. Call those tools first, and take every argument, a machine id above all, from what they returned. The chat shows the person the page you propose, with a way to look at it and to keep it; you cannot keep it yourself. The result is the page as the app checked it, and each part it left out with the reason.`,
    inputSchema: z.object({
      title: z
        .string()
        .describe(`The title of the page: a few words that say what it shows, at most ${MAX_TITLE_LENGTH} characters.`),
      parts: z
        .array(
          z.object({
            tool: z.string().describe(`The tool whose card the part shows, one of ${names}.`),
            args: z
              .record(z.string(), z.unknown())
              .optional()
              .describe(
                "The arguments of that tool, as you called it. No timeZone: the app adds the one of the person who opens the page.",
              ),
          }),
        )
        .min(1)
        .describe(`The parts of the page in the order it shows them, at most ${MAX_PARTS}.`),
    }),
  }).server((input) => proposePage(input, tools))
}

import type { SiteList } from "@pleiades/cards/site/contract.ts"
import { toolDefinition } from "@tanstack/ai"
import { z } from "zod"

import { MAX_MACHINES, PROPOSE_PLACEMENT_TOOL, changesNothing, checkPlacement, placementInWords } from "../placement/proposal.ts"
import type { PlacementInput, PlacementResult } from "../placement/proposal.ts"
import { MAX_TEXT, placeInWords } from "../sites/placing.ts"

// The second tool of the app itself (ADR-0026): the language model proposes where machines go, or a site
// or a hall to create. It runs on the server of the app, in the harness of the chat, reads the list of the
// sites and writes nothing. The chat draws the proposal as a card; only its button writes.

/** Reads the list of the sites, as Home reads it; throws the sentence of why it cannot. */
export type ReadSites = () => Promise<SiteList>

/**
 * Checks a proposal against the list of the sites and gives back what the model sent, the check, and the
 * words the model passes on. Throws, with the reason, where there is nothing to propose: neither a machine
 * nor a site, the sites cannot be read, or the proposal changes nothing. A proposal without a site is drawn
 * with the place left for the person to choose.
 */
export async function proposePlacement(input: PlacementInput, read: ReadSites): Promise<PlacementResult> {
  const named = (input.machines ?? []).some((one) => typeof one !== "string" || one.trim() !== "")
  if (!named && !input.site?.trim()) {
    throw new Error("A proposal names machines, a site, or both. Ask the person which machine goes where.")
  }
  const list = await read()
  if (list.sitesError !== null) throw new Error(`The sites cannot be read now: ${list.sitesError} Nothing can be placed until they can.`)
  const check = checkPlacement(input, list)
  if (changesNothing(check) && check.site !== null) {
    const where = placeInWords(check.site.name, check.hall?.name ?? null)
    const stand = check.machines.length > 0 ? `, and every machine named stands there already` : ""
    throw new Error(`Nothing to change: ${where} is there${stand}. Propose nothing; tell the person.`)
  }
  return { input, check, summary: placementInWords(check) }
}

/** The tool. `read` is how the server of the app reads the sites (assistant.server.ts). */
export function proposePlacementTool(read: ReadSites) {
  return toolDefinition({
    name: PROPOSE_PLACEMENT_TOOL,
    description:
      "Propose where machines go: a site, and a hall of it or none; or a site or a hall to create, without machines. Call it at once with what the person said: the app checks it against the sites and shows the person a card that asks for what is missing, step by step (which machine, where), and writes only when the person confirms. Do not ask in words first. Pass each machine as the person named it; never another machine in its place. The result is the proposal as the app checked it, and `summary`, a sentence to pass on.",
    inputSchema: z.object({
      machines: z
        .array(
          z.union([
            z.string().max(200).describe("A machine as the person named it, for example MFP 20, P-07 or an id."),
            z
              .object({
                name: z.string().max(MAX_TEXT).optional().describe("The machine as the person named it, whole, for example MFP 20 or Laser 2D L1."),
                manufacturer: z.string().max(MAX_TEXT).optional().describe("Its manufacturer, if the person said it."),
                model: z.string().max(MAX_TEXT).optional().describe("Its model, if the person said it."),
                serialNumber: z.string().max(MAX_TEXT).optional().describe("Its serial number, if the person said it."),
              })
              .describe("A machine with what the person said it is: the app makes its id of manufacturer, model and serial number."),
          ]),
        )
        .max(MAX_MACHINES)
        .default([])
        .describe("The machines, as the person named them. Empty to create only a site or a hall."),
      site: z
        .string()
        .max(MAX_TEXT)
        .optional()
        .describe("The site as the person said it. Leave it out where the person said none: the card asks."),
      hall: z
        .string()
        .max(MAX_TEXT)
        .optional()
        .describe("The hall: one of the site, or a new one as the person said it. Leave it out for no hall."),
      displayName: z
        .string()
        .max(MAX_TEXT)
        .optional()
        .describe("Only with exactly one machine, and only if the person named it: the name people know it by."),
      company: z
        .string()
        .max(MAX_TEXT)
        .optional()
        .describe("Only for a new site, and only if the person named the company. Otherwise leave it out."),
    }),
  }).server((input) => proposePlacement(input, read))
}

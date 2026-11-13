import type { AnyServerTool } from "@tanstack/ai"

// What a card brings to this server. A card is one module under cards/, and cards/index.ts lists
// them: the server, its description and its guide are put together from that list, so a new card
// changes nothing else here.

export type Card<TTools extends ReadonlyArray<AnyServerTool> = ReadonlyArray<AnyServerTool>> = {
  /** The tools of the card, in the order the description of the server lists them. */
  tools: TTools
  /** One line for each tool, for the description of the server (`genui_describe_server`). */
  describes: ReadonlyArray<string>
  /** The sections of the skill guide about the card, as markdown, each from its `## ` heading on. */
  guide: string
  /**
   * The card as a file for other hosts, if it has one: `name` is the page under ui/ that the build
   * writes (`ui/<name>.html`), `uri` what a tool of the card links.
   */
  file?: { name: string; uri: string }
}

/** A card. The types of its tools are kept, so an application that imports the server knows them. */
export function card<const TTools extends ReadonlyArray<AnyServerTool>>(given: Card<TTools>): Card<TTools> {
  return given
}

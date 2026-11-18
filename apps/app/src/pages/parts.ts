import type { ChatTool } from "../chat/tool-results.ts"

// Which tools a page calls. A page draws a part with the card the chat draws for that tool, so it
// calls only a tool for which the chat has a card: an entry of the chat's list with a `draw`. A
// tool that only a card calls is not one, nor is a tool without a card, such as the guide of the
// backend. The server of the app holds to the same list, because a recipe can come from a link.

/** The entry of the chat that draws the answer of a tool, or undefined if the app has none for it. */
export function drawingTool(name: string, tools: ReadonlyArray<ChatTool>): ChatTool | undefined {
  return tools.find((tool) => tool.name === name && tool.draw !== undefined && !tool.cardOnly)
}

/** Why a part has no answer when the app has no card for its tool. */
export function noCardFor(tool: string): string {
  return `It asks for ${tool}, and this app has no card for that tool.`
}

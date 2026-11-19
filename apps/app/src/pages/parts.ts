import type { ChatTool } from "../chat/tool-results.ts"

// Which tools a page calls. A page draws a part with the card the chat draws for that tool, so it
// calls only a tool for which the chat has a card: an entry of the chat's list with a `draw`. A
// tool that only a card calls is not one, nor is a tool without a card, such as the guide of the
// backend, nor a tool the chat draws and a page does not hold (`saveAsPage: false`): a source
// reference, the proposal of a page, a card whose tool reaches out or is one step of a flow. The
// server of the app holds to the same list, because a recipe can come from a link, and calls a tool
// only where its server says that it only reads (ADR-0025).

/** The entry of the chat that draws the answer of a tool, or undefined if the app has none for it. */
export function drawingTool(name: string, tools: ReadonlyArray<ChatTool>): ChatTool | undefined {
  return tools.find((tool) => tool.name === name && tool.draw !== undefined && !tool.cardOnly && tool.saveAsPage !== false)
}

/** Why a part has no answer when the app has no card for its tool. */
export function noCardFor(tool: string): string {
  return `It asks for ${tool}, and this app has no card for that tool.`
}

/** A tool as a server lists it, as far as a page reads it: what the server says the tool does. */
export type ListedTool = { metadata?: { mcp?: { annotations?: { readOnlyHint?: boolean } } } }

/**
 * Whether the server of a tool says that it only reads (MCP: `readOnlyHint`). A page calls its tools each time
 * it is opened, and again while a part waits: a tool that starts, orders or changes something would do it
 * every time. A tool that the server does not mark is taken as one that changes something.
 */
export function readsOnly(listed: ListedTool): boolean {
  return listed.metadata?.mcp?.annotations?.readOnlyHint === true
}

/** Why a part has no answer when the server of its tool does not say that it only reads. */
export function notReading(tool: string, who: string): string {
  return `${tool} can change something, as ${who} lists it, and a page calls only a tool that reads: it calls it each time it is opened.`
}

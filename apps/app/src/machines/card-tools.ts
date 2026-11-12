// The tools of the generative UI backend that a card calls and a language model does not. The
// backend marks them (MCP Apps: `visibility`), and a host that shows MCP Apps leaves them out of
// what its model gets. The client library of the chat hands a tool on without that mark, so the
// app names them here. This file imports nothing: the chat and the pages both read it.

/** The spans of the band of a machine card. The app asks for them itself, see get-machines.ts. */
export const SPAN_LIST_TOOL = "genui_span_list"

const cardOnly: ReadonlyArray<string> = [SPAN_LIST_TOOL]

/** The tools a language model gets: all but the ones only a card calls. */
export function forModel<TTool extends { name: string }>(tools: ReadonlyArray<TTool>): Array<TTool> {
  return tools.filter((tool) => !cardOnly.includes(tool.name))
}

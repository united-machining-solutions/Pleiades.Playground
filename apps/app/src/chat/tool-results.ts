import type { ReactNode } from "react"

// What the app knows about a tool of the generative UI backend, or of the app itself: what a call
// is called in the chat, what the chat draws for its result, whether a language model gets the tool
// at all, and whether a page can hold it. A card says this for its tools in a module of its own, and
// cards.tsx lists the cards. This file imports nothing but a type: the chat, its server and the
// tests all read it.

export type ToolLabel = { running: string; done: string; failed: string }

export type ChatTool = {
  /** The name of the tool, as the backend lists it. */
  name: string
  /**
   * What a call is called in the chat while it runs, after it has finished and when it failed. A
   * title says the state in words, so it does not hang on colour and motion alone.
   */
  label?: ToolLabel
  /**
   * What the chat draws for a result of the tool: a card, a list. Null if the result does not keep
   * the contract. For a tool without it the chat draws nothing, and the answer is the model's.
   * `call` is the call the result answers, where the chat has it; a page has none.
   */
  draw?: (content: unknown, call?: { id: string }) => ReactNode | null
  /**
   * Only a card calls this tool, so the chat keeps it from its language model. The backend marks
   * such a tool (MCP Apps: `visibility`), and a host that shows MCP Apps leaves it out of what
   * its model gets. The client library of the chat hands a tool on without that mark, so the app
   * says it here.
   */
  cardOnly?: boolean
  /** A verified documentation card replaces prose and intermediate source renderings. */
  replacesAnswer?: boolean
  /**
   * A language model also calls this tool on its way to an answer, to look up what there is, such as
   * the machines and their ids. Its result is drawn only where the answer calls no other tool after
   * it: where it does, the result was a step, and its line among the steps opens to the card. While the
   * answer is still coming and nothing has followed the result yet, the card waits there too.
   */
  lookup?: boolean
  /**
   * Whether a drawn result can be replayed as a saved GenUI page. `false`: the chat draws it, and a
   * page never holds it as a part. Source references are such, the proposal of a page
   * (pages/proposal.ts), and a card whose tool reaches out or is one step of a flow, such as the scan
   * of an OPC UA server. A page asks the server that has the tool, each time it is opened, and only a
   * tool that reads (pages/call-part.ts, ADR-0025).
   */
  saveAsPage?: boolean
  /**
   * What a part of a page with this tool shows, in a few words. The chat names the parts of a page
   * it proposes with it; a tool without it is named by its name. "Add a card" on a page offers only a
   * tool with it: a person chooses a card by what it shows.
   */
  part?: string
}

/** The two tools of the backend itself, with which a language model finds its way. */
export const backendTools: ReadonlyArray<ChatTool> = [
  {
    name: "genui_describe_server",
    label: {
      running: "Looking at the backend",
      done: "Looked at the backend",
      failed: "Failed to look at the backend",
    },
  },
  {
    name: "genui_get_skill_guide",
    label: {
      running: "Reading the guide of the backend",
      done: "Read the guide of the backend",
      failed: "Failed to read the guide of the backend",
    },
  },
]

/** The words for a tool call, also for a tool the chat has none of its own for. */
export function toolLabel(name: string, tools: ReadonlyArray<ChatTool>): ToolLabel {
  return (
    tools.find((tool) => tool.name === name)?.label ?? {
      running: `Running ${name}`,
      done: `Ran ${name}`,
      failed: `Failed to run ${name}`,
    }
  )
}

/** The tools a language model gets: all but the ones only a card calls. */
export function forModel<TTool extends { name: string }>(
  listed: ReadonlyArray<TTool>,
  tools: ReadonlyArray<ChatTool>,
): Array<TTool> {
  return listed.filter((one) => !tools.some((tool) => tool.cardOnly && tool.name === one.name))
}

/**
 * The values a tool wrote. A result reaches the chat as text, and the tools of the generative UI
 * backend write their values as JSON into it. Null for anything else.
 */
export function jsonOf(content: unknown): unknown {
  if (typeof content !== "string") return null
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

// The commands of the chat field. A command is a short way to a question: the field turns it into
// the question before it is sent, so the language model reads a plain request, and a person who
// does not know the commands can ask in their own words. `/help` asks nothing: the field shows
// the commands itself.

/** The port of OPC UA (IANA): taken when the person names only a machine. */
export const DEFAULT_PORT = 4840

/**
 * The endpoint of what the person named. An address is taken as it is, without a slash at its end;
 * it may be a gateway that serves several machines. A machine alone, for example `A1121O0001`, is
 * its host name with the port of OPC UA. `assumed` says the latter: if it does not answer, the
 * person is asked for the endpoint instead of guessing another one.
 */
export function endpointOf(target: string): { url: string; assumed: boolean } {
  const trimmed = target.trim()
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return { url: trimmed.replace(/\/+$/, ""), assumed: false }
  return { url: `opc.tcp://${trimmed}:${DEFAULT_PORT}`, assumed: true }
}

export type ChatCommand = {
  /** What the person types, without the slash. */
  name: string
  /** What follows the name, as the help shows it. Absent for a command without an argument. */
  argument?: string
  /** The argument may be left out: the command is sent without it too. */
  optional?: boolean
  /** One sentence for the help. */
  summary: string
  /** Only when the OPC UA adapter is there. */
  opcua?: boolean
  /** The MCP server whose tool the command stands for (toolCommand). Absent for a command of the chat. */
  server?: string
  /** The question the command stands for. */
  question?: (argument: string) => string
}

export const commands: ReadonlyArray<ChatCommand> = [
  { name: "help", summary: "Show the commands and the tools." },
  {
    name: "machines",
    summary: "What every machine does now.",
    question: () => "Which machines are there, and what does each do now?",
  },
  {
    name: "warnings",
    summary: "The warnings and errors that are open.",
    question: () => "Which warnings and errors are open, and on which machines?",
  },
  {
    name: "opcua",
    opcua: true,
    summary: "The OPC UA servers that are added, with their endpoint and security.",
    question: () => "List the OPC UA servers that are added, with their endpoints.",
  },
  {
    name: "discover",
    argument: "machine or opc.tcp://host:port",
    opcua: true,
    summary: `Scan an OPC UA server and propose a registration for each machine it serves, also behind a gateway; a machine alone means opc.tcp://<machine>:${DEFAULT_PORT}. You add each with a button.`,
    question: (target) => {
      const endpoint = endpointOf(target)
      if (endpoint.assumed) {
        return (
          `Add the OPC UA server of the machine ${target}. Assume its endpoint is ${endpoint.url}. ` +
          `If that address does not answer, do not try another one: ask me for the endpoint. ` +
          `If it answers, scan it, match its nodes to the data model and propose its registration.`
        )
      }
      return (
        `Discover the OPC UA server at ${endpoint.url}. It may be a gateway that serves several machines: list its machines first. ` +
        `For each machine that is not added yet, scan it, match its nodes to the data model and propose its registration.`
      )
    },
  },
  {
    name: "mapping",
    argument: "serial number",
    opcua: true,
    summary: "The mapping of an added OPC UA machine: what is unclear, derived, mismatched or missing.",
    question: (serialNumber) => `Show the mapping of the OPC UA machine ${serialNumber}, what needs a look first.`,
  },
  {
    name: "rescan",
    argument: "serial number",
    opcua: true,
    summary: "Scan an added OPC UA server again, for example for new profiles, and show what would change.",
    question: (serialNumber) =>
      `Scan the OPC UA server of ${serialNumber} again and propose its registration anew, so I see what would change.`,
  },
]

/** The commands this chat offers: the OPC UA ones only where the adapter is there. */
export function commandsFor(opcua: boolean): ReadonlyArray<ChatCommand> {
  return commands.filter((command) => opcua || !command.opcua)
}

/**
 * A tool of an MCP server the chat has, as a command: `/genui_machine_show A1121O0001` asks the model to
 * answer with that tool, and what follows the name says what for. It is a request, not a call: the model
 * still fills in the arguments of the tool, so the command needs nothing after its name.
 */
export function toolCommand(server: string, tool: { name: string; summary: string }): ChatCommand {
  return {
    name: tool.name,
    argument: "what for",
    optional: true,
    server,
    summary: tool.summary === "" ? `A tool of ${server}.` : tool.summary,
    question: (argument) => (argument === "" ? `Use the tool ${tool.name}.` : `Use the tool ${tool.name}: ${argument}`),
  }
}

/** What the field does with what was typed. */
export type Typed =
  | { kind: "question"; text: string }
  | { kind: "help" }
  | { kind: "incomplete"; command: ChatCommand }
  | { kind: "unknown"; name: string }

/**
 * Reads what was typed. Text without a leading slash is a question as it is. A command with what it
 * needs becomes its question; one that misses its argument says so, and so does a name no command has.
 */
export function readTyped(text: string, offered: ReadonlyArray<ChatCommand>): Typed {
  const trimmed = text.trim()
  if (!trimmed.startsWith("/")) return { kind: "question", text: trimmed }
  const [head = "", ...rest] = trimmed.slice(1).split(/\s+/)
  const argument = rest.join(" ")
  const command = offered.find((one) => one.name.toLowerCase() === head.toLowerCase())
  if (!command) return { kind: "unknown", name: head }
  if (!command.question) return { kind: "help" }
  if (command.argument && !command.optional && argument === "") return { kind: "incomplete", command }
  return { kind: "question", text: command.question(argument) }
}

/**
 * The commands for what follows the slash, while the person is still typing it: first those whose name
 * begins with it, then those with a part of the name that does, so `/machine` finds `genui_machine_show`.
 */
export function matching(text: string, offered: ReadonlyArray<ChatCommand>): ReadonlyArray<ChatCommand> {
  if (!text.startsWith("/") || /\s/.test(text)) return []
  const begun = text.slice(1).toLowerCase()
  const name = (command: ChatCommand) => command.name.toLowerCase()
  const part = (command: ChatCommand) =>
    [...name(command).matchAll(/[_\-.:]/g)].some((separator) => name(command).startsWith(begun, separator.index + 1))
  return [
    ...offered.filter((command) => name(command).startsWith(begun)),
    ...offered.filter((command) => !name(command).startsWith(begun) && part(command)),
  ]
}

/**
 * What Tab writes into the field for the command that is marked in the list: its name and a space.
 * The space closes the list, and the cursor stands where an argument goes; Enter sends the command.
 */
export function completion(command: ChatCommand): string {
  return `/${command.name} `
}

/**
 * The command marked after an arrow key: `by` is +1 down and -1 up, and past the end of the list it
 * goes round to its other end, as in the lists of commands of other chats.
 */
export function stepped(marked: number, by: number, count: number): number {
  if (count === 0) return 0
  return (((marked + by) % count) + count) % count
}

/** How a command is written, for the help: `/mapping <serial number>`, and one that may go without it `[what for]`. */
export function usage(command: ChatCommand): string {
  if (!command.argument) return `/${command.name}`
  return command.optional ? `/${command.name} [${command.argument}]` : `/${command.name} <${command.argument}>`
}

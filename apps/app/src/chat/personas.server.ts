// Instructions a page adds to its own chats. The chat has one set of instructions, shared by every page
// (assistant.server.ts). A page that wants a voice of its own names a persona, and sends its name along
// with every question (extensions.ts); the server adds the instructions of that persona to the shared
// ones, after them. Who adds a persona is a module of the server that is loaded with its page, so a
// build without that page has none: a showcase adds its persona this way and changes nothing shared
// (docs/adr/0018-a-showcase-is-built-in-on-request-and-only-adds.md).

const personas = new Map<string, string>()

/** Adds the instructions of a persona, for the questions that name it. */
export function addPersona(name: string, instructions: string) {
  personas.set(name, instructions)
}

/** The instructions of the persona the browser named along with a question, if there is one by that name. */
export function personaInstructions(context: unknown): string | undefined {
  const name = (context as { persona?: unknown } | null | undefined)?.persona
  return typeof name === "string" ? personas.get(name) : undefined
}

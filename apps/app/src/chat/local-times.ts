// A person reads times as their own clock shows them. The browser sends its time zone along with a
// question, and the server adds it to the call of every tool that takes one. So the tools return
// local times, and the language model has nothing to convert and nothing to pass on.

/**
 * The time zone the browser sent along with a question. It is client data, so it counts only if
 * the runtime knows the name as a time zone.
 */
export function timeZoneOf(context: unknown): string | undefined {
  const sent = (context as { timeZone?: unknown } | null | undefined)?.timeZone
  if (typeof sent !== "string") return undefined
  try {
    new Intl.DateTimeFormat("en", { timeZone: sent })
    return sent
  } catch {
    return undefined
  }
}

/** Whether the input of a tool, a JSON schema, has a `timeZone`. */
function takesTimeZone(inputSchema: unknown): boolean {
  const properties = (inputSchema as { properties?: unknown } | null | undefined)?.properties
  return typeof properties === "object" && properties !== null && "timeZone" in properties
}

/**
 * The arguments of a tool call with the time zone of the person who asks. Undefined if there is
 * nothing to add: the tool takes no time zone, or the browser sent none.
 *
 * A time zone the language model named itself is replaced: the browser knows, the model guesses.
 */
export function withTimeZone(args: unknown, inputSchema: unknown, context: unknown): Record<string, unknown> | undefined {
  const timeZone = timeZoneOf(context)
  if (timeZone === undefined || !takesTimeZone(inputSchema)) return undefined
  return { ...(typeof args === "object" && args !== null ? args : {}), timeZone }
}

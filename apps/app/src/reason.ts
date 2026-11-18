// Why a request of the server of the app got no answer, in a few words for a sentence such as "The Sites
// API did not answer: <reason>." One function for every backend the app talks to.

/**
 * Why a request got no answer. The client and `fetch` each wrap what the network said, for example
 * ECONNREFUSED, in an error of their own: the innermost cause is the reason. A request that ran out of
 * time is a `TimeoutError`, whose numeric `code` (23, of the DOM) says nothing to a person.
 */
export function reasonOf(error: unknown): string {
  let innermost = error
  while (innermost instanceof Error && innermost.cause !== undefined) innermost = innermost.cause
  const { name, code, message } = (innermost ?? {}) as { name?: unknown; code?: unknown; message?: unknown }
  if (name === "TimeoutError") return "no answer in time"
  if (typeof code === "string" && code !== "") return code
  return String(message ?? innermost)
}

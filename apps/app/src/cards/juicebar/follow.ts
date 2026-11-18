// How the drink card calls the server of the app while it follows an order. A call can fail before it
// reaches that server, when the browser loses the network for a moment, as on the Wi-Fi of a fair: the
// server function then rejects instead of answering. The card takes that as a failed call, never as an end.

/** A call that did not reach the server of the app, so nobody knows what became of it. */
export type NotReached = { ok: false; reason: string; answered: false }

/** What a call of a server function got, or that it did not reach the server of the app. */
export async function reached<Answer>(call: Promise<Answer>): Promise<Answer | NotReached> {
  try {
    return await call
  } catch (error) {
    return { ok: false, reason: `The page did not reach the app: ${error instanceof Error ? error.message : String(error)}.`, answered: false }
  }
}

/**
 * Reads again and again, each read `every` milliseconds after the last one ended, so reads of a juice bar
 * that hangs do not pile up. A read that throws is over like any other, and the next one follows. Returns
 * what stops the reading.
 */
export function readAgainAndAgain(read: () => Promise<unknown>, every: number): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const next = () => {
    if (!stopped) timer = setTimeout(once, every)
  }
  const once = () => {
    read()
      .catch(() => undefined)
      .finally(next)
  }
  next()
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}

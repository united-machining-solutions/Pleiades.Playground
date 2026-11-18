/** A tool that answered, but without values. Its message is the sentence the backend gave as the reason. */
export class Refused extends Error {}

/** What the network or the server says when a connection is no more: then a new one may answer. */
const GONE_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "EPIPE", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_SOCKET", 404])
const GONE_WORDS = /not connected|connection closed|session not found|unknown session|invalid session/i

/**
 * Whether a question failed because its connection is gone: the backend refused the connection or
 * forgot the session, after a restart for example. A question that only took too long, or that the
 * backend answered with an error, is not: asking it again on a new connection would cost a second
 * wait and the same answer.
 */
export function connectionGone(error: unknown): boolean {
  for (let cause = error, depth = 0; cause !== undefined && cause !== null && depth < 10; depth++) {
    const { code, message } = cause as { code?: unknown; message?: unknown }
    if ((typeof code === "string" || typeof code === "number") && GONE_CODES.has(code)) return true
    if (typeof message === "string" && GONE_WORDS.test(message)) return true
    cause = (cause as { cause?: unknown }).cause
  }
  return false
}

/**
 * One connection to a backend for the whole server of the app, made once and kept: a page asks the
 * backend many times, and a connection of its own for each question cost a handshake every time.
 *
 * When a question finds its connection gone, the connection is replaced and that question is asked
 * once more on the new one. Every other failure is the answer, and the connection stays. A replaced
 * connection is closed only when no question runs on it any more, since closing a connection fails
 * every question still open on it.
 */
export function keptClient<TClient extends { close: () => Promise<void> }>(
  open: () => Promise<TClient>,
  gone: (error: unknown) => boolean = connectionGone,
) {
  let client: Promise<TClient> | null = null
  let opened: TClient | null = null
  const running = new Map<TClient, number>()
  const retired = new Set<TClient>()

  const current = (): Promise<TClient> => {
    client ??= open().then(
      (made) => (opened = made),
      (error: unknown) => {
        client = null
        throw error
      },
    )
    return client
  }
  const closeIfIdle = (one: TClient) => {
    if (!retired.has(one) || (running.get(one) ?? 0) > 0) return
    retired.delete(one)
    running.delete(one)
    void one.close().catch(() => undefined)
  }
  const retire = (one: TClient) => {
    // Another question may have replaced it already.
    if (opened === one) {
      client = null
      opened = null
    }
    retired.add(one)
    closeIfIdle(one)
  }
  const on = async <TValue>(one: TClient, work: (client: TClient) => Promise<TValue>): Promise<TValue> => {
    running.set(one, (running.get(one) ?? 0) + 1)
    try {
      return await work(one)
    } finally {
      running.set(one, (running.get(one) ?? 1) - 1)
      closeIfIdle(one)
    }
  }

  return async function use<TValue>(work: (client: TClient) => Promise<TValue>): Promise<TValue> {
    const first = await current()
    try {
      return await on(first, work)
    } catch (error) {
      if (error instanceof Refused || !gone(error)) throw error
      retire(first)
      return on(await current(), work)
    }
  }
}

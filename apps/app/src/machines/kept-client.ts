/** A tool that answered, but without values. Its message is the sentence the backend gave as the reason. */
export class Refused extends Error {}

/**
 * One connection to a backend for the whole server of the app, made once and kept: a page asks the
 * backend many times, and a connection of its own for each question cost a handshake every time.
 * When a question fails for another reason than a refusal, the connection may be the cause, a
 * backend that restarted for example: it is dropped, and the question is asked once more on a new one.
 */
export function keptClient<TClient extends { close: () => Promise<void> }>(open: () => Promise<TClient>) {
  let client: Promise<TClient> | null = null
  let opened: TClient | null = null
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
  const drop = (gone: TClient) => {
    // Another question may have dropped it already and made a new one.
    if (opened === gone) {
      client = null
      opened = null
    }
    void gone.close().catch(() => undefined)
  }

  return async function use<TValue>(work: (client: TClient) => Promise<TValue>): Promise<TValue> {
    const first = await current()
    try {
      return await work(first)
    } catch (error) {
      if (error instanceof Refused) throw error
      drop(first)
      return work(await current())
    }
  }
}

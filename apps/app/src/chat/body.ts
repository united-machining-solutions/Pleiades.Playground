// How much of a request a route reads before it gives up.

/**
 * The largest body a route of the app reads: 32 MiB, as many as the agent harness reads by default
 * (its `media.maxBodyBytes`, which the package does not export). As base64 in JSON that is about
 * 24 MB of audio, as much as OpenAI takes in one file.
 */
export const MAX_BODY_BYTES = 32 * 1024 * 1024

/**
 * The body of `request` as text, or null once it is bigger than `limit`. A `Content-Length` over the
 * limit is refused before anything is read, and a body without one is read only up to the limit, so
 * a large upload is never held in memory.
 */
export async function readBodyText(request: Request, limit = MAX_BODY_BYTES): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > limit) return null
  if (!request.body) return ""
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return text + decoder.decode()
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    text += decoder.decode(value, { stream: true })
  }
}

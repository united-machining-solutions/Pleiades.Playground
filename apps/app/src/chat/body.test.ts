import assert from "node:assert/strict"
import { test } from "node:test"

import { readBodyText } from "./body.ts"

/** A body that arrives in pieces and names no length, as a chunked upload does. */
function streamed(pieces: Array<string>): Request {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece))
      controller.close()
    },
  })
  return new Request("http://localhost/api/transcribe", { method: "POST", body, duplex: "half" } as RequestInit)
}

test("a body up to the limit is read as text", async () => {
  const request = new Request("http://localhost/api/transcribe", { method: "POST", body: '{"a":"ü"}' })
  assert.equal(await readBodyText(request, 64), '{"a":"ü"}')
})

test("a request without a body reads as empty", async () => {
  assert.equal(await readBodyText(new Request("http://localhost/api/transcribe"), 64), "")
})

test("a Content-Length over the limit is refused before the body is read", async () => {
  const request = new Request("http://localhost/api/transcribe", {
    method: "POST",
    headers: { "content-length": "65" },
    body: "x",
  })
  assert.equal(await readBodyText(request, 64), null)
  assert.equal(request.bodyUsed, false)
})

test("a body without a length is read up to the limit and no further", async () => {
  assert.equal(await readBodyText(streamed(["x".repeat(40), "x".repeat(40)]), 64), null)
  assert.equal(await readBodyText(streamed(["x".repeat(32), "x".repeat(32)]), 64), "x".repeat(64))
})

test("a character split between two pieces stays whole", async () => {
  const bytes = new TextEncoder().encode("ü")
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, 1))
      controller.enqueue(bytes.slice(1))
      controller.close()
    },
  })
  const request = new Request("http://localhost/api/transcribe", { method: "POST", body, duplex: "half" } as RequestInit)
  assert.equal(await readBodyText(request, 64), "ü")
})

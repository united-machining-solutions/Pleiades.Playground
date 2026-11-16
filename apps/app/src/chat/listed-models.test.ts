import assert from "node:assert/strict"
import { test } from "node:test"

import { listedModels } from "./listed-models.ts"

const env = { LLM_BASE_URL: "http://localhost:4000/v1/", LLM_API_KEY: "key-c" }

test("the endpoint is asked only where LLM_MODELS is empty", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => Promise.reject(new Error("not asked")))
  assert.deepEqual(await listedModels({}), [])
  assert.deepEqual(await listedModels({ ...env, LLM_MODELS: "named" }), [])
  assert.equal(fetch.mock.callCount(), 0)
})

test("a list that did not come is asked for again, one that came is kept", async (t) => {
  t.mock.method(console, "warn", () => {})
  const fetch = t.mock.method(globalThis, "fetch", () => Promise.resolve(new Response("", { status: 401 })))
  assert.deepEqual(await listedModels(env), [])

  fetch.mock.mockImplementation(() =>
    Promise.resolve(Response.json({ data: [{ id: "chat-model", mode: "chat" }, { id: "speech", mode: "audio_transcription" }] })),
  )
  assert.deepEqual(await listedModels(env), ["chat-model"])
  assert.deepEqual(await listedModels(env), ["chat-model"])
  assert.equal(fetch.mock.callCount(), 2)

  const [url, init] = fetch.mock.calls[1]?.arguments ?? []
  assert.equal(url, "http://localhost:4000/v1/models")
  assert.deepEqual((init as RequestInit).headers, { Authorization: "Bearer key-c" })
})

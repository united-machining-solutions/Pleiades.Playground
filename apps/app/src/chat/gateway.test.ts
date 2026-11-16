import assert from "node:assert/strict"
import { test } from "node:test"

import { chatSettings } from "./gateway.ts"

// Each test has an address of its own: the snapshots are kept per settings.

const answer = {
  data: [
    { id: "chat-model", mode: "chat" },
    { id: "speech", mode: "audio_transcription" },
  ],
}

test("without a gateway nothing is asked, and the chat has no model", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => Promise.reject(new Error("not asked")))
  assert.deepEqual(await chatSettings({}), { settings: undefined, dictation: undefined, gaps: [] })
  assert.equal(fetch.mock.callCount(), 0)
})

test("callers at the same time share one request, and a list with a chat model is kept", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => Promise.resolve(Response.json(answer)))
  const env = { LLM_BASE_URL: "http://shared/v1/", LLM_API_KEY: "key-c" }
  const [first, second] = await Promise.all([chatSettings(env), chatSettings(env)])
  assert.equal(first, second)
  assert.deepEqual(first.settings?.models, ["chat-model"])
  assert.equal(first.dictation?.model, "speech")
  assert.deepEqual(first.gaps, [])
  assert.equal(await chatSettings(env, () => Number.MAX_SAFE_INTEGER), first)
  assert.equal(fetch.mock.callCount(), 1)
  const [url, init] = fetch.mock.calls[0]?.arguments ?? []
  assert.equal(url, "http://shared/v1/models")
  assert.deepEqual((init as RequestInit).headers, { Authorization: "Bearer key-c" })
})

test("a list that did not come says why, and is asked for again after half a minute, not before", async (t) => {
  t.mock.method(console, "warn", () => {})
  const fetch = t.mock.method(globalThis, "fetch", () => Promise.resolve(new Response("", { status: 401 })))
  const env = { LLM_BASE_URL: "http://refusing/v1", LLM_API_KEY: "key-d" }
  let now = 1_000
  const clock = () => now

  const refused = await chatSettings(env, clock)
  assert.equal(refused.settings, undefined)
  assert.deepEqual(refused.gaps, ["GET /models of the gateway at LLM_BASE_URL answered 401"])
  assert.equal(JSON.stringify(refused).includes("key-d"), false)

  now += 29_000
  assert.equal(await chatSettings(env, clock), refused)
  assert.equal(fetch.mock.callCount(), 1)

  fetch.mock.mockImplementation(() => Promise.resolve(Response.json(answer)))
  now += 2_000
  assert.deepEqual((await chatSettings(env, clock)).settings?.models, ["chat-model"])
  assert.equal(fetch.mock.callCount(), 2)
})

test("a gateway that cannot be reached is named by the code of the error", async (t) => {
  t.mock.method(console, "warn", () => {})
  t.mock.method(globalThis, "fetch", () =>
    Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } })),
  )
  const away = await chatSettings({ LLM_BASE_URL: "http://away/v1" })
  assert.deepEqual(away.gaps, ["GET /models of the gateway at LLM_BASE_URL failed (ENOTFOUND)"])
})

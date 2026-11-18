import assert from "node:assert/strict"
import { test } from "node:test"

import { dictationSettings, modelNames, modelSettings, modelsOf, settingGaps } from "./models.ts"

const gatewayEnv = { LLM_BASE_URL: "http://localhost:4000/v1", LLM_API_KEY: "key-c" }

// The answer of GET /models of a LiteLLM gateway whose model of its own has no model_info: that model
// has no mode, the others say what they are for. A gateway answers so until its admin sets the mode.
const answer = {
  object: "list",
  data: [
    { id: "spark/qwen3.8-27b", object: "model" },
    { id: "openai/gpt-6-luna", object: "model", mode: "chat" },
    { id: "anthropic/claude-haiku-5-5", object: "model", mode: "chat" },
    { id: "spark/qwen3-embedding-8b", object: "model", mode: "embedding" },
    { id: "openai/gpt-transcribe", object: "model", mode: "audio_transcription" },
    { id: "local/whisper", object: "model", mode: "audio_transcription" },
  ],
}

test("of the models the gateway lists, chat takes those for chat or without a mode, dictation those for it", () => {
  assert.deepEqual(modelsOf(answer), {
    chat: ["spark/qwen3.8-27b", "openai/gpt-6-luna", "anthropic/claude-haiku-5-5"],
    transcription: ["openai/gpt-transcribe", "local/whisper"],
  })
})

test("an answer that is not a list of models gives none", () => {
  const none = { chat: [], transcription: [] }
  assert.deepEqual(modelsOf(undefined), none)
  assert.deepEqual(modelsOf({ error: "no" }), none)
  assert.deepEqual(modelsOf({ data: [{ id: "" }, { mode: "chat" }, null, { id: "a" }, { id: " a " }] }), {
    chat: ["a"],
    transcription: [],
  })
})

test("the chat offers the gateway's chat models in its order, and the first answers", () => {
  const settings = modelSettings(gatewayEnv, modelsOf(answer))
  assert.deepEqual(settings, {
    baseURL: "http://localhost:4000/v1",
    apiKey: "key-c",
    models: ["spark/qwen3.8-27b", "openai/gpt-6-luna", "anthropic/claude-haiku-5-5"],
  })
  assert.equal(modelNames(settings)[0], "spark/qwen3.8-27b")
})

test("without a gateway, or without a model for chat, the chat has none", () => {
  assert.equal(modelSettings({}, modelsOf(answer)), undefined)
  assert.equal(modelSettings(gatewayEnv, { chat: [], transcription: ["speech"] }), undefined)
  assert.deepEqual(modelNames(undefined), [])
})

test("a gateway that wants no key still gets one", () => {
  assert.equal(modelSettings({ LLM_BASE_URL: "http://localhost:4000/v1" }, modelsOf(answer))?.apiKey, "not-needed")
})

test("dictation takes the gateway's first model for it, and without one the field has no microphone", () => {
  assert.deepEqual(dictationSettings(gatewayEnv, modelsOf(answer)), {
    baseURL: "http://localhost:4000/v1",
    apiKey: "key-c",
    model: "openai/gpt-transcribe",
  })
  assert.equal(dictationSettings(gatewayEnv, { chat: ["a"], transcription: [] }), undefined)
  assert.equal(dictationSettings({}, modelsOf(answer)), undefined)
})

test("what the settings lack is said by their names, never by a value", () => {
  const none = { chat: [], transcription: [] }
  assert.deepEqual(settingGaps({}, none), [])
  assert.deepEqual(settingGaps({ LLM_API_KEY: "key-c" }, none), ["LLM_API_KEY is set, LLM_BASE_URL is empty"])
  assert.deepEqual(settingGaps(gatewayEnv, none), ["The gateway at LLM_BASE_URL lists no model for chat under /models"])
  assert.deepEqual(settingGaps(gatewayEnv, modelsOf(answer)), [])
  assert.equal(JSON.stringify(settingGaps({ LLM_API_KEY: "key-c" }, none)).includes("key-c"), false)
})

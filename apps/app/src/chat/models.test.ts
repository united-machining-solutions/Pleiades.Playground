import assert from "node:assert/strict"
import { test } from "node:test"

import { chatModelsOf, dictationSettings, modelNames, modelSettings, settingGaps } from "./models.ts"

const endpoint = { LLM_BASE_URL: "http://localhost:4000/v1" }

test("without settings the chat has no model", () => {
  assert.equal(modelSettings({}), undefined)
  assert.deepEqual(modelNames(modelSettings({})), [])
})

test("the endpoint's models are those LLM_MODELS names, in its order, each once", () => {
  const settings = modelSettings({ ...endpoint, LLM_API_KEY: "key-c", LLM_MODELS: "large, small ,large" })
  assert.deepEqual(settings, { baseURL: "http://localhost:4000/v1", apiKey: "key-c", models: ["large", "small"] })
  assert.deepEqual(modelNames(settings), ["large", "small"])
})

test("an empty LLM_MODELS takes the models the endpoint listed, and a named one wins", () => {
  assert.deepEqual(modelSettings(endpoint, ["listed"])?.models, ["listed"])
  assert.deepEqual(modelSettings({ ...endpoint, LLM_MODELS: "named" }, ["listed"])?.models, ["named"])
  assert.equal(modelSettings(endpoint), undefined)
  assert.equal(modelSettings({ LLM_MODELS: "named" }, ["listed"]), undefined)
})

test("an endpoint of one's own needs no key", () => {
  assert.equal(modelSettings({ ...endpoint, LLM_MODELS: "local" })?.apiKey, "not-needed")
})

test("settings that were begun say what they lack, by their names and never a value", () => {
  assert.deepEqual(settingGaps({}), [])
  assert.deepEqual(settingGaps(endpoint), [
    "LLM_BASE_URL is set, LLM_MODELS is empty, and the endpoint lists no chat model under /models",
  ])
  assert.deepEqual(settingGaps(endpoint, ["listed"]), [])
  assert.deepEqual(settingGaps({ ...endpoint, LLM_MODELS: "named" }), [])
  assert.deepEqual(settingGaps({ LLM_API_KEY: "key-c", LLM_MODELS: "named", LLM_TRANSCRIPTION_MODEL: " " }), [
    "LLM_API_KEY is set, LLM_BASE_URL is empty",
    "LLM_MODELS is set, LLM_BASE_URL is empty",
  ])
  assert.equal(JSON.stringify(settingGaps({ LLM_API_KEY: "key-c" })).includes("key-c"), false)
})

test("dictation needs the endpoint and a transcription model", () => {
  assert.equal(dictationSettings({}), undefined)
  assert.equal(dictationSettings(endpoint), undefined)
  assert.equal(dictationSettings({ LLM_TRANSCRIPTION_MODEL: "speech" }), undefined)
  assert.deepEqual(dictationSettings({ ...endpoint, LLM_TRANSCRIPTION_MODEL: " speech " }), {
    model: "speech",
    apiKey: "not-needed",
    baseURL: "http://localhost:4000/v1",
  })
})

// The answer of GET /models of a LiteLLM gateway whose self-hosted model has no model_info: that model
// has no mode, the others say what they are for. A gateway answers so until its admin sets the mode.
const gateway = {
  object: "list",
  data: [
    { id: "spark/qwen3.8-27b", object: "model" },
    { id: "openai/gpt-6-luna", object: "model", mode: "chat" },
    { id: "anthropic/claude-haiku-5-5", object: "model", mode: "chat" },
    { id: "spark/qwen3-embedding-8b", object: "model", mode: "embedding" },
    { id: "openai/gpt-transcribe", object: "model", mode: "audio_transcription" },
  ],
}

test("of the models an endpoint lists, the chat takes those that are for chat or do not say", () => {
  assert.deepEqual(chatModelsOf(gateway), ["spark/qwen3.8-27b", "openai/gpt-6-luna", "anthropic/claude-haiku-5-5"])
})

test("the speech-to-text model of dictation is never a chat model, even where the endpoint does not say", () => {
  assert.deepEqual(chatModelsOf({ data: [{ id: "llama3.2" }, { id: "whisper" }] }, " whisper "), ["llama3.2"])
})

test("an answer that is not a list of models gives none", () => {
  assert.deepEqual(chatModelsOf(undefined), [])
  assert.deepEqual(chatModelsOf({ error: "no" }), [])
  assert.deepEqual(chatModelsOf({ data: [{ id: "" }, { mode: "chat" }, null, { id: "a" }, { id: "a" }] }), ["a"])
})

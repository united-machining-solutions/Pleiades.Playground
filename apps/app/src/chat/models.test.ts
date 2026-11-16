import assert from "node:assert/strict"
import { test } from "node:test"

import { chatModelsOf, dictationSettings, modelNames, modelSettings, settingGaps } from "./models.ts"

test("without settings the chat has no model", () => {
  assert.deepEqual(modelNames(modelSettings({})), [])
})

test("every complete block adds its models: Anthropic's first, then OpenAI's, then the other endpoint's", () => {
  const settings = modelSettings({
    OPENAI_API_KEY: "key-a",
    OPENAI_MODELS: "small, large",
    ANTHROPIC_API_KEY: "key-b",
    ANTHROPIC_MODELS: "quick",
    LLM_BASE_URL: "http://localhost:4000/v1",
    LLM_MODELS: "local",
  })
  assert.deepEqual(modelNames(settings), ["quick", "small", "large", "local"])
  assert.deepEqual(settings.openai, { apiKey: "key-a", models: ["small", "large"] })
})

test("a block without a key or without a model does not count", () => {
  assert.deepEqual(modelSettings({ OPENAI_API_KEY: "key-a" }), {})
  assert.deepEqual(modelSettings({ ANTHROPIC_MODELS: "quick" }), {})
  assert.deepEqual(modelSettings({ LLM_MODELS: "local" }), {})
  assert.deepEqual(modelSettings({ OPENAI_API_KEY: "key-a", OPENAI_MODELS: " , " }), {})
})

test("a block that was begun says what it lacks, by the names of the settings", () => {
  assert.deepEqual(settingGaps({}), [])
  assert.deepEqual(settingGaps({ ANTHROPIC_API_KEY: "key-b", ANTHROPIC_MODELS: " , " }), [
    "ANTHROPIC_API_KEY is set, ANTHROPIC_MODELS is empty",
  ])
  assert.deepEqual(settingGaps({ OPENAI_API_KEY: "key-a", LLM_BASE_URL: "http://localhost:4000/v1" }), [
    "OPENAI_API_KEY is set, OPENAI_MODELS is empty",
    "LLM_BASE_URL is set, LLM_MODELS is empty, and the endpoint lists no chat model under /models",
  ])
  assert.deepEqual(settingGaps({ LLM_MODELS: "local" }), ["LLM_MODELS is set, LLM_BASE_URL is empty"])
})

test("model names without a key are no gap, and neither is a complete block", () => {
  assert.deepEqual(settingGaps({ ANTHROPIC_MODELS: "quick", OPENAI_MODELS: "small" }), [])
  assert.deepEqual(settingGaps({ ANTHROPIC_API_KEY: "key-b", ANTHROPIC_MODELS: "quick" }), [])
  assert.equal(JSON.stringify(settingGaps({ OPENAI_API_KEY: "key-a" })).includes("key-a"), false)
})

test("an endpoint of one's own needs no key", () => {
  const { compatible } = modelSettings({ LLM_BASE_URL: "http://localhost:1234/v1", LLM_MODELS: "local" })
  assert.deepEqual(compatible, { baseURL: "http://localhost:1234/v1", apiKey: "not-needed", models: ["local"] })
})

test("a name listed twice is offered once", () => {
  const settings = modelSettings({
    OPENAI_API_KEY: "key-a",
    OPENAI_MODELS: "same",
    LLM_BASE_URL: "http://localhost:4000/v1",
    LLM_MODELS: "same, other",
  })
  assert.deepEqual(modelNames(settings), ["same", "other"])
})

test("dictation needs a key and a transcription model, OpenAI's before the other endpoint's", () => {
  assert.equal(dictationSettings({}), undefined)
  assert.equal(dictationSettings({ OPENAI_API_KEY: "key-a" }), undefined)
  assert.equal(dictationSettings({ OPENAI_TRANSCRIPTION_MODEL: "speech" }), undefined)
  assert.equal(dictationSettings({ LLM_TRANSCRIPTION_MODEL: "local-speech" }), undefined)
  assert.deepEqual(dictationSettings({ OPENAI_API_KEY: "key-a", OPENAI_TRANSCRIPTION_MODEL: " speech " }), {
    model: "speech",
    apiKey: "key-a",
  })
  assert.deepEqual(
    dictationSettings({ LLM_BASE_URL: "http://localhost:4000/v1", LLM_TRANSCRIPTION_MODEL: "local-speech" }),
    { model: "local-speech", apiKey: "not-needed", baseURL: "http://localhost:4000/v1" },
  )
  assert.equal(
    dictationSettings({
      OPENAI_API_KEY: "key-a",
      OPENAI_TRANSCRIPTION_MODEL: "speech",
      LLM_BASE_URL: "http://localhost:4000/v1",
      LLM_TRANSCRIPTION_MODEL: "local-speech",
    })?.model,
    "speech",
  )
})

test("an empty OpenAI name for dictation lets the other endpoint's count, though the OpenAI key is set", () => {
  assert.equal(
    dictationSettings({
      OPENAI_API_KEY: "key-a",
      OPENAI_TRANSCRIPTION_MODEL: "",
      LLM_BASE_URL: "http://localhost:4000/v1",
      LLM_TRANSCRIPTION_MODEL: "local-speech",
    })?.model,
    "local-speech",
  )
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

test("an empty LLM_MODELS takes the models the endpoint listed, and a named one wins", () => {
  const env = { LLM_BASE_URL: "http://localhost:4000/v1" }
  assert.deepEqual(modelSettings(env, ["listed"]).compatible?.models, ["listed"])
  assert.deepEqual(modelSettings({ ...env, LLM_MODELS: "named" }, ["listed"]).compatible?.models, ["named"])
  assert.deepEqual(modelSettings({}, ["listed"]), {})
  assert.deepEqual(settingGaps(env, ["listed"]), [])
})

import assert from "node:assert/strict"
import { test } from "node:test"

import { modelNames, modelSettings } from "./models.ts"

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

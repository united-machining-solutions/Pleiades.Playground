import assert from "node:assert/strict"
import { test } from "node:test"

import { atOnce, listed, pick } from "./gateway.server.ts"

const models = {
  data: [
    { id: "spark/qwen3.8-27b", mode: "chat" },
    { id: "own-model" },
    { id: "spark/qwen3-embedding-8b", mode: "embedding" },
    { id: "openai/gpt-transcribe", mode: "audio_transcription" },
    { id: "tts", mode: "audio_speech" },
    { id: "titan/tom", mode: "audio_speech" },
  ],
}

test("the gateway's models are taken by mode, and one without a mode is for chat", () => {
  assert.deepEqual(listed(models), { chat: ["spark/qwen3.8-27b", "own-model"], speech: ["tts", "titan/tom"] })
  assert.deepEqual(listed({}), { chat: [], speech: [] })
})

test("a model meant for Titan wins for its mode, else the first one answers", () => {
  assert.equal(pick(["tts", "titan/tom"]), "titan/tom")
  assert.equal(pick(["spark/qwen3.8-27b", "own-model"]), "spark/qwen3.8-27b")
  assert.equal(pick([]), undefined)
})

test("a model is asked to answer at once in the way its family takes, and one set up for Titan gets nothing", () => {
  assert.deepEqual(atOnce("anthropic/claude-haiku-5-5"), { thinking: { type: "disabled" } })
  assert.deepEqual(atOnce("spark/qwen3.8-27b"), { chat_template_kwargs: { enable_thinking: false } })
  assert.deepEqual(atOnce("titan/chat"), {})
  assert.deepEqual(atOnce("openai/gpt-6-luna"), {})
})

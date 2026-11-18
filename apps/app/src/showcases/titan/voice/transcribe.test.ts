import assert from "node:assert/strict"
import { test } from "node:test"

import { transcriptionFile } from "./transcribe.ts"

test("a recording is named by its format, without the codecs", () => {
  assert.equal(transcriptionFile("audio/webm;codecs=opus"), "speech.webm")
  assert.equal(transcriptionFile("audio/ogg; codecs=opus"), "speech.ogg")
  assert.equal(transcriptionFile("audio/mp4"), "speech.mp4")
})

test("a recording of no known format is taken for webm, what Chrome records", () => {
  assert.equal(transcriptionFile(""), "speech.webm")
})

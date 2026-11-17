import assert from "node:assert/strict"
import { test } from "node:test"

import { MAX_CHAT_NAME, UNNAMED_CHAT, chatName, nameOfQuestion } from "./chat-name.ts"

const named = { title: "How were P-04 and P-07 doing?", titled: true }
const unnamed = { title: UNNAMED_CHAT, titled: false }

test("a chat the app has named is called by its name", () => {
  assert.equal(chatName(named, "How were P-04 and P-07 doing?"), "How were P-04 and P-07 doing?")
  assert.equal(chatName(named, undefined), "How were P-04 and P-07 doing?")
})

test("the name wins over the first question, which can be longer than the name", () => {
  const question = "x".repeat(MAX_CHAT_NAME + 20)
  assert.equal(chatName({ title: "x".repeat(MAX_CHAT_NAME), titled: true }, question), "x".repeat(MAX_CHAT_NAME))
})

test("a chat without a name yet is called by its first question, cut as the name will be", () => {
  assert.equal(chatName(unnamed, "How is M-02 doing?"), "How is M-02 doing?")
  assert.equal(chatName(undefined, "How is M-02 doing?"), "How is M-02 doing?")
  const question = "y".repeat(MAX_CHAT_NAME + 20)
  assert.equal(chatName(undefined, question), nameOfQuestion(question))
  assert.equal(chatName(undefined, question).length, MAX_CHAT_NAME)
})

test("a chat with neither name nor question is a new chat", () => {
  assert.equal(chatName(undefined, undefined), UNNAMED_CHAT)
  assert.equal(chatName(unnamed, undefined), UNNAMED_CHAT)
  assert.equal(chatName(unnamed, ""), UNNAMED_CHAT)
})

test("the name from a question is its first 80 characters, as the harness has kept it so far", () => {
  assert.equal(MAX_CHAT_NAME, 80)
  assert.equal(nameOfQuestion("short"), "short")
  assert.equal(nameOfQuestion("z".repeat(81)), "z".repeat(80))
})

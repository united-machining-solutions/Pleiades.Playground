import assert from "node:assert/strict"
import { test } from "node:test"
import type { UIMessage } from "@tanstack/ai-react"
import { documentationTurn } from "./turn.ts"
test("an unsuccessful documentation turn gets one fallback without changing previous conversations", () => {
  const messages = [
    { role: "user", parts: [] }, { role: "assistant", parts: [] },
    { role: "user", parts: [] }, { role: "assistant", parts: [{ type: "tool-call", name: "docs_search" }] },
    { role: "assistant", parts: [{ type: "text", content: "Unverified response" }] },
  ] as unknown as UIMessage[]
  assert.deepEqual(documentationTurn(messages, 1), {last:1,usesDocumentation:false})
  assert.deepEqual(documentationTurn(messages, 3), {last:4,usesDocumentation:true})
})

import assert from "node:assert/strict"
import { test } from "node:test"
import { sseParser } from "./sse.ts"

const STREAM = 'event: machine.state.full\ndata: {"a":1}\n\nevent: connection.heartbeat\ndata: {"b":2}\n\n'

test("a message ends with a blank line, and the event defaults to message", () => {
  const parse = sseParser()
  assert.deepEqual(parse('data: {"a":1}\n\n'), [{ event: "message", data: '{"a":1}' }])
  assert.deepEqual(parse(STREAM), [
    { event: "machine.state.full", data: '{"a":1}' },
    { event: "connection.heartbeat", data: '{"b":2}' },
  ])
})

test("a message cut anywhere is whole when its end arrives", () => {
  for (let cut = 1; cut < STREAM.length; cut++) {
    const parse = sseParser()
    const messages = [...parse(STREAM.slice(0, cut)), ...parse(STREAM.slice(cut))]
    assert.equal(messages.length, 2, `cut at ${cut}`)
    assert.deepEqual(messages[1], { event: "connection.heartbeat", data: '{"b":2}' })
  }
})

test("CRLF cut between its CR and its LF does not lose the boundary of two messages", () => {
  const crlf = STREAM.replaceAll("\n", "\r\n")
  for (let cut = 1; cut < crlf.length; cut++) {
    const parse = sseParser()
    const messages = [...parse(crlf.slice(0, cut)), ...parse(crlf.slice(cut))]
    assert.equal(messages.length, 2, `cut at ${cut}`)
  }
  const parse = sseParser()
  assert.deepEqual(parse("data: x\r\n\r"), [])
  assert.deepEqual(parse("\ndata: y\r\n\r\n"), [{ event: "message", data: "x" }, { event: "message", data: "y" }])
})

test("a lone CR ends a line, as the standard allows", () => {
  const parse = sseParser()
  // The last CR may be the first half of a CRLF, so the second message waits for the next chunk.
  assert.deepEqual(parse("event: a\rdata: x\r\rdata: y\r\r"), [{ event: "a", data: "x" }])
  assert.deepEqual(parse("data: z\r\r"), [{ event: "message", data: "y" }])
})

test("comments and fields it does not know are left out, data lines join with a line feed", () => {
  const parse = sseParser()
  assert.deepEqual(parse(": keep-alive\n\nid: 7\nretry: 100\ndata: one\ndata: two\n\n"), [{ event: "message", data: "one\ntwo" }])
  assert.deepEqual(parse("event: only-an-event\n\n"), [])
})

test("one space after the colon is dropped, no more", () => {
  const parse = sseParser()
  assert.deepEqual(parse("data:  two spaces\n\ndata:none\n\n"), [
    { event: "message", data: " two spaces" },
    { event: "message", data: "none" },
  ])
})

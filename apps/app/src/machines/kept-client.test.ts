import assert from "node:assert/strict"
import { test } from "node:test"

import { Refused, connectionGone, keptClient } from "./kept-client.ts"

/** A client as the MCP SDK has it: closing it fails every question still open on it. */
class FakeClient {
  closed = false
  private open = new Set<(error: Error) => void>()
  readonly id: number
  constructor(id: number) {
    this.id = id
  }
  ask<T>(answer: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error("Not connected"))
    return new Promise<T>((resolve, reject) => {
      const fail = (error: Error) => reject(error)
      this.open.add(fail)
      answer().then(resolve, reject).finally(() => this.open.delete(fail))
    })
  }
  async close() {
    this.closed = true
    for (const fail of this.open) fail(new Error("Connection closed"))
  }
}

function clients() {
  const made: Array<FakeClient> = []
  const use = keptClient(async () => {
    const client = new FakeClient(made.length + 1)
    made.push(client)
    return client
  })
  return { made, use }
}

const later = <T>(value: T, ms = 5) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))
const failing = (error: unknown) => () => Promise.reject(error)

test("the questions share one connection", async () => {
  const { made, use } = clients()
  const answers = await Promise.all([1, 2, 3].map((n) => use((client) => client.ask(() => later(n)))))
  assert.deepEqual(answers, [1, 2, 3])
  assert.equal(made.length, 1)
})

test("a question that fails is its own answer: the connection stays, and the others run once", async () => {
  const { made, use } = clients()
  let runs = 0
  const other = use((client) => client.ask(() => (runs++, later("other", 20))))
  await assert.rejects(use((client) => client.ask(failing(new Error("The operation was aborted due to timeout")))), /timeout/)
  assert.equal(await other, "other")
  assert.equal(runs, 1)
  assert.equal(made.length, 1)
  assert.equal(made[0]?.closed, false)
})

test("a refusal is an answer and asks nothing again", async () => {
  const { made, use } = clients()
  await assert.rejects(use(failing(new Refused("No machine"))), Refused)
  assert.equal(made.length, 1)
})

test("a question that finds its connection gone is asked once more on a new one, and the old one closes when idle", async () => {
  const { made, use } = clients()
  let runs = 0
  const other = use((client) => client.ask(() => (runs++, later("other", 20))))
  let tries = 0
  const answer = await use((client) => (++tries === 1 ? Promise.reject(Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } })) : client.ask(() => later(client.id))))
  assert.equal(answer, 2)
  assert.equal(made.length, 2)
  // The question still open on the first connection is not failed by the replacement.
  assert.equal(made[0]?.closed, false)
  assert.equal(await other, "other")
  assert.equal(runs, 1)
  assert.equal(made[0]?.closed, true)
  assert.equal(made[1]?.closed, false)
})

test("a gone connection is told from a slow or failing answer", () => {
  assert.equal(connectionGone(Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } })), true)
  assert.equal(connectionGone(new Error("Not connected")), true)
  assert.equal(connectionGone(Object.assign(new Error("Error POSTing to endpoint"), { code: 404 })), true)
  assert.equal(connectionGone(new Error("The operation was aborted due to timeout")), false)
  assert.equal(connectionGone(new Error("Internal error")), false)
})

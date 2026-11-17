import assert from "node:assert/strict"
import { test } from "node:test"
import { pageUri, sourcesOf } from "./results.ts"

const uri = `docs://documents/${"a".repeat(64)}/${"b".repeat(64)}/pages/271`
const source = { resourceUri: uri, citation: "manual.pdf, page 271" }
test("citations survive both MCP text and harness content parts, with overlapping passages deduplicated", () => {
  for (const content of [JSON.stringify({ hits: [source, source] }), [{ type: "text", content: JSON.stringify({ hits: [source] }) }, { type: "text", content: '{"type":"resource_link"}' }], source]) {
    assert.deepEqual(sourcesOf(content), [source])
  }
  assert.deepEqual(sourcesOf(JSON.stringify([{ type: "text", content: JSON.stringify({ hits: [source] }) }])), [source])
})
test("only revision-specific documentation page references can reach the server", () => {
  for (const bad of ["https://attacker.invalid", "file:///etc/passwd", uri + "?url=http://attacker", uri.replace("271", "0"), uri.replace("271", "../1"), "bad", null]) {
    assert.throws(() => pageUri(bad))
    assert.deepEqual(sourcesOf({ ...source, resourceUri: bad }), [])
  }
  assert.deepEqual(sourcesOf("not json"), [])
  assert.deepEqual(sourcesOf({ hits: [{ resourceUri: uri }] }), [])
})

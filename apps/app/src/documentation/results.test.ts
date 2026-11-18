import assert from "node:assert/strict"
import { test } from "node:test"
import { pageDescription, pageUri, sourcesOf } from "./results.ts"

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

test("source chips preserve printed page labels while navigation keeps the physical page", () => {
  for (const pageLabel of ["iv", "3-17", "250"]) {
    const hit = { ...source, citation: `manual.pdf, page ${pageLabel} (PDF page 271)`, source: { page: 271, pageLabel } }
    for (const content of [{ hits: [hit] }, hit, [{ type: "text", text: JSON.stringify({ hits: [hit] }) }]]) {
      const [parsed] = sourcesOf(content)
      assert.equal(parsed.resourceUri, uri)
      assert.equal(parsed.pageLabel, pageLabel)
      assert.equal(pageDescription(parsed), `p. ${pageLabel} (PDF page 271)`)
    }
  }
  for (const metadata of [undefined, { pageLabel: "" }, { pageLabel: "  " }, { pageLabel: 271 }]) {
    assert.equal(pageDescription(sourcesOf({ ...source, source: metadata })[0]), "p. 271")
  }
  assert.equal(pageDescription(sourcesOf({ ...source, source: { pageLabel: "271" } })[0]), "p. 271")
})

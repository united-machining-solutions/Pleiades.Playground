import assert from "node:assert/strict"
import { test } from "node:test"
import { pageUri } from "./results.ts"

test("only exact revision-specific documentation page references can reach the source viewer", () => {
  const uri = `docs://documents/${"a".repeat(64)}/${"b".repeat(64)}/pages/271`
  assert.equal(pageUri(uri), uri)
  for (const bad of [null, {}, "https://example.test/manual.pdf", uri.replace("271", "0"), `${uri}?upstream=http://example.test`, uri.replace("pages/271", "original"), uri.replace("pages/271", "pages/../2")]) {
    assert.throws(() => pageUri(bad))
  }
})

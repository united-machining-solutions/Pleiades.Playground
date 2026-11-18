import assert from "node:assert/strict"
import { createServer } from "node:http"
import { once } from "node:events"
import { test } from "node:test"
import { createMCPServer, resourceDefinition } from "@tanstack/ai-mcp/server"
import { pdfRange, pdfReference, pdfChunk, servePdf } from "./pdf-source.ts"

const documentId = "a".repeat(64), revision = "b".repeat(64)
const root = `docs://documents/${documentId}/${revision}`
const url = `http://localhost/api/documentation/pdf?documentId=${documentId}&revision=${revision}`
test("PDF ranges accept full, partial and suffix reads and reject unsafe or unsatisfiable requests", () => {
  assert.deepEqual(pdfRange(null, 100), { start: 0, end: 99, partial: false })
  assert.deepEqual(pdfRange("bytes=10-19", 100), { start: 10, end: 19, partial: true })
  assert.deepEqual(pdfRange("bytes=-8", 100), { start: 92, end: 99, partial: true })
  assert.deepEqual(pdfRange("bytes=90-200", 100), { start: 90, end: 99, partial: true })
  for (const value of ["bytes=100-", "bytes=9-2", "bytes=-0", "bytes=1-2,5-6", "bytes=-", "bytes=9007199254740993-"]) assert.throws(() => pdfRange(value, 100))
  assert.throws(() => pdfReference(new URL("http://localhost?documentId=../../x")))
})
test("rejects PDF resources with mismatching URIs, invalid base64 or truncated byte counts", async () => {
  for (const content of [{ uri: "file:///etc/passwd", blob: "YWJj" }, { uri: `${root}/original/0/3`, blob: "***=" }, { uri: `${root}/original/0/3`, blob: "YQ==" }]) {
    await assert.rejects(pdfChunk({ readResource: async () => ({ contents: [{ ...content, mimeType: "application/octet-stream" }] }) }, root, 0, 3))
  }
})
test("streams original bytes to the viewer exclusively through MCP and supports HTTP ranges", async () => {
  const bytes = Buffer.from("%PDF-1.7\nOriginal PDF fixture bytes\n%%EOF")
  const mcp = createMCPServer({ name: "pdf-fixture", version: "1", tools: [], resources: [
    resourceDefinition({ uri: `${root}/metadata`, name: "metadata", mimeType: "application/json" }).read(() => ({ text: JSON.stringify({ documentId, revision, path: "manual.pdf", size: bytes.length, pageCount: 2, mimeType: "application/pdf", chunkSize: 262144 }) })),
    ...[[0, bytes.length], [5, 10]].map(([offset, length]) => resourceDefinition({ uri: `${root}/original/${offset}/${length}`, name: `bytes-${offset}`, mimeType: "application/octet-stream" }).read(() => ({ blob: bytes.subarray(offset, offset + length).toString("base64") }))),
  ] })
  const http = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    const result = await mcp.fetch(new Request(`http://127.0.0.1${request.url}`, { method: request.method, headers: request.headers as Record<string, string>, body: chunks.length ? Buffer.concat(chunks) : undefined }))
    response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(Buffer.from(await result.arrayBuffer()))
  })
  const previous = process.env.APP_MCP_SERVERS
  http.listen(0, "127.0.0.1"); await once(http, "listening"); const address = http.address(); assert(address && typeof address !== "string")
  process.env.APP_MCP_SERVERS = `docs=http://127.0.0.1:${address.port}/mcp`
  try {
    const full = await servePdf(new Request(url)); assert.equal(full.status, 200); assert.equal(full.headers.get("content-type"), "application/pdf"); assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes)
    const partial = await servePdf(new Request(url, { headers: { range: "bytes=5-14" } })); assert.equal(partial.status, 206); assert.equal(partial.headers.get("content-range"), `bytes 5-14/${bytes.length}`); assert.deepEqual(Buffer.from(await partial.arrayBuffer()), bytes.subarray(5, 15))
    assert.equal((await servePdf(new Request(url, { headers: { range: "bytes=999-" } }))).status, 416)
    assert.equal((await servePdf(new Request("http://localhost/api/documentation/pdf?documentId=bad"))).status, 400)
    delete process.env.APP_MCP_SERVERS; assert.equal((await servePdf(new Request(url))).status, 503)
  } finally {
    if (previous === undefined) delete process.env.APP_MCP_SERVERS; else process.env.APP_MCP_SERVERS = previous
    http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve()))
  }
})

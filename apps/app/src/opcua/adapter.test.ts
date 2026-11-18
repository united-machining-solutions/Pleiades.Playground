import assert from "node:assert/strict"
import { test } from "node:test"

import { adapterUrl } from "./adapter.ts"

test("the management API of the adapter answers where its MCP server does, without the /mcp", () => {
  assert.equal(adapterUrl({ APP_MCP_SERVERS: "opcua=http://opcua-adapter:8080/mcp" }), "http://opcua-adapter:8080")
  assert.equal(adapterUrl({ APP_MCP_SERVERS: "juicebar=http://j/mcp, opcua=http://localhost:5560/mcp/" }), "http://localhost:5560")
  // Behind a proxy, under a path of its own.
  assert.equal(adapterUrl({ APP_MCP_SERVERS: "opcua=https://proxy.example/opcua/mcp" }), "https://proxy.example/opcua")
})

test("without the further server opcua the app has no adapter", () => {
  assert.equal(adapterUrl({}), undefined)
  assert.equal(adapterUrl({ APP_MCP_SERVERS: "ultimaker=http://ultimaker-api:8080/mcp" }), undefined)
  // The old settings of the adapter are read no more.
  assert.equal(adapterUrl({ OPCUA_ADAPTER_URL: "http://opcua-adapter:8080" }), undefined)
})

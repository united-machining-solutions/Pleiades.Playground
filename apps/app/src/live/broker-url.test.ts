import assert from "node:assert/strict"
import { test } from "node:test"

import { brokerUrl } from "./broker-url.ts"

const http = { protocol: "http:", hostname: "device.example.internal", host: "device.example.internal" }
const https = { protocol: "https:", hostname: "device.example.internal", host: "device.example.internal:8443" }

test("over HTTP the browser reaches the broker at the host of the page and the published port", () => {
  assert.equal(brokerUrl({ url: null, port: "9001", wssPath: null }, http), "ws://device.example.internal:9001")
  // The path is for HTTPS only: over HTTP the port answers, also where the page comes straight from the app.
  assert.equal(brokerUrl({ url: null, port: "9001", wssPath: "/mqtt" }, http), "ws://device.example.internal:9001")
})

test("over HTTPS with a path the browser reaches the broker at the origin of the page", () => {
  assert.equal(
    brokerUrl({ url: null, port: "9001", wssPath: "/mqtt" }, https),
    "wss://device.example.internal:8443/mqtt",
  )
})

test("over HTTPS without a path the browser keeps the published port", () => {
  assert.equal(brokerUrl({ url: null, port: "9001", wssPath: null }, https), "wss://device.example.internal:9001")
})

test("a whole address wins over everything else", () => {
  const url = "wss://broker.example.com/"
  assert.equal(brokerUrl({ url, port: "9001", wssPath: "/mqtt" }, https), url)
  assert.equal(brokerUrl({ url, port: "9001", wssPath: null }, http), url)
})

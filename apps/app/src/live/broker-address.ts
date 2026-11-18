import { createServerFn } from "@tanstack/react-start"

/**
 * Where the browser reaches the broker with MQTT over WebSocket, see `brokerUrl`: `MQTT_WS_URL`, the
 * whole address; `MQTT_WSS_PATH`, a path at the origin of a page over HTTPS; and `MQTT_WS_PORT`, the
 * port the stack publishes the broker's WebSocket on. With it, the time of the
 * server: a page reads whether a machine is silent against that clock, as the backend does, not
 * against the clock of the browser.
 */
export const getBrokerAddress = createServerFn({ method: "GET" }).handler(() => ({
  url: process.env.MQTT_WS_URL || null,
  port: process.env.MQTT_WS_PORT || "9001",
  wssPath: process.env.MQTT_WSS_PATH || null,
  now: new Date().toISOString(),
}))

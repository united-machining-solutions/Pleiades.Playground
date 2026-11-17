import { createServerFn } from "@tanstack/react-start"

/**
 * Where the browser reaches the broker with MQTT over WebSocket. `MQTT_WS_URL` names the whole
 * address, for a broker behind a proxy; without it the browser takes the host of the page and the
 * port the stack publishes the broker's WebSocket on, `MQTT_WS_PORT`. With it, the time of the
 * server: a page reads whether a machine is silent against that clock, as the backend does, not
 * against the clock of the browser.
 */
export const getBrokerAddress = createServerFn({ method: "GET" }).handler(() => ({
  url: process.env.MQTT_WS_URL || null,
  port: process.env.MQTT_WS_PORT || "9001",
  now: new Date().toISOString(),
}))

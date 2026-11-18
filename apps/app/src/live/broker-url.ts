/** What the server of the app says about the broker's WebSocket, see `broker-address.ts`. */
export type BrokerAddress = { url: string | null; port: string; wssPath: string | null }

/** The part of `window.location` the address depends on. */
export type PageLocation = { protocol: string; hostname: string; host: string }

/**
 * The address at which the browser reaches the broker with MQTT over WebSocket, in this order:
 * - `MQTT_WS_URL`, the whole address, for a broker behind a proxy;
 * - on a page over HTTPS with `MQTT_WSS_PATH`, that path at the origin of the page: the proxy that serves the
 *   page over TLS forwards it to the broker, which speaks no TLS itself;
 * - otherwise the host of the page and the port the stack publishes the WebSocket on, `MQTT_WS_PORT`.
 */
export function brokerUrl(address: BrokerAddress, page: PageLocation): string {
  if (address.url) return address.url
  const secure = page.protocol === "https:"
  if (secure && address.wssPath) return `wss://${page.host}${address.wssPath}`
  return `${secure ? "wss" : "ws"}://${page.hostname}:${address.port}`
}

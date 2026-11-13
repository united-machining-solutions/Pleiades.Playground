// Shows a card without a language model. It stands in for a host of MCP Apps: it calls one tool of
// the generative UI backend, reads the card file the tool links, and serves one page that loads the
// card file in a frame and hands it the result, as a host does. A tool the card calls itself goes
// on to the backend. It needs Node.js 18 or newer and nothing else, and it changes nothing.
//
//   node .claude/skills/build-your-own/show-card.mjs <tool> [key=value ...]
//
// It prints the address of the page and serves it until it is stopped (Ctrl+C), so start it in the
// background if you go on working. Open the address in a browser, or take a picture of it. The page
// shows the card twice, wide and narrow, so that you see whether anything runs over.
//
// The port of the backend is the one of .env.example. If yours differs, set GENUI_MCP_PORT in the
// shell. SHOW_CARD_PORT moves the page of this script; it is 5599 if omitted.
import { createServer } from "node:http"

const port = (name, usual) => process.env[name] ?? usual
const genui = `http://localhost:${port("GENUI_MCP_PORT", 5520)}`
const own = Number(port("SHOW_CARD_PORT", 5599))

function fail(why) {
  console.error(why)
  process.exit(1)
}

async function mcp(method, params) {
  const answer = await fetch(`${genui}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20000),
  })
  const text = await answer.text()
  // The server answers as JSON or as one server-sent event.
  const json = text.startsWith("{") ? text : (text.split("\n").find((line) => line.startsWith("data: ")) ?? "").slice(6)
  const message = JSON.parse(json)
  if (message.error) throw Object.assign(new Error(message.error.message), { rpc: message.error })
  return message.result
}

const [tool, ...pairs] = process.argv.slice(2)
if (!tool) fail("usage: node .claude/skills/build-your-own/show-card.mjs <tool> [key=value ...]")

const value = (text) => (/^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text === "true" ? true : text === "false" ? false : text)
const args = Object.fromEntries(pairs.map((pair) => [pair.slice(0, pair.indexOf("=")), value(pair.slice(pair.indexOf("=") + 1))]))

const { tools } = await mcp("tools/list").catch((error) =>
  fail(`The generative UI backend does not answer at ${genui}/mcp (${error.cause?.code ?? error.message}). Does the stack run?`),
)
const listed = tools.find((one) => one.name === tool)
if (!listed) fail(`The backend has no tool ${tool}. It has: ${tools.map((one) => one.name).join(", ")}.`)
const uri = listed._meta?.ui?.resourceUri
if (!uri) {
  fail(
    `${tool} links no card file: its metadata has no _meta.ui.resourceUri. The card file is step 6 of the recipe create-card. Without one there is nothing to show here; the values are in "look.mjs call ${tool}".`,
  )
}
// Times in the zone of this computer, where the tool takes one.
if ("timeZone" in (listed.inputSchema?.properties ?? {}) && !("timeZone" in args)) {
  args.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
}

const file = await mcp("resources/read", { uri }).catch((error) => fail(`The backend does not serve ${uri}: ${error.message}`))
const card = file.contents?.[0]?.text
if (!card) fail(`${uri} came back without a text. Was the card file built (pnpm --filter @pleiades/genui-mcp build)?`)
const result = await mcp("tools/call", { name: tool, arguments: args })
for (const piece of result.content ?? []) if (piece.type === "text") console.log(piece.text)

// What goes into a script of the page must not end that script.
const inPage = (data) => JSON.stringify(data).replace(/</g, "\\u003c")

const page = `<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<title>${tool}: the card as a host shows it</title>
<body style="font-family: system-ui, sans-serif; background: #f4f4f5; margin: 0; padding: 16px">
<p style="font-size: 13px; margin: 0 0 16px">
  A stand-in for a host of MCP Apps: the card file <code>${uri}</code> as the backend serves it, with the
  result of <code>${tool}</code>. Wide on the left, narrow on the right.
</p>
<div style="display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap">
  <iframe title="The card, wide" src="/card" sandbox="allow-scripts" style="width: 480px; height: 40px; border: 0"></iframe>
  <iframe title="The card, narrow" src="/card" sandbox="allow-scripts" style="width: 320px; height: 40px; border: 0"></iframe>
</div>
<script>
const given = ${inPage(args)}
const result = ${inPage(result)}
const frames = [...document.querySelectorAll("iframe")]
window.addEventListener("message", async (event) => {
  const frame = frames.find((one) => one.contentWindow === event.source)
  const message = event.data
  if (!frame || !message || message.jsonrpc !== "2.0") return
  const send = (answer) => frame.contentWindow.postMessage({ jsonrpc: "2.0", ...answer }, "*")
  if (message.method === "ui/initialize") {
    send({
      id: message.id,
      result: {
        protocolVersion: message.params.protocolVersion,
        hostInfo: { name: "show-card", version: "1" },
        hostCapabilities: { serverTools: {} },
        hostContext: {},
      },
    })
  } else if (message.method === "ui/notifications/initialized") {
    send({ method: "ui/notifications/tool-input", params: { arguments: given } })
    send({ method: "ui/notifications/tool-result", params: result })
  } else if (message.method === "ui/notifications/size-changed") {
    if (message.params && message.params.height) frame.style.height = message.params.height + "px"
  } else if (message.method === "tools/call" && message.id !== undefined) {
    // A tool the card calls itself, as a host passes it on to the server the card came from.
    try {
      const answer = await (await fetch("/call", { method: "POST", body: JSON.stringify(message.params) })).json()
      send(answer.error ? { id: message.id, error: answer.error } : { id: message.id, result: answer.result })
    } catch (error) {
      send({ id: message.id, error: { code: -32000, message: String(error) } })
    }
  } else if (message.method && message.id !== undefined) {
    send({ id: message.id, error: { code: -32601, message: "This stand-in answers no " + message.method + "." } })
  }
})
</script>
</body>
</html>
`

const server = createServer(async (request, response) => {
  const send = (status, type, body) => {
    response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" })
    response.end(body)
  }
  if (request.method === "GET" && request.url === "/") return send(200, "text/html; charset=utf-8", page)
  if (request.method === "GET" && request.url === "/card") return send(200, "text/html; charset=utf-8", card)
  if (request.method === "POST" && request.url === "/call") {
    let body = ""
    for await (const chunk of request) body += chunk
    try {
      const asked = JSON.parse(body)
      console.log(`  the card calls ${asked.name}`)
      return send(200, "application/json", JSON.stringify({ result: await mcp("tools/call", asked) }))
    } catch (error) {
      return send(200, "application/json", JSON.stringify({ error: error.rpc ?? { code: -32000, message: String(error.message) } }))
    }
  }
  send(404, "text/plain", "Not here.")
})
server.on("error", (error) =>
  fail(`The page cannot be served on port ${own} (${error.code}). Set SHOW_CARD_PORT to a free port.`),
)
server.listen(own, "127.0.0.1", () => {
  console.log(`\nThe card: http://localhost:${own}/  (wide and narrow; Ctrl+C ends this)`)
})

// SPDX-License-Identifier: Apache-2.0
//
// Checks the gateway (ADR-0017) against what the APIs say about themselves, on a running stack. Each API serves
// two OpenAPI documents: v1.json with every operation and read.json with the reading ones. Every operation of
// read.json must pass the gateway, every other operation of v1.json must end at the gateway, and the gateway must
// serve read.json and its Swagger UI, but not v1.json. So the allowlist in the config "gateway" of compose.yaml
// and the document that describes it cannot drift apart: a new reading endpoint without a route fails here, and
// so does a route that lets a writing one through.
//
//   node .github/scripts/check-gateway.mjs [gateway] [timeseries-api] [events-api]
//
// The defaults are the ports of compose.yaml on this computer. It needs Node.js and no package.

const [gateway = "http://localhost:5590", timeseriesApi = "http://localhost:5500", eventsApi = "http://localhost:5510"] =
  process.argv.slice(2)

const apis = [
  { prefix: "/timeseries", url: timeseriesApi },
  { prefix: "/events", url: eventsApi },
]

const methods = ["get", "put", "post", "delete", "patch"]
const failures = []
const fail = (message) => failures.push(message)

async function json(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} answers ${response.status}`)
  return response.json()
}

/** Every operation of a document as "get /path/{parameter}". */
const operations = (document) =>
  Object.entries(document.paths ?? {}).flatMap(([path, item]) =>
    methods.filter((method) => item[method]).map((method) => `${method} ${path}`))

/** Whether Traefik refused the request: its 404 carries this text, one of an API does not. */
async function refused(method, path) {
  const response = await fetch(gateway + path, {
    method: method.toUpperCase(),
    headers: method === "get" ? {} : { "Content-Type": "application/json" },
    body: method === "get" ? undefined : "{}",
    redirect: "manual",
  })
  const text = await response.text()
  return response.status === 404 && text.trim() === "404 page not found"
}

for (const api of apis) {
  const all = operations(await json(`${api.url}/openapi/v1.json`))
  const reading = new Set(operations(await json(`${api.url}/openapi/read.json`)))

  for (const operation of reading) {
    if (!all.includes(operation)) fail(`${api.prefix}: ${operation} is in read.json but not in v1.json`)
  }
  for (const operation of all) {
    const [method, template] = operation.split(" ")
    // Any value matches a parameter: the gateway decides by method and path, not by what the API finds there.
    const path = api.prefix + template.replace(/\{[^}]+\}/g, "x")
    const isRefused = await refused(method, path)
    if (reading.has(operation) && isRefused) fail(`${method.toUpperCase()} ${path} reads, but the gateway refuses it`)
    if (!reading.has(operation) && !isRefused) fail(`${method.toUpperCase()} ${path} writes, but passes the gateway`)
  }

  const document = await json(`${gateway}${api.prefix}/openapi/read.json`)
  const server = document.servers?.[0]?.url?.replace(/\/$/, "") ?? ""
  if (!server.endsWith(api.prefix)) fail(`${api.prefix}/openapi/read.json names the server "${server}", not the gateway`)
  const ui = await fetch(`${gateway}${api.prefix}/docs/index.html`)
  if (!ui.ok) fail(`${api.prefix}/docs/index.html answers ${ui.status} at the gateway`)
  if (!(await refused("get", `${api.prefix}/openapi/v1.json`))) fail(`${api.prefix}/openapi/v1.json passes the gateway`)

  console.log(`${api.prefix}: ${reading.size} of ${all.length} operations pass the gateway`)
}

for (const failure of failures) console.log(`::error file=compose.yaml::${failure}`)
process.exit(failures.length === 0 ? 0 : 1)

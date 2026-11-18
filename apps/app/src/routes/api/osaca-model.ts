import { createFileRoute } from "@tanstack/react-router"

import { NO_SIM_URL, simUrl } from "@/osaca/sim.ts"

/** The file of the 3D model of the OSACA cell, next to the simulation that runs it. */
const MODEL_FILE = "Fertiger_vermessen_V9.glb"

// The host of the model sends no CORS headers, so a browser may not load it from there. The server of the app
// fetches it and passes it on as it is, from the address of the app.
async function model() {
  const sim = simUrl()
  if (sim === null) return new Response(NO_SIM_URL, { status: 503 })
  const MODEL = `${sim}/${MODEL_FILE}`
  try {
    const upstream = await fetch(MODEL)
    if (!upstream.ok || !upstream.body) {
      return new Response(`The model at ${MODEL} answered ${upstream.status}.`, { status: 502 })
    }
    const headers = new Headers({ "content-type": "model/gltf-binary", "cache-control": "public, max-age=3600" })
    const length = upstream.headers.get("content-length")
    if (length) headers.set("content-length", length)
    return new Response(upstream.body, { headers })
  } catch (error) {
    return new Response(`The model at ${MODEL} did not answer: ${String(error)}.`, { status: 502 })
  }
}

export const Route = createFileRoute("/api/osaca-model")({
  server: {
    handlers: { GET: model },
  },
})

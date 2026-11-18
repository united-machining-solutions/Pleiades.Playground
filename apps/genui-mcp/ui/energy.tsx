import { useApp } from "@modelcontextprotocol/ext-apps/react"
import type { App } from "@modelcontextprotocol/ext-apps/react"
import { energySeries, energyShow } from "@pleiades/cards/energy/contract.ts"
import type { EnergySeries, EnergyShow } from "@pleiades/cards/energy/contract.ts"
import { EnergyCard } from "@pleiades/cards/energy/energy-card.tsx"
import type { Lines } from "@pleiades/cards/energy/energy-card.tsx"
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

import { ENERGY_SERIES_TOOL } from "../src/cards/energy.names.ts"
import { lastAsked } from "./latest.ts"
import { Note, takeFont } from "./host.tsx"
import { shownFor } from "./shown.ts"
import type { Shown } from "./shown.ts"
import "./styles.css"

// The energy card as an MCP App: the file a host loads from ui://genui/energy and shows with a
// result of genui_energy_show. The host sends that result. This file checks it against the
// contract of the card and draws the card, the same component the example application draws, with
// the graph of the power, which it asks the server for.

/**
 * The lines of the graph. They are not part of the result, because a language model reads that:
 * the card asks the server for them, through the host, for the hours and machines of the result.
 * Null if they are not to be had, for example where a host lets no card call a tool. The card then
 * stands without its graph.
 */
async function seriesOf(app: App, values: EnergyShow): Promise<EnergySeries | null> {
  if (values.machines.length === 0) return null
  try {
    const result = await app.callServerTool({
      name: ENERGY_SERIES_TOOL,
      arguments: { from: values.from, to: values.to, machines: values.machines.map((one) => one.machine) },
    })
    const series = energySeries.safeParse(result.structuredContent)
    return series.success ? series.data : null
  } catch {
    return null
  }
}

/** The lines of the newest result only: a host may send a second result before the first is answered. */
const askLines = lastAsked()

function Energy() {
  const [shown, setShown] = useState<Shown<EnergyShow>>()
  const [series, setSeries] = useState<Lines>()
  const { app, isConnected, error } = useApp({
    appInfo: { name: "pleiades-energy-card", version: "0.1.0" },
    capabilities: {},
    // Before the handshake, so that no result is missed.
    onAppCreated(created) {
      created.addEventListener("toolresult", (result) => {
        const next = shownFor(result, energyShow, "an energy card")
        setShown(next)
        setSeries(undefined)
        if ("values" in next) askLines(seriesOf(created, next.values), setSeries)
      })
      created.addEventListener("hostcontextchanged", takeFont)
    },
  })
  useEffect(() => {
    if (app && isConnected) takeFont(app.getHostContext())
  }, [app, isConnected])

  if (error) return <Note>No host answered: {error.message}</Note>
  // Nothing to show until the host sends the result.
  if (!shown) return null
  if (!("values" in shown)) return <Note>{shown.note}</Note>
  return <EnergyCard {...shown.values} series={series} />
}

createRoot(document.getElementById("root")!).render(
  // The card fills the width the host gives it. Its ring lies outside its box: the padding keeps
  // the host from cutting it off.
  <div className="p-1">
    <Energy />
  </div>,
)

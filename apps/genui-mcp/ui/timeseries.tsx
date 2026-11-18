import { useApp } from "@modelcontextprotocol/ext-apps/react"
import type { App } from "@modelcontextprotocol/ext-apps/react"
import { timeseriesSeries, timeseriesShow, timeseriesSignals } from "@pleiades/cards/timeseries/contract.ts"
import type { TimeseriesShow } from "@pleiades/cards/timeseries/contract.ts"
import { TimeseriesCard } from "@pleiades/cards/timeseries/timeseries-card.tsx"
import type { AskSeries, AskSignals } from "@pleiades/cards/timeseries/timeseries-card.tsx"
import { useEffect, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"

import { TIMESERIES_SERIES_TOOL, TIMESERIES_SIGNALS_TOOL } from "../src/cards/timeseries.names.ts"
import { Note, takeFont } from "./host.tsx"
import { shownFor } from "./shown.ts"
import type { Shown } from "./shown.ts"
import "./styles.css"

// The time series card as an MCP App: the file a host loads from ui://genui/timeseries and shows with a
// result of genui_timeseries_show. The host sends that result. This file checks it against the
// contract of the card and draws the card, the same component the example application draws. The
// card asks the server for its lines, and for what a person can add, through the host.

/**
 * What the card asks the server for, through the host. Null if it is not to be had, for example
 * where a host lets no card call a tool: the card then says that the lines could not be read.
 */
function askersOf(app: App): { askSeries: AskSeries; askSignals: AskSignals } {
  return {
    async askSeries(ask) {
      try {
        const result = await app.callServerTool({ name: TIMESERIES_SERIES_TOOL, arguments: ask })
        const series = timeseriesSeries.safeParse(result.structuredContent)
        return series.success ? series.data : null
      } catch {
        return null
      }
    },
    async askSignals() {
      try {
        const result = await app.callServerTool({ name: TIMESERIES_SIGNALS_TOOL, arguments: {} })
        const signals = timeseriesSignals.safeParse(result.structuredContent)
        return signals.success ? signals.data : null
      } catch {
        return null
      }
    },
  }
}

function Timeseries() {
  const [shown, setShown] = useState<Shown<TimeseriesShow>>()
  const { app, isConnected, error } = useApp({
    appInfo: { name: "pleiades-timeseries-card", version: "0.1.0" },
    capabilities: {},
    // Before the handshake, so that no result is missed.
    onAppCreated(created) {
      created.addEventListener("toolresult", (result) => setShown(shownFor(result, timeseriesShow, "a time series card")))
      created.addEventListener("hostcontextchanged", takeFont)
    },
  })
  useEffect(() => {
    if (app && isConnected) takeFont(app.getHostContext())
  }, [app, isConnected])
  const askers = useMemo(() => (app ? askersOf(app) : undefined), [app])

  if (error) return <Note>No host answered: {error.message}</Note>
  // Nothing to show until the host sends the result.
  if (!shown || !askers) return null
  if (!("values" in shown)) return <Note>{shown.note}</Note>
  // A new result is a new card: its lines and range start from that result.
  return <TimeseriesCard key={JSON.stringify([shown.values.to, shown.values.lines.map((line) => line.topic)])} values={shown.values} {...askers} />
}

createRoot(document.getElementById("root")!).render(
  // The card fills the width the host gives it. Its ring lies outside its box: the padding keeps
  // the host from cutting it off.
  <div className="p-1">
    <Timeseries />
  </div>,
)

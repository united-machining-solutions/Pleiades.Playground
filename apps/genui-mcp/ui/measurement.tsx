import { applyHostFonts, useApp } from "@modelcontextprotocol/ext-apps/react"
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps/react"
import { measurementList, measurementSeries } from "@pleiades/cards/measurement/contract.ts"
import type { MeasurementList, MeasurementSeries } from "@pleiades/cards/measurement/contract.ts"
import { MeasurementCards } from "@pleiades/cards/measurement/measurement-card.tsx"
import { MeasurementGraph } from "@pleiades/cards/measurement/measurement-graph.tsx"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { createRoot } from "react-dom/client"

import { MEASUREMENT_SERIES_TOOL } from "../src/cards/measurement.names.ts"
import "./styles.css"

// The measurement card as an MCP App: the file a host loads from ui://genui/measurement and shows
// with a result of genui_measurement_list. The host sends that result. This file checks it against
// the contract of the card and draws the cards, the same component the example application draws,
// and below them the graphs of the last minutes, which it asks the server for.

type Shown = { values: MeasurementList } | { note: string }

/** What to draw for a result: the cards, or a sentence if the result holds none. */
function shownFor(result: { isError?: boolean; content?: ReadonlyArray<unknown>; structuredContent?: unknown }): Shown {
  const values = measurementList.safeParse(result.structuredContent)
  if (values.success) return { values: values.data }
  // A tool that failed says why in its first block of text.
  const [first] = result.content ?? []
  const said = typeof first === "object" && first !== null && "text" in first ? first.text : undefined
  return { note: result.isError && typeof said === "string" ? said : "This result is not a measurement card." }
}

/**
 * The lines of the graphs. They are not part of the result, because a language model reads that:
 * the card asks the server for them, through the host. Null if they are not to be had, for example
 * where a host lets no card call a tool. The card then stands without its graphs.
 */
async function seriesOf(app: App): Promise<MeasurementSeries | null> {
  try {
    const result = await app.callServerTool({ name: MEASUREMENT_SERIES_TOOL, arguments: {} })
    const series = measurementSeries.safeParse(result.structuredContent)
    return series.success ? series.data : null
  } catch {
    return null
  }
}

/** The font of the host, so the card reads like the conversation around it. The colours stay the card's own. */
function takeFont(context: McpUiHostContext | undefined) {
  const fonts = context?.styles?.css?.fonts
  if (fonts) applyHostFonts(fonts)
  const sans = context?.styles?.variables?.["--font-sans"]
  if (sans) document.documentElement.style.setProperty("--font-sans", sans)
}

/** A graph for each quantity, with the lines of the machines of the result only. */
function Graphs({ values, series }: { values: MeasurementList; series: MeasurementSeries }) {
  // The machines in the order of the result, so that each keeps its colour in every graph.
  const machines = values.machines.map((one) => one.machine)
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,28rem),1fr))] gap-3">
      {series.quantities.map((one) => (
        <MeasurementGraph
          key={one.quantity}
          series={{
            ...one,
            lines: one.lines.filter((line) => machines.includes(line.machine)),
            from: series.from,
            to: series.to,
            instants: series.instants,
          }}
          machines={machines}
          current={values.machines}
        />
      ))}
    </div>
  )
}

function Measurements() {
  const [shown, setShown] = useState<Shown>()
  const [series, setSeries] = useState<MeasurementSeries | null>()
  const { app, isConnected, error } = useApp({
    appInfo: { name: "pleiades-measurement-card", version: "0.1.0" },
    capabilities: {},
    // Before the handshake, so that no result is missed.
    onAppCreated(created) {
      created.addEventListener("toolresult", (result) => {
        const next = shownFor(result)
        setShown(next)
        setSeries(undefined)
        if ("values" in next) void seriesOf(created).then(setSeries)
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
  return (
    <div className="flex flex-col gap-3">
      <MeasurementCards {...shown.values} />
      {series && <Graphs values={shown.values} series={series} />}
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

createRoot(document.getElementById("root")!).render(
  // The cards fill the width the host gives them. Their ring lies outside their box: the padding
  // keeps the host from cutting it off.
  <div className="p-1">
    <Measurements />
  </div>,
)

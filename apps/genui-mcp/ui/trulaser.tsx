import { useApp } from "@modelcontextprotocol/ext-apps/react"
import type { App } from "@modelcontextprotocol/ext-apps/react"
import {
  trulaserCollision,
  trulaserConditions,
  trulaserDevices,
  trulaserJobOrder,
  trulaserSeries,
  trulaserStatus,
  trulaserTechnology,
  trulaserTimeline,
} from "@pleiades/cards/trulaser/contract.ts"
import type { ConditionKey, TimelineView, TrulaserSeries, TrulaserTimeline } from "@pleiades/cards/trulaser/contract.ts"
import {
  CollisionCard,
  ConditionsCard,
  DevicesCard,
  JobOrderCard,
  StatusWithHistory,
  TechnologyCard,
} from "@pleiades/cards/trulaser/trulaser-cards.tsx"
import { useCallback, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

import { TRULASER_SERIES_TOOL, TRULASER_TIMELINE_TOOL } from "../src/cards/trulaser.names.ts"
import { Note, takeFont } from "./host.tsx"
import { shownFor as shownOf } from "./shown.ts"
import type { Result } from "./shown.ts"
import "./styles.css"

// The TruLaser cards as an MCP App: the file a host loads from ui://genui/trulaser and shows with a
// result of any of the six tools of the cards. The host sends that result. This file finds the card
// whose contract it keeps and draws it, the same component the example application draws.

/** The card a result keeps the contract of, or the sentence of `shownFor` if it keeps none. */
function shownFor(result: Result) {
  const card = "a TruLaser card"
  const status = shownOf(result, trulaserStatus, card)
  if ("values" in status) return { card: "status" as const, values: status.values }
  const jobOrder = shownOf(result, trulaserJobOrder, card)
  if ("values" in jobOrder) return { card: "jobOrder" as const, values: jobOrder.values }
  const devices = shownOf(result, trulaserDevices, card)
  if ("values" in devices) return { card: "devices" as const, values: devices.values }
  const technology = shownOf(result, trulaserTechnology, card)
  if ("values" in technology) return { card: "technology" as const, values: technology.values }
  const collision = shownOf(result, trulaserCollision, card)
  if ("values" in collision) return { card: "collision" as const, values: collision.values }
  const conditions = shownOf(result, trulaserConditions, card)
  if ("values" in conditions) return { card: "conditions" as const, values: conditions.values }
  return { card: "note" as const, note: conditions.note }
}
type Shown = ReturnType<typeof shownFor>

/**
 * The timelines of a view, through the host. They are not part of a result, because a language model
 * reads that. Null if they are not to be had, for example where a host lets no card call a tool.
 */
async function timelineOf(app: App, machine: string, view: TimelineView, hours: number): Promise<TrulaserTimeline | null> {
  try {
    const result = await app.callServerTool({ name: TRULASER_TIMELINE_TOOL, arguments: { machine, view, hours } })
    const read = trulaserTimeline.safeParse(result.structuredContent)
    return read.success ? read.data : null
  } catch {
    return null
  }
}

/** The values of one tile over time, for its chart, through the host. */
async function seriesOf(app: App, machine: string, key: ConditionKey): Promise<TrulaserSeries | null> {
  try {
    const result = await app.callServerTool({ name: TRULASER_SERIES_TOOL, arguments: { machine, key, hours: 1 } })
    const read = trulaserSeries.safeParse(result.structuredContent)
    return read.success ? read.data : null
  } catch {
    return null
  }
}

function Trulaser() {
  const [shown, setShown] = useState<Shown>()
  const { app, isConnected, error } = useApp({
    appInfo: { name: "pleiades-trulaser-card", version: "0.2.0" },
    capabilities: {},
    // Before the handshake, so that no result is missed.
    onAppCreated(created) {
      created.addEventListener("toolresult", (result) => setShown(shownFor(result)))
      created.addEventListener("hostcontextchanged", takeFont)
    },
  })
  useEffect(() => {
    if (app && isConnected) takeFont(app.getHostContext())
  }, [app, isConnected])

  const machine = shown && shown.card !== "note" ? shown.values.machine : null
  const readTimeline = useCallback(
    (view: TimelineView, asked: number) => (app && machine !== null ? timelineOf(app, machine, view, asked) : Promise.resolve(null)),
    [app, machine],
  )
  const readSeries = useCallback(
    (key: ConditionKey) => (app && machine !== null ? seriesOf(app, machine, key) : Promise.resolve(null)),
    [app, machine],
  )

  if (error) return <Note>No host answered: {error.message}</Note>
  // Nothing to show until the host sends the result.
  if (!shown) return null
  switch (shown.card) {
    case "status":
      // State.Status shows its history below it, which the card asks for itself.
      return <StatusWithHistory status={shown.values} readTimeline={readTimeline} />
    case "jobOrder":
      return <JobOrderCard jobOrder={shown.values} readTimeline={readTimeline} />
    case "devices":
      return <DevicesCard devices={shown.values} readTimeline={readTimeline} />
    case "technology":
      return <TechnologyCard technology={shown.values} />
    case "collision":
      return <CollisionCard collision={shown.values} />
    case "conditions":
      return <ConditionsCard conditions={shown.values} readSeries={readSeries} />
    case "note":
      return <Note>{shown.note}</Note>
  }
}

createRoot(document.getElementById("root")!).render(
  // The card fills the width the host gives it. Its ring lies outside its box: the padding keeps
  // the host from cutting it off.
  <div className="p-1">
    <Trulaser />
  </div>,
)

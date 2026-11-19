import { useApp } from "@modelcontextprotocol/ext-apps/react"
import type { App } from "@modelcontextprotocol/ext-apps/react"
import { jobOrderShow, jobOrderTimeline } from "@pleiades/cards/joborder/contract.ts"
import type { JobOrderShow, JobOrderTimeline } from "@pleiades/cards/joborder/contract.ts"
import { JobOrderCard } from "@pleiades/cards/joborder/joborder-card.tsx"
import type { Timeline } from "@pleiades/cards/joborder/joborder-card.tsx"
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

import { JOB_ORDER_TIMELINE_TOOL } from "../src/cards/joborder.names.ts"
import { lastAsked } from "./latest.ts"
import { Note, takeFont } from "./host.tsx"
import { shownFor } from "./shown.ts"
import type { Shown } from "./shown.ts"
import "./styles.css"

// The job order card as an MCP App: the file a host loads from ui://genui/joborder and shows with a
// result of genui_job_order_show. The host sends that result. This file checks it against the contract
// of the card and draws the card, the same component the example application draws, with the timeline,
// which it asks the server for.

/**
 * The timeline. It is not part of the result, because a language model reads that: the card asks the
 * server for it, through the host, for the machine and the hours of the result. Null if it is not to be
 * had, for example where a host lets no card call a tool. The card then says so.
 */
async function timelineOf(app: App, values: JobOrderShow): Promise<JobOrderTimeline | null> {
  try {
    const result = await app.callServerTool({
      name: JOB_ORDER_TIMELINE_TOOL,
      arguments: { machine: values.machine, from: values.from, to: values.asOf },
    })
    const timeline = jobOrderTimeline.safeParse(result.structuredContent)
    return timeline.success ? timeline.data : null
  } catch {
    return null
  }
}

/** The timeline of the newest result only: a host may send a second result before the first is answered. */
const askTimeline = lastAsked()

function JobOrder() {
  const [shown, setShown] = useState<Shown<JobOrderShow>>()
  const [timeline, setTimeline] = useState<Timeline>()
  const { app, isConnected, error } = useApp({
    appInfo: { name: "pleiades-joborder-card", version: "0.1.0" },
    capabilities: {},
    // Before the handshake, so that no result is missed.
    onAppCreated(created) {
      created.addEventListener("toolresult", (result) => {
        const next = shownFor(result, jobOrderShow, "a job order card")
        setShown(next)
        setTimeline(undefined)
        if ("values" in next) askTimeline(timelineOf(created, next.values), setTimeline)
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
  return <JobOrderCard {...shown.values} timeline={timeline} />
}

createRoot(document.getElementById("root")!).render(
  // The card fills the width the host gives it. Its ring lies outside its box: the padding keeps the
  // host from cutting it off.
  <div className="p-1">
    <JobOrder />
  </div>,
)

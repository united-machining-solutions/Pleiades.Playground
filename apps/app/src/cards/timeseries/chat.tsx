import type { ChatTool } from "@/chat/tool-results.ts"

import { TIMESERIES_SERIES_TOOL, TIMESERIES_SIGNALS_TOOL } from "@/machines/card-tools.ts"
import { timeseriesShowOf } from "./results.ts"
import { ShownTimeseries } from "./shown-timeseries.tsx"

// The time series card in the chat: what a call of each of its tools is called, and what the chat draws
// for a result. chat/cards.tsx lists this module.

export const timeseriesTools: ReadonlyArray<ChatTool> = [
  {
    name: "genui_timeseries_show",
    label: {
      running: "Reading the time series",
      done: "Read the time series",
      failed: "Failed to read the time series",
    },
    draw(content) {
      const values = timeseriesShowOf(content)
      return values && <ShownTimeseries values={values} />
    },
  },
  // The lines of the graph and what a person can add: the card asks for them itself, see machines/get-machines.ts.
  { name: TIMESERIES_SERIES_TOOL, cardOnly: true },
  { name: TIMESERIES_SIGNALS_TOOL, cardOnly: true },
]

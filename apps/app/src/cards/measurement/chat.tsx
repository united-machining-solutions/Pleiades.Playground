import { MeasurementCards } from "@pleiades/cards/measurement/measurement-card.tsx"

import type { ChatTool } from "@/chat/tool-results.ts"

import { MEASUREMENT_SERIES_TOOL } from "@/machines/card-tools.ts"
import { measurementListOf } from "./results.ts"

// The measurement card in the chat: what a call of its tool is called, and what the chat draws for
// a result. chat/cards.tsx lists this module.

export const measurementTools: ReadonlyArray<ChatTool> = [
  {
    name: "genui_measurement_list",
    label: {
      running: "Reading the measurements",
      done: "Read the measurements",
      failed: "Failed to read the measurements",
    },
    draw(content) {
      const values = measurementListOf(content)
      return values && <MeasurementCards {...values} />
    },
  },
  // The lines of the graphs: the page asks for them itself, see get-machines.ts.
  { name: MEASUREMENT_SERIES_TOOL, cardOnly: true },
]

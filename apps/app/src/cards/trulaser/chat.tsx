import type { ChatTool } from "@/chat/tool-results.ts"

import { TRULASER_SERIES_TOOL, TRULASER_TIMELINE_TOOL } from "@/machines/card-tools.ts"
import { trulaserShowOf } from "./results.ts"
import { ShownTrulaser } from "./shown-trulaser.tsx"

// The TruLaser card in the chat: what a call of its tool is called, and what the chat draws for a
// result. chat/cards.tsx lists this module.

export const trulaserTools: ReadonlyArray<ChatTool> = [
  {
    name: "genui_trulaser_show",
    label: {
      running: "Reading the TruLaser",
      done: "Read the TruLaser",
      failed: "Failed to read the TruLaser",
    },
    draw(content) {
      const values = trulaserShowOf(content)
      return values && <ShownTrulaser values={values} />
    },
  },
  // The timelines and the charts of the tiles: the card asks for them itself, see get-machines.ts.
  { name: TRULASER_TIMELINE_TOOL, cardOnly: true },
  { name: TRULASER_SERIES_TOOL, cardOnly: true },
]

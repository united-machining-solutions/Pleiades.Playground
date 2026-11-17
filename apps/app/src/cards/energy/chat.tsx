import type { ChatTool } from "@/chat/tool-results.ts"

import { ENERGY_SERIES_TOOL } from "@/machines/card-tools.ts"
import { energyShowOf } from "./results.ts"
import { ShownEnergy } from "./shown-energy.tsx"

// The energy card in the chat: what a call of each of its tools is called, and what the chat draws
// for a result. chat/cards.tsx lists this module.

export const energyTools: ReadonlyArray<ChatTool> = [
  {
    name: "genui_energy_show",
    label: {
      running: "Reading the energy",
      done: "Read the energy",
      failed: "Failed to read the energy",
    },
    draw(content) {
      const values = energyShowOf(content)
      return values && <ShownEnergy values={values} />
    },
  },
  // The lines of the graph: the card asks for them itself, see machines/get-machines.ts.
  { name: ENERGY_SERIES_TOOL, cardOnly: true },
]

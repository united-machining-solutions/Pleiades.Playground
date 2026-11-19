import type { ChatTool } from "@/chat/tool-results.ts"

import { JOB_ORDER_TIMELINE_TOOL } from "@/machines/card-tools.ts"
import { jobOrderShowOf } from "./results.ts"
import { ShownJobOrder } from "./shown-joborder.tsx"

// The job order card in the chat: what a call of each of its tools is called, and what the chat draws for
// a result. chat/cards.tsx lists this module.

export const jobOrderTools: ReadonlyArray<ChatTool> = [
  {
    name: "genui_job_order_show",
    part: "The job order of one machine and its program execution over the last hours",
    label: {
      running: "Reading the job order",
      done: "Read the job order",
      failed: "Failed to read the job order",
    },
    draw(content) {
      const values = jobOrderShowOf(content)
      return values && <ShownJobOrder values={values} />
    },
  },
  // The timeline: the card asks for it itself, see machines/get-machines.ts.
  { name: JOB_ORDER_TIMELINE_TOOL, cardOnly: true },
]

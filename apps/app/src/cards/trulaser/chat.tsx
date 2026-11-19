import {
  CollisionCard,
  ConditionsCard,
  DevicesCard,
  JobOrderCard,
  TechnologyCard,
} from "@pleiades/cards/trulaser/trulaser-cards.tsx"

import type { ChatTool } from "@/chat/tool-results.ts"

import { TRULASER_SERIES_TOOL, TRULASER_TIMELINE_TOOL } from "@/machines/card-tools.ts"
import {
  trulaserCollisionOf,
  trulaserConditionsOf,
  trulaserDevicesOf,
  trulaserJobOrderOf,
  trulaserStatusOf,
  trulaserTechnologyOf,
} from "./results.ts"
import { ShownTrulaserStatus, useReadSeries, useReadTimeline } from "./shown-trulaser.tsx"
import type { TrulaserConditions, TrulaserDevices, TrulaserJobOrder } from "@pleiades/cards/trulaser/contract.ts"

// The TruLaser cards in the chat: what a call of each of their tools is called, and what the chat draws
// for a result. chat/cards.tsx lists this module.

const label = (what: string) => ({
  running: `Reading the ${what} of the TruLaser`,
  done: `Read the ${what} of the TruLaser`,
  failed: `Failed to read the ${what} of the TruLaser`,
})

function ShownJobOrder({ jobOrder }: { jobOrder: TrulaserJobOrder }) {
  return <JobOrderCard jobOrder={jobOrder} readTimeline={useReadTimeline(jobOrder.machine)} />
}

function ShownDevices({ devices }: { devices: TrulaserDevices }) {
  return <DevicesCard devices={devices} readTimeline={useReadTimeline(devices.machine)} />
}

function ShownConditions({ conditions }: { conditions: TrulaserConditions }) {
  return <ConditionsCard conditions={conditions} readSeries={useReadSeries(conditions.machine, 1)} />
}

export const trulaserTools: ReadonlyArray<ChatTool> = [
  {
    name: "genui_trulaser_status",
    label: label("State.Status"),
    draw(content) {
      const values = trulaserStatusOf(content)
      return values && <ShownTrulaserStatus status={values} />
    },
  },
  {
    name: "genui_trulaser_joborder",
    label: label("JobOrder"),
    draw(content) {
      const values = trulaserJobOrderOf(content)
      return values && <ShownJobOrder jobOrder={values} />
    },
  },
  {
    name: "genui_trulaser_devices",
    label: label("AutomationDeviceRequestStates"),
    draw(content) {
      const values = trulaserDevicesOf(content)
      return values && <ShownDevices devices={values} />
    },
  },
  {
    name: "genui_trulaser_technology",
    label: label("LaserTechnology"),
    draw(content) {
      const values = trulaserTechnologyOf(content)
      return values && <TechnologyCard technology={values} />
    },
  },
  {
    name: "genui_trulaser_collision",
    label: label("CollisionData"),
    draw(content) {
      const values = trulaserCollisionOf(content)
      return values && <CollisionCard collision={values} />
    },
  },
  {
    name: "genui_trulaser_conditions",
    label: label("ConditionGuide"),
    draw(content) {
      const values = trulaserConditionsOf(content)
      return values && <ShownConditions conditions={values} />
    },
  },
  // The timelines and the charts of the tiles: the cards ask for them themselves, see get-machines.ts.
  { name: TRULASER_TIMELINE_TOOL, cardOnly: true },
  { name: TRULASER_SERIES_TOOL, cardOnly: true },
]

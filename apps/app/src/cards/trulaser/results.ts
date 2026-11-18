import {
  trulaserCollision,
  trulaserConditions,
  trulaserDevices,
  trulaserJobOrder,
  trulaserStatus,
  trulaserTechnology,
} from "@pleiades/cards/trulaser/contract.ts"
import type { z } from "zod"

import { jsonOf } from "../../chat/tool-results.ts"

// The values of the TruLaser cards in the result of a tool call, as a chat has it. They are checked
// against the contract of the card: what does not keep it is not drawn.

function reader<TSchema extends z.ZodType>(schema: TSchema) {
  return (content: unknown): z.infer<TSchema> | null => {
    const read = schema.safeParse(jsonOf(content))
    return read.success ? read.data : null
  }
}

/** The values of State.Status and Notification.ActiveAlerts, from `genui_trulaser_status`. */
export const trulaserStatusOf = reader(trulaserStatus)
/** The values of the JobOrder and its ProgramExecution, from `genui_trulaser_joborder`. */
export const trulaserJobOrderOf = reader(trulaserJobOrder)
/** The values of AutomationDeviceRequestStates, from `genui_trulaser_devices`. */
export const trulaserDevicesOf = reader(trulaserDevices)
/** The values of LaserTechnology, from `genui_trulaser_technology`. */
export const trulaserTechnologyOf = reader(trulaserTechnology)
/** The values of CollisionData, from `genui_trulaser_collision`. */
export const trulaserCollisionOf = reader(trulaserCollision)
/** The values of ConditionGuide, from `genui_trulaser_conditions`. */
export const trulaserConditionsOf = reader(trulaserConditions)

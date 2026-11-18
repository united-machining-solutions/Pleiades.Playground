import { notificationList } from "@pleiades/cards/notification/contract.ts"
import type { NotificationList } from "@pleiades/cards/notification/contract.ts"

import { jsonOf } from "../../chat/tool-results.ts"

// The values of the notification card in the result of a tool call, as a chat has it. They are
// checked against the contract: what does not keep it is not drawn.

/** The notifications in the result of `genui_notification_list`, checked against the contract of the card. */
export function notificationListOf(content: unknown): NotificationList | null {
  const list = notificationList.safeParse(jsonOf(content))
  return list.success ? list.data : null
}

import { sliceOf } from "../shared/paging.ts"
import type { NotificationEntry, NotificationList } from "./contract.ts"

// The pages of the notification card. The result of the tool stays whole and in its order, the ones
// that have not gone first; a person chooses a level and turns the pages of the card, ten
// notifications on one.

/** The levels a person can choose: all of them, or the notifications of one level. */
export const LEVEL_CHOICES = ["all", "Error", "Warning"] as const
export type LevelChoice = (typeof LEVEL_CHOICES)[number]

/** The notifications of the level chosen, in the order of the result. */
export function ofLevel(notifications: ReadonlyArray<NotificationEntry>, level: LevelChoice): ReadonlyArray<NotificationEntry> {
  return level === "all" ? notifications : notifications.filter((one) => one.level === level)
}

/**
 * The totals of the level chosen, as the tool added them up: the other level counts none. The words
 * of the head and the foot take them, so they say what the list shows.
 */
export function levelsOf(levels: NotificationList["levels"], level: LevelChoice): NotificationList["levels"] {
  const none = { count: 0, seconds: 0 }
  if (level === "Error") return { error: levels.error, warning: none }
  if (level === "Warning") return { error: none, warning: levels.warning }
  return levels
}

/** How many notifications a page of the card lists. Up to this many, the card has no pages. */
export const NOTIFICATIONS_PER_PAGE = 10

/** One page of the notifications, and where it lies among all of them. */
export type NotificationPage = {
  notifications: Array<NotificationEntry>
  /** The page shown, from 1. A page beyond the last shows the last. */
  page: number
  pages: number
  /** The place of the first and the last notification of the page, from 1; 0 and 0 without notifications. */
  first: number
  last: number
  total: number
}

/** The notifications of one page, in the order of the result. */
export function notificationPageOf(notifications: ReadonlyArray<NotificationEntry>, page: number): NotificationPage {
  const { items, page: shown, pages, start } = sliceOf(notifications, NOTIFICATIONS_PER_PAGE, page)
  return {
    notifications: items,
    page: shown,
    pages,
    first: items.length === 0 ? 0 : start + 1,
    last: start + items.length,
    total: notifications.length,
  }
}

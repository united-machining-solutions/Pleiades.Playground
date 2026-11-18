import { written } from "../machine/format.ts"
import { labelOf } from "../machine/in-words.ts"
import type { NotificationEntry, NotificationList } from "./contract.ts"
import { levelsInWords, outcomeText, stamped, totalsInWords } from "./words.ts"

// The notification card in words, for a reader that does not see it: a language model reads these
// lines as the result of the tool, and a host without cards shows them. The list is short on
// purpose: the card has every row.

/** How many notifications the words name. */
export const NAMED = 8

/** One alert in a line: what it was, when it came, and what became of it. */
export function entryInWords(entry: NotificationEntry, asOf: string): string {
  const time = (instant: string) => stamped(instant, asOf)
  const became = entry.goneAt === null ? "has not gone" : outcomeText(entry, time).text
  const earlier = entry.beforeRange ? ", raised before the range" : ""
  const code = entry.notificationId ? ` ${entry.notificationId}` : ""
  return `${entry.level}${code} "${entry.title}": raised ${time(entry.raisedAt)}, ${became}${earlier}`
}

/** The list in words: the counts, the first notifications, the sums, and what is missing. */
export function notificationListInWords(list: NotificationList): string {
  const { asOf, from, notifications, omitted, hasMore, total, open } = list
  const machine = `${labelOf(list.machine)} (${list.machine})`
  if (total === 0) {
    const none = `${machine}: no warning or error stood between ${stamped(from, asOf)} and ${written(asOf)}.`
    return hasMore ? `${none} The Events API had more than it returned, so older ones may be missing.` : none
  }
  const counted = `${hasMore ? "at least " : ""}${levelsInWords(list)}${open > 0 ? `, ${open} open` : ""}`
  const lines = [`${machine}, ${written(from)} to ${written(asOf)}: ${counted}.`]
  lines.push(...notifications.slice(0, NAMED).map((one) => `- ${entryInWords(one, asOf)}`))
  const unnamed = total - Math.min(notifications.length, NAMED)
  if (unnamed > 0) lines.push(`${unnamed} more are on the card.${omitted > 0 ? ` ${omitted} of them are not in the result.` : ""}`)
  lines.push(`${totalsInWords(list)}.`)
  if (hasMore) lines.push("The Events API had more alerts than it returned: the oldest are missing and the counts are lower bounds.")
  return lines.join("\n")
}

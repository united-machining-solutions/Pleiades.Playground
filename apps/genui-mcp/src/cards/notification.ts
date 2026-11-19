import { MACHINE_NAMING, machineId } from "@pleiades/cards/machine/contract.ts"
import { notificationList } from "@pleiades/cards/notification/contract.ts"
import { notificationListInWords } from "@pleiades/cards/notification/in-words.ts"
import { toolDefinition } from "@tanstack/ai"
import { z } from "zod"

import { card } from "../card.ts"
import { MOST_NOTIFICATION_HOURS, NOTIFICATION_HOURS, listNotifications } from "../notifications.ts"
import { inTimeZoneOf, knownTimeZone } from "../time.ts"
import { inWords, readOnly, timeZone } from "../tool.ts"
import type { Context } from "../tool.ts"

// The notification card: the warnings and errors of one machine with when each came, when it went
// and how long it stood. What reads them is in notifications.ts.

/** The notification card as a file for other hosts. The example application draws the card itself. */
export const NOTIFICATION_CARD_URI = "ui://genui/notification"

const shownAsCard =
  "Where the host shows MCP Apps, the person already sees this result as the notification card: a row for each warning and error with when it was raised, when it went and how long it stood. Then a sentence or two is the whole answer. Do not list the notifications again."

const notificationListTool = toolDefinition({
  name: "genui_notification_list",
  description:
    "List the warnings and errors of one machine over the last hours: each alert once, with when it was raised, when it was cleared and how long it stood, or that it has not gone. Those that have not gone come first. The result says it in a few lines and carries the values of the notification card. Name the machine by its id or as people call it: a machine that published no value in the last 24 hours is refused. Which machines have open alerts now is in genui_machine_list.",
  inputSchema: z.object({
    machine: machineId.describe(MACHINE_NAMING),
    hours: z
      .number()
      .int()
      .min(1)
      .max(MOST_NOTIFICATION_HOURS)
      .optional()
      .describe(`How many hours back the list goes, ${NOTIFICATION_HOURS} if omitted and ${MOST_NOTIFICATION_HOURS} at most.`),
    timeZone,
  }),
  outputSchema: notificationList,
  metadata: { title: "List notifications", annotations: readOnly, _meta: { ui: { resourceUri: NOTIFICATION_CARD_URI } } },
}).server<Context>(async (input, ctx) => {
  const zone = knownTimeZone(input.timeZone)
  const list = inTimeZoneOf(await listNotifications(ctx.context.apis, input.machine, input.hours), zone)
  return inWords(list, `${notificationListInWords(list)}\n\n${shownAsCard}`)
})

const notificationGuide = `## Notifications

\`genui_notification_list\` lists the alerts of one machine that stood at any time in the last \`hours\`:
each alert once, the ones that have not gone first, then the others with the newest first. Name the
machine (\`machine\`) by its id or as people call it, and pass the \`timeZone\` of the person you answer,
if you know it.

- \`raisedAt\` and \`goneAt\` are when the alert came and when it was cleared. \`goneAt\` is null as long
  as it stands: \`open\` is true. An alert that has not gone is, as a rule, also one of \`notifications\`
  of the machine in \`genui_machine_list\`. Where the two differ, this list is the one to trust for one
  machine: the list of machines reads the alerts of every machine in one page of 1000 and, where more
  stood in 24 hours, may miss open ones.
- \`notificationId\` is the error code of the manufacturer, \`title\` its message, \`severity\` its category
  after NAMUR NE 107. A \`Failure\` is an error (\`level\`), every other category a warning.
- \`durationSeconds\` is how long it stood, in seconds, from \`raisedAt\` to \`goneAt\`: its whole
  duration, not only the part in the range. It is null while the alert stands. Do not work out a
  duration of your own, and never one for an alert that has not gone: say that it has not gone, and
  since when.
- \`beforeRange\` is true for an alert that was raised before the range and stood into it. It keeps
  its real \`raisedAt\`.
- An alert that has not gone and was raised more than 24 hours before \`asOf\` is not listed, as the
  list of machines names none that old either: an empty list does not rule it out.
- A \`machine\` that names no machine that published a value in the last 24 hours is refused, with the
  ids that did; one that fits several, such as a serial number two makers use, with their ids.
- \`hasMore\` is true if the Events API had more alerts than it returned, 1000 at most, the oldest
  missing. The counts are then lower bounds: say "at least".
- \`notifications\` holds at most 50. \`total\`, \`open\`, \`gone\` and \`omitted\` count all that were
  found. \`levels\` has the count and the time of the errors and of the warnings in the range, in
  seconds, added up: each alert from \`raisedAt\` or \`from\`, whichever is later, to \`goneAt\`, or to
  \`asOf\` while it has not gone. The part of an alert before \`from\` is not in it, so a total never
  exceeds the range times the count. Say a total as it is, and do not add up durations yourself.
`

export const notificationCard = card({
  tools: [notificationListTool],
  describes: [
    "- genui_notification_list: the warnings and errors of one machine over the last hours, each with when it was raised, when it was cleared and how long it stood.",
  ],
  guide: notificationGuide,
  file: { name: "notification", uri: NOTIFICATION_CARD_URI },
})

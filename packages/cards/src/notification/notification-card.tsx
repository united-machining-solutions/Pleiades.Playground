import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@pleiades/ui/components/item"
import { Fragment } from "react"

import { cardRange } from "../energy/words.ts"
import { clock } from "../machine/format.ts"
import { labelOf } from "../machine/in-words.ts"
import { StateSymbol } from "../machine/state-symbol.tsx"
import type { NotificationEntry, NotificationList } from "./contract.ts"
import { levelsInWords, outcomeText, totalsInWords } from "./words.ts"

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" })

/** 09:05, and the day too where it is not the day of `asOf`: 15 Nov 21:40. In the time zone of the browser. */
function stamp(instant: string, asOf: string): string {
  const [day, today] = [new Date(instant), new Date(asOf)]
  return day.toDateString() === today.toDateString() ? clock(instant) : `${dayFormat.format(day)} ${clock(instant)}`
}

/**
 * A name that breaks after its `_` and `/` only, so that the parts of a machine id such as
 * `alcyone-machines_AX-400_P-04` and the levels of its topic stay whole where a line is too short.
 * The title is the model and serial number of the id (`labelOf`), as the legends of the measurements
 * write it; the whole id stands in the topic at the foot.
 */
function Breakable({ text }: { text: string }) {
  return text.split(/(?<=[/_])/).map((part, position) => (
    <Fragment key={position}>
      <span className="whitespace-nowrap">{part}</span>
      <wbr />
    </Fragment>
  ))
}

function Notification({ entry, asOf }: { entry: NotificationEntry; asOf: string }) {
  const time = (instant: string) => stamp(instant, asOf)
  const outcome = outcomeText(entry, time)
  const label = [entry.level, entry.notificationId].filter(Boolean).join(" ")
  return (
    <Item size="sm" role="listitem" className="flex-nowrap items-start">
      {/* As tall as the first line, so the sign sits on it. The error code is the label of the sign. */}
      <ItemMedia variant="icon" className="h-5">
        <StateSymbol state={entry.level === "Error" ? "alarm" : "warning"} label={label} />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-none break-words">{entry.title || entry.notificationId}</ItemTitle>
        <ItemDescription className={outcome.open ? "font-medium text-foreground" : undefined}>{outcome.text}</ItemDescription>
      </ItemContent>
      <ItemContent className="text-right">
        <ItemTitle className="ml-auto tabular-nums">{time(entry.raisedAt)}</ItemTitle>
      </ItemContent>
    </Item>
  )
}

/**
 * The notification card of one machine: the warnings and errors that stood in the range, a row for
 * each, the ones that have not gone first. A row says when the alert came and either that it is
 * still open or what became of it. It draws the result of `genui_notification_list` and computes
 * nothing but the wording.
 */
export function NotificationCard(list: NotificationList) {
  const { machine, asOf, from, topic, notifications, omitted, hasMore, open, total } = list
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="min-w-0 font-semibold group-data-[size=sm]/card:text-base">
          <Breakable text={labelOf(machine)} />
        </CardTitle>
        <CardDescription>{cardRange(from, asOf, Math.round((Date.parse(asOf) - Date.parse(from)) / 3_600_000))}</CardDescription>
        {total > 0 && (
          <CardAction className="max-w-40 text-right text-xs text-muted-foreground tabular-nums">
            {hasMore && "at least "}
            {levelsInWords(list)}
            {open > 0 && (
              <>
                {" · "}
                <span className="font-medium whitespace-nowrap text-foreground">{open} open</span>
              </>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No warning or error stood between {stamp(from, asOf)} and {clock(asOf)}.
            {hasMore && " The Events API had more than it returned, so older ones may be missing."}
          </p>
        ) : (
          <ItemGroup className="gap-0 rounded-lg border has-data-[size=sm]:gap-0">
            {notifications.map((entry, position) => (
              <Fragment key={entry.correlationId}>
                {position > 0 && <ItemSeparator className="my-0" />}
                <Notification entry={entry} asOf={asOf} />
              </Fragment>
            ))}
          </ItemGroup>
        )}
      </CardContent>
      <CardFooter className="block text-xs text-muted-foreground">
        {omitted > 0 && <p>{omitted} more notifications are not listed.</p>}
        {hasMore && total > 0 && (
          <p>The Events API had more than it returned: the oldest are missing, so the counts are lower bounds.</p>
        )}
        {total > 0 && <p>{totalsInWords(list)}.</p>}
        <p>
          Read at {clock(asOf)} from <Breakable text={topic} />
        </p>
      </CardFooter>
    </Card>
  )
}

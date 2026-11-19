import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"
import { Fragment, useState } from "react"

import { cardRange } from "../energy/words.ts"
import { clock } from "../machine/format.ts"
import { labelOf } from "../machine/in-words.ts"
import { Pages } from "../shared/pages.tsx"
import { SmoothHeight } from "../shared/smooth-height.tsx"
import type { NotificationList } from "./contract.ts"
import { NotificationTable } from "./notification-table.tsx"
import { LEVEL_CHOICES, levelsOf, notificationPageOf, ofLevel } from "./pages.ts"
import type { LevelChoice } from "./pages.ts"
import { levelsInWords } from "./words.ts"

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" })

/** 09:05, and the day too where it is not the day of `asOf`: 15 Nov 21:40. In the time zone of the browser. */
function stamp(instant: string, asOf: string): string {
  const [day, today] = [new Date(instant), new Date(asOf)]
  return day.toDateString() === today.toDateString() ? clock(instant) : `${dayFormat.format(day)} ${clock(instant)}`
}

/**
 * A name that breaks after its `_` and `/` only, so that the parts of a machine id such as
 * `alcyone-machines_AX-400_P-04` stay whole where a line is too short. The title is the model and
 * serial number of the id (`labelOf`), as the legends of the measurements write it.
 */
function Breakable({ text }: { text: string }) {
  return text.split(/(?<=[/_])/).map((part, position) => (
    <Fragment key={position}>
      <span className="whitespace-nowrap">{part}</span>
      <wbr />
    </Fragment>
  ))
}

/** What the card says where the level chosen has none in the range. */
const noneOf: Record<LevelChoice, string> = { all: "warning or error", Error: "error", Warning: "warning" }

/** What each level is called on its toggle. */
const levelLabel: Record<LevelChoice, string> = { all: "All", Error: "Errors", Warning: "Warnings" }

/** All notifications, or those of one level. A level the range has none of cannot be chosen. */
function LevelToggle({
  level,
  levels,
  onChange,
}: {
  level: LevelChoice
  levels: NotificationList["levels"]
  onChange: (level: LevelChoice) => void
}) {
  const countOf: Record<LevelChoice, number> = { all: levels.error.count + levels.warning.count, Error: levels.error.count, Warning: levels.warning.count }
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      aria-label="Level"
      value={[level]}
      onValueChange={(chosen) => {
        const next = LEVEL_CHOICES.find((one) => one === chosen[0])
        if (next !== undefined && next !== level) onChange(next)
      }}
    >
      {LEVEL_CHOICES.map((one) => (
        <ToggleGroupItem key={one} value={one} disabled={countOf[one] === 0} className="px-2.5">
          {levelLabel[one]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/**
 * The notification card of one machine: the warnings and errors that stood in the range, a row of a
 * table for each, the ones that have not gone first. A row says when the alert was raised, when it was
 * cleared or that it is still open, and how long it stood. It draws the result of
 * `genui_notification_list` and computes nothing but the wording. Under the table it says when
 * the list is shorter than the counts in the head: how many notifications of the level chosen are not
 * listed, and that the Events API had more than it returned. Its foot names when it was read and from which topic, as the
 * other cards do, so its rows can be traced to the broker. The sums of the levels stand in the words of
 * the result, for a language model, not on the card.
 *
 * A person chooses all of them or the errors or the warnings; ten notifications stand on a page, a
 * person turns the pages, and the card eases to the height of the new one. The counts in the head
 * are those of the level chosen. The result stays whole and in its order:
 * level and page are the state of the card, and what they compute is in pages.ts.
 *
 * `bare` draws it without its frame, its head and its foot, for a page that puts it into a card of
 * its own and names the machine and the hours there: the counts then stand above the notifications.
 */
export function NotificationCard({ bare = false, ...list }: NotificationList & { bare?: boolean }) {
  const { machine, asOf, from, topic, notifications, hasMore, open, total } = list
  const [level, setLevel] = useState<LevelChoice>("all")
  const [page, setPage] = useState(1)
  const listed = ofLevel(notifications, level)
  const view = notificationPageOf(listed, page)
  const levels = levelsOf(list.levels, level)
  const shownOpen = level === "all" ? open : listed.filter((one) => one.open).length
  const shownTotal = levels.error.count + levels.warning.count
  const counts = shownTotal > 0 && (
    <>
      {hasMore && "at least "}
      {levelsInWords({ levels })}
      {shownOpen > 0 && (
        <>
          {" · "}
          <span className="font-medium whitespace-nowrap text-foreground">{shownOpen} open</span>
        </>
      )}
    </>
  )
  const choice = total > 0 && (
    <LevelToggle
      level={level}
      levels={list.levels}
      onChange={(next) => {
        setLevel(next)
        setPage(1)
      }}
    />
  )
  // The head counts every notification of the level in the range; the table lists what the tool
  // returned of them. Where the two differ, the card says so: "60 warnings" would stand over "1–10 of
  // 50" with no word on the rest, and a level whose notifications all lie beyond the list would read as
  // if it had none.
  const notShown = shownTotal - listed.length
  const notListed = (notShown > 0 || hasMore) && (
    <p className="text-xs text-muted-foreground">
      {notShown > 0 && `${notShown} ${notShown === 1 ? "notification is" : "notifications are"} not listed here.`}
      {notShown > 0 && hasMore && " "}
      {hasMore && "The Events API had more than it returned: the oldest are missing, so the counts are lower bounds."}
    </p>
  )
  const none = shownTotal === 0 && (
    <p className="text-sm text-muted-foreground">
      {bare ? "Nothing in this range." : `No ${noneOf[level]} stood between ${stamp(from, asOf)} and ${clock(asOf)}.`}
    </p>
  )
  const pages = view.pages > 1 && (
    <Pages page={view.page} pages={view.pages} onPage={setPage}>
      <p className="text-xs text-muted-foreground tabular-nums">
        {view.first}–{view.last} of {view.total}
      </p>
    </Pages>
  )
  // A row for each notification, with a column each for when it was raised, when it was cleared and how
  // long it stood; where the card is narrow, as in the chat, the last two stand under the message.
  const rows = <NotificationTable notifications={view.notifications} time={(instant) => stamp(instant, asOf)} turn={`${level}:${view.page}`} />
  const content =
    listed.length === 0 ? (
      <div className="flex flex-col gap-3">
        {none}
        {notListed}
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        <SmoothHeight>{rows}</SmoothHeight>
        {pages}
        {notListed}
      </div>
    )
  if (bare) {
    return (
      <div className="flex flex-col gap-3">
        {(choice || counts) && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {choice}
            {counts && <p className="text-xs text-muted-foreground tabular-nums">{counts}</p>}
          </div>
        )}
        {content}
      </div>
    )
  }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="min-w-0 font-semibold group-data-[size=sm]/card:text-base">
          <Breakable text={labelOf(machine)} />
        </CardTitle>
        <CardDescription>{cardRange(from, asOf, Math.round((Date.parse(asOf) - Date.parse(from)) / 3_600_000))}</CardDescription>
        {counts && <CardAction className="max-w-40 text-right text-xs text-muted-foreground tabular-nums">{counts}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {choice}
        {content}
      </CardContent>
      <CardFooter className="block text-xs break-words text-muted-foreground">
        Read at {clock(asOf)} from <Breakable text={topic} />
      </CardFooter>
    </Card>
  )
}

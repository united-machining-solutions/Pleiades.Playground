import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@pleiades/ui/components/item"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"
import { Fragment, useState } from "react"

import { cardRange } from "../energy/words.ts"
import { clock } from "../machine/format.ts"
import { labelOf } from "../machine/in-words.ts"
import { StateSymbol } from "../machine/state-symbol.tsx"
import { Pages } from "../shared/pages.tsx"
import { SmoothHeight } from "../shared/smooth-height.tsx"
import type { NotificationEntry, NotificationList } from "./contract.ts"
import { LEVEL_CHOICES, levelsOf, notificationPageOf, ofLevel } from "./pages.ts"
import type { LevelChoice } from "./pages.ts"
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
 * The notification card of one machine: the warnings and errors that stood in the range, a row for
 * each, the ones that have not gone first. A row says when the alert came and either that it is
 * still open or what became of it. It draws the result of `genui_notification_list` and computes
 * nothing but the wording.
 *
 * A person chooses all of them or the errors or the warnings; ten notifications stand on a page, a
 * person turns the pages, and the card eases to the height of the new one. The counts in the head
 * and the sums at the foot are those of the level chosen. The result stays whole and in its order:
 * level and page are the state of the card, and what they compute is in pages.ts.
 *
 * `bare` draws it without its frame, its head and its foot, for a page that puts it into a card of its
 * own and names the machine and the hours there: the counts then stand above the list.
 */
export function NotificationCard({ bare = false, ...list }: NotificationList & { bare?: boolean }) {
  const { machine, asOf, from, topic, notifications, omitted, hasMore, open, total } = list
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
  const content =
        listed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {bare ? "Nothing in this range." : `No ${noneOf[level]} stood between ${stamp(from, asOf)} and ${clock(asOf)}.`}
            {hasMore && " The Events API had more than it returned, so older ones may be missing."}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <SmoothHeight>
              {/* When the page changes, its rows fade in; a page with reduced motion skips it. */}
              <ItemGroup key={view.page} className="gap-0 rounded-lg border has-data-[size=sm]:gap-0 motion-safe:animate-card-fade-in">
                {view.notifications.map((entry, position) => (
                  <Fragment key={entry.correlationId}>
                    {position > 0 && <ItemSeparator className="my-0" />}
                    <Notification entry={entry} asOf={asOf} />
                  </Fragment>
                ))}
              </ItemGroup>
            </SmoothHeight>
            {view.pages > 1 && (
              <Pages page={view.page} pages={view.pages} onPage={setPage}>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {view.first}–{view.last} of {view.total}
                </p>
              </Pages>
            )}
          </div>
        )
  const foot = (
    <>
        {omitted > 0 && <p>{omitted} more notifications are not listed.</p>}
        {hasMore && total > 0 && (
          <p>The Events API had more than it returned: the oldest are missing, so the counts are lower bounds.</p>
        )}
        {shownTotal > 0 && <p>{totalsInWords({ levels })}.</p>}
        <p>
          Read at {clock(asOf)} from <Breakable text={topic} />
        </p>
    </>
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
      <CardFooter className="block text-xs text-muted-foreground">{foot}</CardFooter>
    </Card>
  )
}

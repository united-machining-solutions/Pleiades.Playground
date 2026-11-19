import { Skeleton } from "@pleiades/ui/components/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"
import type { ReactNode } from "react"

import { StateSymbol } from "../machine/state-symbol.tsx"
import type { NotificationEntry } from "./contract.ts"
import { outcomeText, span } from "./words.ts"
import type { Time } from "./words.ts"

// The notifications of the card as a table: a row for each alert, when it was raised, when it was
// cleared and how long it stood. Where the table is narrow, as in the panel of the chat, the columns
// of the clearing and the duration give way to a line under the message that says both, so the table
// never scrolls sideways.

/** The head of the table: the same for the rows and for their placeholders. */
function Head() {
  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableHead className="w-8">
          <span className="sr-only">Level</span>
        </TableHead>
        <TableHead>Message</TableHead>
        <TableHead className="text-right @lg/alarms:w-28">Raised</TableHead>
        <TableHead className="hidden w-28 @lg/alarms:table-cell">Cleared</TableHead>
        <TableHead className="hidden w-24 text-right @lg/alarms:table-cell">Duration</TableHead>
      </TableRow>
    </TableHeader>
  )
}

/** The head of the table while its notifications are read: the same cells, grey where the names stand. */
function HeadSkeleton() {
  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableHead className="w-8">
          <Skeleton className="size-3.5 rounded-full" />
        </TableHead>
        <TableHead>
          <Skeleton className="h-3.5 w-16" />
        </TableHead>
        <TableHead className="text-right @lg/alarms:w-28">
          <Skeleton className="ml-auto h-3.5 w-11" />
        </TableHead>
        <TableHead className="hidden w-28 @lg/alarms:table-cell">
          <Skeleton className="h-3.5 w-12" />
        </TableHead>
        <TableHead className="hidden w-24 text-right @lg/alarms:table-cell">
          <Skeleton className="ml-auto h-3.5 w-14" />
        </TableHead>
      </TableRow>
    </TableHeader>
  )
}

/** A line as tall as a line of text of its size, so a placeholder takes the room of the text. */
function Line({ className, children }: { className: string; children: ReactNode }) {
  return <div className={`flex items-center ${className}`}>{children}</div>
}

function Row({ entry, time }: { entry: NotificationEntry; time: Time }) {
  const outcome = outcomeText(entry, time)
  const title = entry.title || entry.notificationId
  return (
    <TableRow>
      <TableCell className="align-top">
        {/* As tall as the first line of the message, so the sign sits on it. */}
        <Line className="h-5">
          <StateSymbol state={entry.level === "Error" ? "alarm" : "warning"} label={entry.level} />
        </Line>
      </TableCell>
      <TableCell className="align-top whitespace-normal">
        <p className="break-words">{title}</p>
        {entry.title && <p className="text-xs text-muted-foreground">{entry.notificationId}</p>}
        <p className={outcome.open ? "font-medium @lg/alarms:hidden" : "text-muted-foreground @lg/alarms:hidden"}>{outcome.text}</p>
      </TableCell>
      <TableCell className="text-right align-top tabular-nums">{time(entry.raisedAt)}</TableCell>
      <TableCell className="hidden align-top tabular-nums @lg/alarms:table-cell">
        {entry.goneAt === null ? <span className="font-medium">still open</span> : time(entry.goneAt)}
      </TableCell>
      <TableCell className="hidden text-right align-top tabular-nums @lg/alarms:table-cell">
        {entry.durationSeconds === null ? <span className="text-muted-foreground">—</span> : span(entry.durationSeconds)}
      </TableCell>
    </TableRow>
  )
}

/**
 * The notifications of one page of the card as a table, in the order of the result. `turn` names the
 * page shown: when it changes, the rows fade in; with reduced motion they do not.
 */
export function NotificationTable({ notifications, time, turn }: { notifications: ReadonlyArray<NotificationEntry>; time: Time; turn: string }) {
  return (
    <div className="@container/alarms">
      <Table>
        <Head />
        <TableBody key={turn} className="motion-safe:animate-card-fade-in">
          {notifications.map((entry) => (
            <Row key={entry.correlationId} entry={entry} time={time} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** The table while its notifications are read: a grey head, and rows of the height of a row with a code. No word of it stands before the values do. */
export function NotificationTableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="@container/alarms" aria-hidden>
      <Table>
        <HeadSkeleton />
        <TableBody>
          {Array.from({ length: rows }, (_, row) => (
            <TableRow key={row} className="hover:bg-transparent">
              <TableCell className="align-top">
                <Line className="h-5">
                  <Skeleton className="size-3.5 rounded-full" />
                </Line>
              </TableCell>
              {/* The bars of the message take a part of the room, so a narrow table keeps to its width. */}
              <TableCell className="w-full align-top">
                <Line className="h-5">
                  <Skeleton className={`h-3.5 ${row % 2 === 0 ? "w-3/4" : "w-1/2"} @lg/alarms:max-w-48`} />
                </Line>
                <Line className="h-4">
                  <Skeleton className="h-3 w-14" />
                </Line>
                <Line className="h-5 @lg/alarms:hidden">
                  <Skeleton className="h-3.5 w-1/2" />
                </Line>
              </TableCell>
              <TableCell className="align-top">
                <Line className="h-5 justify-end">
                  <Skeleton className="h-3.5 w-11" />
                </Line>
              </TableCell>
              <TableCell className="hidden align-top @lg/alarms:table-cell">
                <Line className="h-5">
                  <Skeleton className="h-3.5 w-11" />
                </Line>
              </TableCell>
              <TableCell className="hidden align-top @lg/alarms:table-cell">
                <Line className="h-5 justify-end">
                  <Skeleton className="h-3.5 w-12" />
                </Line>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

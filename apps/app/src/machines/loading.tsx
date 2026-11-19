import type { ReactNode } from "react"

import { MachineCardSkeleton } from "@pleiades/cards/machine/machine-card.tsx"
import { MeasurementTilesSkeleton } from "@pleiades/cards/measurement/measurement-tiles.tsx"
import { NotificationTableSkeleton } from "@pleiades/cards/notification/notification-table.tsx"
import { NOTIFICATIONS_PER_PAGE } from "@pleiades/cards/notification/pages.ts"
import { Card, CardContent, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"

// What the page of a machine shows while it is read: every part in its form and its size, grey where its
// words and values will stand, so nothing moves when they come. No word of the page stands in a
// placeholder, no title, no label, no head of a table, no button: they come with the data, and a reader
// of the screen is told once that the page is being read (`Pending`).

/** The frame of the page of a machine: the same for the page and for its placeholders. */
export const PAGE_FRAME = "mx-auto flex w-full max-w-5xl flex-col gap-6"

/**
 * What is read, as a reader of the screen hears it: the part is busy, and a status says what it waits for.
 * The words are not drawn; the headings of the part come with its data.
 */
export function Pending({ what, children }: { what: string; children: ReactNode }) {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Loading {what}
      </p>
      {children}
    </div>
  )
}

/** The title while it is read, as tall as the button of the switcher. */
function TitleSkeleton() {
  return (
    <span className="flex h-10.5 items-center">
      <Skeleton aria-hidden className="h-6 w-56" />
    </span>
  )
}

/** A line of the head while it is read, as tall as its text. */
export function LineSkeleton({ width }: { width: string }) {
  return (
    <span className="flex h-5 items-center">
      <Skeleton aria-hidden className={`h-3.5 ${width}`} />
    </span>
  )
}

/** The head of the page while it is read: grey where its title, its lines and its actions will stand. It has no heading yet. */
function HeadSkeleton() {
  return (
    <div aria-hidden className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <TitleSkeleton />
        <LineSkeleton width="w-32" />
        <LineSkeleton width="w-24" />
      </div>
      <Skeleton className="h-8 w-52" />
    </div>
  )
}

/** A section of the page while it is read: its card, and grey where its title stands. */
function SectionSkeleton({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex h-6 items-center text-base">
          <Skeleton aria-hidden className="h-4 w-40" />
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/**
 * The alarms while they are read: the section with its title, the choice of the level and the counts
 * grey, and a page of the table. How many rows the page will have is not known yet: it takes the room
 * of a full one, which a machine with alarms over the hours mostly has.
 */
export function AlarmsSkeleton() {
  return (
    <SectionSkeleton>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Skeleton aria-hidden className="h-8 w-42" />
          <Skeleton aria-hidden className="h-3 w-40" />
        </div>
        <NotificationTableSkeleton rows={NOTIFICATIONS_PER_PAGE} />
        <Skeleton aria-hidden className="h-9 w-full" />
      </div>
    </SectionSkeleton>
  )
}

/** Power and energy while they are read: the section with its title, the graph and the table of the energy grey. */
export function PowerAndEnergySkeleton() {
  return (
    <SectionSkeleton>
      <div className="flex flex-col gap-6" aria-hidden>
        <div className="flex flex-col gap-1">
          <span className="flex h-4 items-center">
            <Skeleton className="h-3 w-5" />
          </span>
          <Skeleton className="h-56 w-full" />
        </div>
        {/* The table of the energy, as wide or as narrow as it will be: narrow, its figures stand under the machine. */}
        <div className="@container/energy">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-full">
                  <Skeleton className="h-3.5 w-16" />
                </TableHead>
                {["w-20", "w-12", "w-12"].map((width, column) => (
                  <TableHead key={column} className="hidden @lg/energy:table-cell">
                    <Skeleton className={`ml-auto h-3.5 ${width}`} />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="hover:bg-transparent">
                <TableCell>
                  <span className="flex h-5 items-center">
                    <Skeleton className="h-3.5 w-56 max-w-full" />
                  </span>
                  <span className="flex h-9 items-start justify-between gap-4 @lg/energy:hidden">
                    <span className="flex h-5 items-center">
                      <Skeleton className="h-3.5 w-28" />
                    </span>
                    <span className="flex h-full flex-col items-end justify-center gap-1.5">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-24" />
                    </span>
                  </span>
                </TableCell>
                {[0, 1, 2].map((column) => (
                  <TableCell key={column} className="hidden @lg/energy:table-cell">
                    <span className="flex h-5 items-center justify-end">
                      <Skeleton className="h-3.5 w-10" />
                    </span>
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </SectionSkeleton>
  )
}

/** The tiles of what the machine measures now, while they are read. */
export function TilesPending() {
  return (
    <Pending what="current values">
      <MeasurementTilesSkeleton />
    </Pending>
  )
}

/** The alarms, while they are read. */
export function AlarmsPending() {
  return (
    <Pending what="alarms and warnings">
      <AlarmsSkeleton />
    </Pending>
  )
}

/** Power and energy, while they are read. */
export function PowerAndEnergyPending() {
  return (
    <Pending what="power and energy">
      <PowerAndEnergySkeleton />
    </Pending>
  )
}

/** The whole page while it is read, in the order of the page: the head, the card and the sections below it. */
export function MachinePageSkeleton() {
  return (
    <div className={PAGE_FRAME} aria-busy="true">
      <p role="status" className="sr-only">
        Loading machine
      </p>
      <HeadSkeleton />
      <MachineCardSkeleton />
      <MeasurementTilesSkeleton />
      <AlarmsSkeleton />
      <PowerAndEnergySkeleton />
    </div>
  )
}

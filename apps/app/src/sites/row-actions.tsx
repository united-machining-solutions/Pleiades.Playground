import type { SiteList } from "@pleiades/cards/site/contract.ts"
import { Button } from "@pleiades/ui/components/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@pleiades/ui/components/dropdown-menu"
import { toast } from "@pleiades/ui/components/toast"
import { EllipsisIcon, MapPinOffIcon, MoveIcon, PlusIcon, WarehouseIcon } from "lucide-react"
import { useState } from "react"
import type { ComponentProps, ReactNode } from "react"

import { PlaceDialog } from "./place-dialog.tsx"
import { placeInWords } from "./placing.ts"
import type { Placement } from "./placing.ts"
import { removePlacement } from "./sites-api.ts"
import { failed, told, useReread } from "./use-place.ts"

// What a person does on Home: "Add new machine" from the head of the page, "Review and add" from the bar of
// the machines that send and stand on no site; "Move" or "Remove from site" in the menu of a row; "Add site"
// at the end of the sites, and "Add hall" in the menu of the head of a site.
// Each change is undone from its toast. After every change Home reads the list again; it changes
// nothing in the list itself.

/** A machine of a row: its id, the name it is shown by, and what it is. */
export type RowMachine = { machine: string; title: string; what: string }

/**
 * A button that opens "Add a new machine", in the head of the page or under an empty list: a machine that is
 * not there yet. As "Review and add" in the bar it opens "Assign machines to a site": the machines that send
 * and stand on no site, as many as go to one place.
 */
export function AddMachine({
  list,
  review = false,
  children,
  ...button
}: { list: SiteList; review?: boolean; children: ReactNode } & Omit<ComponentProps<typeof Button>, "onClick" | "children">) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button {...button} onClick={() => setOpen(true)}>
        {!review && <PlusIcon data-icon="inline-start" />}
        {children}
      </Button>
      <PlaceDialog open={open} onOpenChange={setOpen} mode={{ kind: review ? "assign" : "add" }} list={list} />
    </>
  )
}

/** The menu of a machine on a site: "Move…" opens the dialog, "Remove from site" takes it off at once, with an undo. */
export function PlacedMenu({ machine, shown, list }: { machine: RowMachine; shown: Placement | undefined; list: SiteList }) {
  // `shown` is where Home shows the machine: a change is refused where it stands elsewhere now.
  const [moving, setMoving] = useState(false)
  const reread = useReread()
  const takeOff = async () => {
    if (!shown) return
    const outcome = await removePlacement({ data: { machine: machine.machine, from: { siteId: shown.siteId, hall: shown.hall } } }).catch(
      (error: unknown) => ({ ok: false as const, reason: error instanceof Error ? error.message : String(error), stale: false }),
    )
    await reread()
    if (!outcome.ok) {
      failed(`${machine.title} was not taken off`, outcome.reason)
      return
    }
    // Someone took it off meanwhile: there is nothing to undo.
    if (outcome.already) {
      toast.add({ title: `${machine.title} stood on no site any more`, description: "Someone took it off meanwhile." })
      return
    }
    const undone = [{ machine: machine.machine, now: null, back: outcome.before, made: {} }]
    told(
      machine.title,
      `${machine.title} taken off ${placeInWords(outcome.siteName, outcome.before.hall)}`,
      "It shows up again among the machines to add while it sends data.",
      undone,
      reread,
    )
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More for ${machine.title}`} />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setMoving(true)}>
              <MoveIcon />
              Move…
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => void takeOff()}>
              <MapPinOffIcon />
              Remove from site
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {shown && (
        <PlaceDialog
          open={moving}
          onOpenChange={setMoving}
          mode={{ kind: "move", machine: machine.machine, title: machine.title, what: machine.what, placed: shown }}
          list={list}
        />
      )}
    </>
  )
}

/** "Add site", at the end of the sites and where there is none: the form makes a site, with a first hall or none. */
export function AddSite({ list, children, ...button }: { list: SiteList; children: ReactNode } & Omit<ComponentProps<typeof Button>, "onClick" | "children">) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button {...button} onClick={() => setOpen(true)}>
        <PlusIcon data-icon="inline-start" />
        {children}
      </Button>
      <PlaceDialog open={open} onOpenChange={setOpen} mode={{ kind: "site" }} list={list} />
    </>
  )
}

/** The menu of the head of a site: "Add hall" opens the form with the site chosen. */
export function SiteMenu({ site, list }: { site: { siteId: string; name: string }; list: SiteList }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More for ${site.name}`} />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setOpen(true)}>
              <WarehouseIcon />
              Add hall
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <PlaceDialog open={open} onOpenChange={setOpen} mode={{ kind: "site" }} list={list} start={{ site: { siteId: site.siteId } }} />
    </>
  )
}

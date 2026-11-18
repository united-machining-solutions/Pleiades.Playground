import type { SiteList } from "@pleiades/cards/site/contract.ts"
import { Button } from "@pleiades/ui/components/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@pleiades/ui/components/dropdown-menu"
import { toast } from "@pleiades/ui/components/toast"
import { useRouter } from "@tanstack/react-router"
import { EllipsisIcon, MapPinOffIcon, MoveIcon, PlusIcon } from "lucide-react"
import { useRef, useState } from "react"
import type { ComponentProps, ReactNode } from "react"

import { PlaceDialog } from "./place-dialog.tsx"
import type { PlaceMode } from "./place-dialog.tsx"
import { placedInWords } from "./placements.ts"
import { placeInWords } from "./placing.ts"
import type { PlaceOutcome, PlaceRequest, Placement, UndoRequest } from "./placing.ts"
import { placeMachine, removePlacement, undoChange } from "./sites-api.ts"

// What a person does on Home: "Add machine", from the head of the page or from the bar of the
// machines that send and stand on no site, and "Move" or "Remove from site" in the menu of a row.
// Each change is undone from its toast. After every change Home reads the list again; it changes
// nothing in the list itself.

/** The time the docs of the Toast of Base UI give a toast with an undo, as the parts of a kept page have it. */
const UNDO_MS = 10_000

/** A machine of a row: its id, the name it is shown by, and what it is. */
export type RowMachine = { machine: string; title: string; what: string }

function useReread() {
  const router = useRouter()
  return () => router.invalidate()
}

function failed(title: string, reason: string) {
  toast.add({ type: "error", title, description: reason, priority: "high" })
}

/**
 * The toast after a change, with its undo. `name` is what the machine is called in it. The undo puts
 * the machine back where the Sites API had it before the change, and only while nothing changed it
 * since; what the change made goes again while nothing stands on it.
 */
function told(name: string, title: string, description: string | undefined, undone: UndoRequest, reread: () => Promise<void>) {
  const shown = toast.add({
    title,
    description,
    timeout: UNDO_MS,
    actionProps: {
      children: "Undo",
      onClick() {
        toast.close(shown)
        // A server of the app that does not answer is a reason too, not an error of the page.
        void undoChange({ data: undone })
          .then((outcome) => (outcome.ok ? undefined : outcome.reason))
          .catch((error: unknown) => (error instanceof Error ? error.message : String(error)))
          .then(async (reason) => {
            await reread()
            if (reason) failed(`${name} was not put back`, reason)
          })
      },
    },
  })
}

/**
 * Sends a placement, reads the list again, and says where the machine went. A refusal that came from
 * a change meanwhile leaves the list as it is while the dialog says why: read again at once, the row
 * of the machine, and the dialog with it, could go. It is read again when the dialog closes.
 */
function usePlace() {
  const reread = useReread()
  const stale = useRef(false)
  const onPlace = async (request: PlaceRequest, what: string): Promise<PlaceOutcome> => {
    const outcome = await placeMachine({ data: request })
    if (!outcome.ok) {
      if (!outcome.stale) return outcome
      stale.current = true
      return { ...outcome, reason: `${outcome.reason} Cancel shows Home as it is now.` }
    }
    await reread()
    const name = request.displayName?.trim() || what
    const undone = { machine: request.machine, now: { siteId: outcome.siteId, hall: outcome.hall }, back: outcome.before, made: outcome.made }
    told(name, placedInWords(name, outcome.siteName, outcome.hall, request.from !== null), undefined, undone, reread)
    return outcome
  }
  const onClosed = () => {
    if (!stale.current) return
    stale.current = false
    void reread()
  }
  return { onPlace, onClosed }
}

/** Opens and closes a dialog, and tells `onClosed` when it closed. */
function useOpen(onClosed: () => void): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false)
  return [
    open,
    (next: boolean) => {
      setOpen(next)
      if (!next) onClosed()
    },
  ]
}

/**
 * A button that opens "Add machine": in the head of the page, under an empty list, or as "Review and
 * add" in the bar, where the first machine that sends and stands on no site is chosen already.
 */
export function AddMachine({
  list,
  review = false,
  children,
  ...button
}: { list: SiteList; review?: boolean; children: ReactNode } & Omit<ComponentProps<typeof Button>, "onClick" | "children">) {
  const { onPlace, onClosed } = usePlace()
  const [open, setOpen] = useOpen(onClosed)
  const mode: PlaceMode = { kind: "add", first: review ? list.unplaced[0]?.machine : undefined }
  return (
    <>
      <Button {...button} onClick={() => setOpen(true)}>
        {!review && <PlusIcon data-icon="inline-start" />}
        {children}
      </Button>
      <PlaceDialog open={open} onOpenChange={setOpen} mode={mode} list={list} onPlace={onPlace} />
    </>
  )
}

/** The menu of a machine on a site: "Move…" opens the dialog, "Remove from site" takes it off at once, with an undo. */
export function PlacedMenu({ machine, shown, list }: { machine: RowMachine; shown: Placement | undefined; list: SiteList }) {
  // `shown` is where Home shows the machine: a change is refused where it stands elsewhere now.
  const { onPlace, onClosed } = usePlace()
  const [moving, setMoving] = useOpen(onClosed)
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
    const undone = { machine: machine.machine, now: null, back: outcome.before, made: {} }
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
          onPlace={onPlace}
        />
      )}
    </>
  )
}

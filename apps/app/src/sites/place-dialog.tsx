import type { SiteList } from "@pleiades/cards/site/contract.ts"
import { cn } from "cn"
import { Button } from "@pleiades/ui/components/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@pleiades/ui/components/dialog"

import type { PlaceStart } from "./choosing.ts"
import { PlaceForm } from "./place-form.tsx"
import type { PlaceMode } from "./place-form.tsx"

// The dialog of "Add machine", "Move" and of making a site or hall alone: a title, and the form of
// place-form.tsx with a Cancel. It closes when the form is done.

export function PlaceDialog({
  open,
  onOpenChange,
  mode,
  list,
  start,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: PlaceMode
  list: SiteList
  start?: PlaceStart | undefined
}) {
  // "Add hall" of a site: the site is chosen, and the dialog says so.
  const given = mode.kind === "site" ? start?.site : undefined
  const handed = given && "siteId" in given ? list.sites.find((one) => one.siteId === given.siteId) : undefined
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // A long form scrolls inside the dialog, so its button stays within reach.
        className={cn("max-h-[calc(100svh-2rem)] overflow-y-auto", mode.kind === "add" ? "sm:max-w-2xl" : "sm:max-w-lg")}
        // "Add hall" of a site starts in the field of the hall: the site is chosen already.
        initialFocus={() => (mode.kind === "site" && start?.site ? document.querySelector<HTMLElement>("[data-slot=dialog-content] input[id$='-hall']") : true)}
      >
        <DialogHeader>
          <DialogTitle>{mode.kind === "move" ? `Move ${mode.title}` : mode.kind === "site" ? (handed ? `Add hall to ${handed.name}` : "Add site") : "Add machines"}</DialogTitle>
          <DialogDescription>
            {mode.kind === "move"
              ? "Choose where it stands now. Its values and notifications stay as they are."
              : mode.kind === "site"
                ? handed
                  ? "Type the name of the new hall."
                  : "Type the name of the new site, and its first hall if it has one. A site of the list gets a new hall here too."
                : "Machines that sent data in the last 24 hours and stand on no site. Choose the ones that go to one place."}
          </DialogDescription>
        </DialogHeader>
        {/* The form is drawn anew each time the dialog opens, so it starts from the place used last. */}
        <PlaceForm
          mode={mode}
          list={list}
          start={start}
          cancel={<DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>}
          onPlaced={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

import type { SiteList } from "@pleiades/cards/site/contract.ts"
import { cn } from "cn"
import { Button } from "@pleiades/ui/components/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@pleiades/ui/components/dialog"
import { useState } from "react"

import type { PlaceStart } from "./choosing.ts"
import { PlaceForm } from "./place-form.tsx"
import type { PlaceMode } from "./place-form.tsx"

// The dialog of "Add a new machine", "Assign machines to a site", "Move" and of making a site or hall alone:
// a title, and the form of place-form.tsx with a Cancel. It closes when the form is done. A new machine whose
// id sends already is assigned instead: the dialog turns to "Assign machines to a site" with it chosen.

export function PlaceDialog({
  open,
  onOpenChange,
  mode: asked,
  list,
  start: handedIn,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: PlaceMode
  list: SiteList
  start?: PlaceStart | undefined
}) {
  const [instead, setInstead] = useState<string | null>(null)
  const mode: PlaceMode = instead === null ? asked : { kind: "assign" }
  const start = instead === null ? handedIn : { machines: [instead] }
  // "Add hall" of a site: the site is chosen, and the dialog says so.
  const given = mode.kind === "site" ? start?.site : undefined
  const handed = given && "siteId" in given ? list.sites.find((one) => one.siteId === given.siteId) : undefined
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // The next time it opens, it is what it was asked to be.
        if (!next) setInstead(null)
        onOpenChange(next)
      }}
    >
      <DialogContent
        // A long form scrolls inside the dialog, so its button stays within reach.
        className={cn("max-h-[calc(100svh-2rem)] overflow-y-auto", mode.kind === "assign" ? "sm:max-w-2xl" : mode.kind === "add" ? "sm:max-w-xl" : "sm:max-w-lg")}
        // "Add hall" of a site starts in the field of the hall: the site is chosen already.
        initialFocus={() => (mode.kind === "site" && start?.site ? document.querySelector<HTMLElement>("[data-slot=dialog-content] input[id$='-hall']") : true)}
      >
        <DialogHeader>
          <DialogTitle>
            {mode.kind === "move"
              ? `Move ${mode.title}`
              : mode.kind === "site"
                ? handed
                  ? `Add hall to ${handed.name}`
                  : "Add site"
                : mode.kind === "assign"
                  ? "Assign machines to a site"
                  : "Add a new machine"}
          </DialogTitle>
          <DialogDescription>
            {mode.kind === "move"
              ? "Choose where it stands now. Its values and notifications stay as they are."
              : mode.kind === "site"
                ? handed
                  ? "Type the name of the new hall."
                  : "Type the name of the new site, and its first hall if it has one. A site of the list gets a new hall here too."
                : mode.kind === "assign"
                  ? "Machines that sent data in the last 24 hours and stand on no site. Choose the ones that go to one place."
                  : "What the machine is, and where it stands."}
          </DialogDescription>
        </DialogHeader>
        {/* The form is drawn anew each time the dialog opens or turns to "Assign", so it starts from what it was handed. */}
        <PlaceForm
          key={mode.kind}
          mode={mode}
          list={list}
          start={start}
          cancel={<DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>}
          onPlaced={() => onOpenChange(false)}
          onAssignInstead={asked.kind === "add" ? setInstead : undefined}
        />
      </DialogContent>
    </Dialog>
  )
}

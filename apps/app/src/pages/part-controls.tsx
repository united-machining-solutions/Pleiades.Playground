import { ArrowDownIcon, ArrowUpIcon, InfoIcon, Trash2Icon } from "lucide-react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Button } from "@pleiades/ui/components/button"
import { ButtonGroup } from "@pleiades/ui/components/button-group"

// What a kept page shows above each part while it is edited ("Edit" in its head): move the part up,
// move it down, remove it. Nothing is dragged. Every control says in words what it does, and to a
// screen reader also to which part. While nobody edits, the page shows none of this.

/** A control above a part. The page moves the focus to one after a change, by its id. */
export type PartControl = "up" | "down" | "remove" | "delete"

/** The id of a control above the part at place `at`, from the prefix of the page. */
export function controlId(prefix: string, at: number, control: PartControl): string {
  return `${prefix}-part-${at}-${control}`
}

/**
 * The controls above the part at place `at` (from 0) of a page of `count` parts, two at least. The
 * first part cannot go up and the last cannot go down: those buttons are off.
 */
export function PartControls({
  prefix,
  at,
  count,
  onMove,
  onRemove,
}: {
  prefix: string
  at: number
  count: number
  onMove: (from: number, to: number) => void
  onRemove: (at: number) => void
}) {
  const number = at + 1
  // Said after the words of each button, to a screen reader only: the place is beside the card.
  const part = <span className="sr-only">, part {number}</span>
  return (
    // Nested groups, as the docs of ButtonGroup space them: the order, then the removal.
    <ButtonGroup aria-label={`Part ${number} of ${count}`} className="self-end">
      <ButtonGroup>
        <Button
          id={controlId(prefix, at, "up")}
          variant="outline"
          size="sm"
          disabled={at === 0}
          onClick={() => onMove(at, at - 1)}
        >
          <ArrowUpIcon data-icon="inline-start" />
          Move up{part}
        </Button>
        <Button
          id={controlId(prefix, at, "down")}
          variant="outline"
          size="sm"
          disabled={at === count - 1}
          onClick={() => onMove(at, at + 1)}
        >
          <ArrowDownIcon data-icon="inline-start" />
          Move down{part}
        </Button>
      </ButtonGroup>
      <ButtonGroup>
        <Button id={controlId(prefix, at, "remove")} variant="outline" size="sm" onClick={() => onRemove(at)}>
          <Trash2Icon data-icon="inline-start" />
          Remove{part}
        </Button>
      </ButtonGroup>
    </ButtonGroup>
  )
}

/**
 * Above the only part of a page, instead of the controls: a page keeps one part at least
 * (`recipeSchema`), so this one is not removed, and the way to be rid of it is to delete the page.
 */
export function OnlyPart({ prefix, onDeletePage }: { prefix: string; onDeletePage: () => void }) {
  return (
    // The action stands at the right end and takes its width from the room the notice leaves it.
    <Alert className="has-data-[slot=alert-action]:pr-32">
      <InfoIcon />
      <AlertTitle>A page keeps one part at least.</AlertTitle>
      <AlertDescription>To remove this part, delete the page.</AlertDescription>
      <AlertAction>
        <Button id={controlId(prefix, 0, "delete")} variant="outline" size="sm" onClick={onDeletePage}>
          Delete page
        </Button>
      </AlertAction>
    </Alert>
  )
}

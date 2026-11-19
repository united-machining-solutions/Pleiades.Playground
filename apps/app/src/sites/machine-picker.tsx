import { clock, duration } from "@pleiades/cards/machine/format.ts"
import { stateLabel } from "@pleiades/cards/machine/state.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Pages } from "@pleiades/cards/shared/pages.tsx"
import { SmoothHeight } from "@pleiades/cards/shared/smooth-height.tsx"
import type { SiteList } from "@pleiades/cards/site/contract.ts"
import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import { Checkbox } from "@pleiades/ui/components/checkbox"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@pleiades/ui/components/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@pleiades/ui/components/input-group"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@pleiades/ui/components/item"
import { PlusIcon, SearchIcon } from "lucide-react"
import { useState } from "react"
import type { KeyboardEvent } from "react"

import { choiceOfAll, chosenWithAll, fieldsOf, matches, meantBy, pickerPageOf, whereInWords } from "./choosing.ts"
import type { Candidate } from "./choosing.ts"

// The machines "Assign machines to a site" offers, the suggestions: those that sent data in the last 24
// hours and stand on no site, as a list a person searches, each with what tells it apart and a box to choose
// it, as many as go to one place, seven a page. A query that finds none names the machines it is close to
// ("Did you mean"). A machine handed in that stands on a site already is moved: its row says so, and where
// it stands now. Where the form lists the chosen machines alone, the whole list opens on request.

/** When a machine last sent a value, in words for its row and for the search. */
function lastInWords(candidate: Candidate, asOf: string): { at: string; ago: string } | null {
  if (candidate.lastValueAt === null) return null
  return { at: `last data ${clock(candidate.lastValueAt)}`, ago: `${duration(candidate.lastValueAt, asOf)} ago` }
}

/** What stands in a row, and what a search looks in. */
function searchedOf(candidate: Candidate, asOf: string): Array<string> {
  const last = lastInWords(candidate, asOf)
  return fieldsOf(candidate, ...(last ? [last.at] : []))
}

/** The row of a machine: its sign and state, what it is, its manufacturer and id, and when it last sent. */
function Row({ candidate, asOf }: { candidate: Candidate; asOf: string }) {
  const last = lastInWords(candidate, asOf)
  return (
    <>
      <FieldContent>
        <FieldTitle>
          <StateSymbol state={candidate.state} />
          {candidate.what}
          <Badge variant="outline">{stateLabel[candidate.state]}</Badge>
          {candidate.byId && <Badge variant="secondary">Added by id</Badge>}
          {candidate.standsOn && <Badge variant="secondary">Move</Badge>}
        </FieldTitle>
        {candidate.standsOn && (
          <FieldDescription className="text-foreground">
            Stands in {whereInWords(candidate.standsOn.siteName, candidate.standsOn.hall)} now
          </FieldDescription>
        )}
        <FieldDescription>
          {candidate.manufacturer ? `${candidate.manufacturer} · ` : ""}
          <span className="break-all">{candidate.machine}</span>
          {/* On a narrow page the time stands in the line, not beside it. */}
          <span className="sm:hidden"> · {last ? `${last.at}, ${last.ago}` : "no data yet"}</span>
        </FieldDescription>
      </FieldContent>
      <FieldContent className="flex-none text-right max-sm:hidden">
        <FieldTitle className="ml-auto tabular-nums">{last ? last.at : "no data yet"}</FieldTitle>
        {last && <FieldDescription className="tabular-nums">{last.ago}</FieldDescription>}
      </FieldContent>
    </>
  )
}

/** Moves the focus to the box of the row above or below, as the arrow keys do in a list. */
function onArrows(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
  const boxes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role=checkbox]"))
  const at = boxes.indexOf(document.activeElement as HTMLElement)
  if (at < 0) return
  event.preventDefault()
  const next = boxes[at + (event.key === "ArrowDown" ? 1 : -1)]
  if (next) next.focus()
  else if (event.key === "ArrowUp") event.currentTarget.closest("[data-picker]")?.querySelector<HTMLElement>("input[type=search]")?.focus()
}

/**
 * The search, the list with its boxes, and what a query that finds nothing says. `candidates` are the
 * machines of the list and those handed in; `chosen` their ids. With `listed` "chosen" only the chosen
 * machines show, until a person opens the whole list.
 */
export function MachinePicker({
  id,
  list,
  candidates,
  chosen,
  query,
  onQuery,
  onChosen,
  missing,
  listed = "all",
}: {
  id: string
  list: SiteList
  candidates: ReadonlyArray<Candidate>
  chosen: ReadonlySet<string>
  query: string
  onQuery: (query: string) => void
  onChosen: (chosen: ReadonlySet<string>) => void
  missing: boolean
  listed?: "chosen" | "all" | undefined
}) {
  const typed = query.trim()
  const [page, setPage] = useState(1)
  const [opened, setOpened] = useState(listed === "all")
  // A search looks in every machine; the list shows a page of what it found. Closed, it shows the chosen alone.
  const shown = opened ? candidates.filter((one) => matches(searchedOf(one, list.asOf), typed)) : candidates.filter((one) => chosen.has(one.machine))
  const slice = pickerPageOf(shown, page)
  const all = choiceOfAll(shown, chosen)
  // A new search starts at the first page of what it finds.
  const search = (next: string) => {
    setPage(1)
    onQuery(next)
  }
  const meant = shown.length === 0 ? meantBy(typed, candidates.filter((one) => !chosen.has(one.machine))) : []

  const toggle = (machine: string, on: boolean) => {
    const next = new Set(chosen)
    if (on) next.add(machine)
    else next.delete(machine)
    onChosen(next)
  }
  // "Choose all" takes every machine the search found, on every page.
  const toggleShown = (on: boolean) => onChosen(chosenWithAll(chosen, shown, on))

  if (!opened) {
    return (
      <FieldSet data-picker data-invalid={missing || undefined} className="gap-3">
        <FieldLegend className="sr-only">Machines</FieldLegend>
        {shown.length > 0 && (
          <div className="flex flex-col gap-2" onKeyDown={onArrows}>
            {shown.map((one) => (
              <FieldLabel key={one.machine} htmlFor={`${id}-${one.machine}`}>
                <Field orientation="horizontal">
                  <Checkbox id={`${id}-${one.machine}`} checked onCheckedChange={(on) => toggle(one.machine, on)} />
                  <Row candidate={one} asOf={list.asOf} />
                </Field>
              </FieldLabel>
            ))}
          </div>
        )}
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setOpened(true)}>
          <PlusIcon data-icon="inline-start" />
          Add another machine…
        </Button>
        {missing && <FieldError>Choose at least one machine.</FieldError>}
      </FieldSet>
    )
  }

  return (
    <FieldSet data-picker data-invalid={missing || undefined} className="gap-3">
      <FieldLegend className="sr-only">Machines</FieldLegend>
      <InputGroup>
        <InputGroupInput
          id={`${id}-search`}
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search name, manufacturer, state or id"
          aria-label="Search the machines"
          value={query}
          onChange={(event) => search(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault()
              event.currentTarget.closest("[data-picker]")?.querySelector<HTMLElement>("[role=checkbox]")?.focus()
            }
            // Enter chooses the one machine a search found; it never sends the dialog by accident.
            if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
              event.preventDefault()
              const [only] = shown
              if (shown.length === 1 && only) toggle(only.machine, !chosen.has(only.machine))
            }
          }}
        />
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>

      {shown.length > 1 && (
        <Field orientation="horizontal">
          {/* Some chosen is the mixed state: a bar, not the tick of all. The Checkbox of packages/ui draws a
              tick for both, so the mixed state hides it and draws the bar here. */}
          <Checkbox
            id={`${id}-all`}
            checked={all === "all"}
            indeterminate={all === "some"}
            onCheckedChange={(on) => toggleShown(on)}
            className="data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground data-indeterminate:before:h-0.5 data-indeterminate:before:w-2 data-indeterminate:before:rounded-full data-indeterminate:before:bg-current data-indeterminate:before:content-[''] data-indeterminate:[&_svg]:hidden"
          />
          <FieldLabel htmlFor={`${id}-all`} className="font-normal">
            Choose all {shown.length}
          </FieldLabel>
          <FieldDescription className="ml-auto">
            {typed ? `${shown.length} of ${candidates.length}` : `${candidates.length} machines`}
          </FieldDescription>
        </Field>
      )}

      {shown.length > 0 && (
        <SmoothHeight>
          <div className="flex flex-col gap-2" onKeyDown={onArrows}>
            {slice.items.map((one) => (
              <FieldLabel key={one.machine} htmlFor={`${id}-${one.machine}`}>
                <Field orientation="horizontal">
                  <Checkbox
                    id={`${id}-${one.machine}`}
                    checked={chosen.has(one.machine)}
                    onCheckedChange={(on) => toggle(one.machine, on)}
                  />
                  <Row candidate={one} asOf={list.asOf} />
                </Field>
              </FieldLabel>
            ))}
          </div>
        </SmoothHeight>
      )}
      {slice.pages > 1 && (
        <Pages page={slice.page} pages={slice.pages} onPage={setPage}>
          <p className="text-xs text-muted-foreground tabular-nums">
            {slice.start + 1}–{slice.start + slice.items.length} of {shown.length}
          </p>
        </Pages>
      )}

      {shown.length === 0 && candidates.length === 0 && typed === "" && (
        <FieldDescription>No machine sent data in the last 24 hours without standing on a site. Type the id of one that has not sent data yet.</FieldDescription>
      )}
      {shown.length === 0 && typed !== "" && (
        <FieldDescription>No machine that sent data in the last 24 hours matches “{typed}”.</FieldDescription>
      )}

      {meant.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Did you mean</p>
          <ItemGroup className="gap-2">
            {meant.map((one) => (
              <Item
                key={one.machine}
                variant="outline"
                size="sm"
                render={<button type="button" />}
                onClick={() => {
                  toggle(one.machine, true)
                  onQuery("")
                }}
              >
                <ItemMedia variant="icon">
                  <StateSymbol state={one.state} />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {one.what}
                    <Badge variant="outline">{stateLabel[one.state]}</Badge>
                  </ItemTitle>
                  <ItemDescription>
                    {one.manufacturer ? `${one.manufacturer} · ` : ""}
                    <span className="break-all">{one.machine}</span>
                  </ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        </div>
      )}

      {missing && <FieldError>Choose at least one machine.</FieldError>}
    </FieldSet>
  )
}

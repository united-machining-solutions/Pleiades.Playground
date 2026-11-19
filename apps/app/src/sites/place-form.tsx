import type { SiteList } from "@pleiades/cards/site/contract.ts"
import { Alert, AlertDescription } from "@pleiades/ui/components/alert"
import { Button } from "@pleiades/ui/components/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@pleiades/ui/components/field"
import { Input } from "@pleiades/ui/components/input"
import { Spinner } from "@pleiades/ui/components/spinner"
import { CircleAlertIcon } from "lucide-react"
import { useId, useMemo, useState } from "react"
import type { FormEvent, ReactNode } from "react"

import {
  NO_HALL,
  addInWords,
  addOneInWords,
  addStartOf,
  candidatesOf,
  fromOf,
  knownMachineOf,
  makeInWords,
  placedCandidatesOf,
  siteChoicesOf,
  standsAt,
  startMachinesOf,
  startPlaceOf,
  whereInWords,
  whereOf,
} from "./choosing.ts"
import type { Candidate, HallChoice, PlaceStart, SiteChoice } from "./choosing.ts"
import { keepLastPlace, lastPlaceIn, readLastPlace } from "./last-place.ts"
import { IdentityFields } from "./identity-fields.tsx"
import { machineIdOf, makersOf, problemsOfIdentity } from "./machine-id.ts"
import type { Identity, IdentityProblems } from "./machine-id.ts"
import { MachinePicker } from "./machine-picker.tsx"
import { PlaceFields } from "./place-fields.tsx"
import { MAX_TEXT, companyOf } from "./placing.ts"
import type { Placement } from "./placing.ts"
import { useMake, usePlace } from "./use-place.ts"
import type { ToMake, ToPlace } from "./use-place.ts"

// The form of the four things a person does with the sites, wherever it stands: in a dialog of Home, or in a
// card of the chat that a person confirms. "add": a new machine, said by its manufacturer, model and serial
// number, from which its id is formed, and the site and hall it goes to; an id that sends already, or stands
// on a site, is said so, and the machine is assigned or moved instead. "assign": the machines that sent data and stand on no site, chosen from a list, as many as go to
// one place. "move": the site and hall of a machine on a site. "site": a new site with a first hall, or a new
// hall of a site. A site or hall that is not there yet is made from the name typed. The form sends through
// the server of the app itself and says when it is done; what stands around it, a title or a dialog, is the
// business of the one who shows it.

/**
 * What the form is for: adding a new machine, assigning the machines that send to a site, moving one that
 * stands on a site (`placed`), or making a site or a hall without a machine.
 */
export type PlaceMode =
  | { kind: "add" }
  | { kind: "assign" }
  | { kind: "move"; machine: string; title: string; what: string; placed: Placement }
  | { kind: "site" }

/** What went through: the site and the hall the machines went to, or that were made. */
export type Placed = { siteId: string; siteName: string; hall: string | null }

/**
 * The form. `start` chooses machines and a place before a person does: for "add" what is known of the first
 * machine named, or the first id handed in, for "assign" all machines handed in. Without a site, "add" and "assign" start at the place this
 * browser added machines to last, with a site of null at none. `listed` "chosen" shows the machines handed in
 * to "assign" alone, until a person opens the whole list. `cancel` stands beside the button that sends, as a
 * dialog has its Cancel. `onPlaced` hears where the machines went, or what was made, once all of it went through.
 * `onAssignInstead` offers, in "add", to assign a machine whose id sends already; without it, it is added here.
 */
export function PlaceForm({
  mode,
  list,
  start,
  listed: shows = "all",
  cancel,
  onPlaced,
  onAssignInstead,
}: {
  mode: PlaceMode
  list: SiteList
  start?: PlaceStart | undefined
  listed?: "chosen" | "all" | undefined
  cancel?: ReactNode
  onPlaced?: ((placed: Placed) => void) | undefined
  onAssignInstead?: ((machine: string) => void) | undefined
}) {
  const id = useId()
  const onPlace = usePlace()
  const onMake = useMake()
  const listed = useMemo(() => siteChoicesOf(list), [list])
  const fromList = useMemo(() => candidatesOf(list), [list])
  const placedOnes = useMemo(() => placedCandidatesOf(list), [list])
  const makers = useMemo(() => makersOf(list), [list])
  const adding = mode.kind === "add" || mode.kind === "assign"
  // Where the form starts is read once, when it is drawn; the list may change under it afterwards.
  const [first] = useState(() => {
    const handed = mode.kind === "move" ? { site: { siteId: mode.placed.siteId }, hall: mode.placed.hall } : start
    const last = adding && start?.site === undefined ? lastPlaceIn(list, readLastPlace()) : null
    return {
      place: startPlaceOf(handed, listed, last),
      machines: startMachinesOf(mode.kind === "assign" ? start : undefined, fromList, placedOnes),
      add: addStartOf(mode.kind === "add" ? start : undefined, makers),
    }
  })
  // "assign": the machines chosen from the list, and those handed in that are not in it.
  const [more] = useState<ReadonlyArray<Candidate>>(first.machines.more)
  const [chosen, setChosen] = useState<ReadonlySet<string>>(first.machines.chosen)
  const [query, setQuery] = useState("")
  // "add": what the new machine is, and whether one that stands on a site with its id is moved instead.
  const [identity, setIdentity] = useState<Identity>(first.add.identity)
  const [moveIt, setMoveIt] = useState(false)
  const [made, setMade] = useState<SiteChoice | null>(first.place.site?.siteId === null ? first.place.site : null)
  const [site, setSite] = useState<SiteChoice | null>(first.place.site)
  const [hall, setHall] = useState<HallChoice>(first.place.hall)
  const known = companyOf(list)
  const [company, setCompany] = useState(start?.company?.trim() || known)
  const [displayName, setDisplayName] = useState(() =>
    mode.kind === "move" ? (mode.placed.displayName ?? "") : (start?.displayName ?? (mode.kind === "add" ? first.add.name : "")),
  )
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string>()

  // "assign": a machine placed meanwhile, by someone else or by a request that went through, is no machine of
  // the list any more; one handed in stays listed with where it stood, or goes where it is placed now.
  const candidates = [
    ...more.filter((one) => !fromList.some((other) => other.machine === one.machine)).map((one) => (one.standsOn ? (placedOnes.get(one.machine) ?? one) : one)),
    ...fromList,
  ]
  // A machine to move that stands at the place chosen already has nothing to do, and is not sent.
  const picked = candidates.filter((one) => chosen.has(one.machine) && !standsAt(one, site, hall))
  const moves = picked.filter((one) => one.standsOn !== null).length

  // "add": the id formed from what the new machine is, and whether the list has a machine of that id.
  const addId = mode.kind === "add" ? machineIdOf(identity, makers) : undefined
  const existing = knownMachineOf(addId, fromList, placedOnes)
  const moving = existing.kind === "placed" && moveIt
  const identityProblems: IdentityProblems = mode.kind === "add" ? problemsOfIdentity(identity, makers) : {}
  const there = moving && standsAt(existing.candidate, site, hall)
  // The name the machine is known by: its display name, else its model and serial number.
  const addName = displayName.trim() || (existing.kind === "new" ? [identity.model, identity.serialNumber].map((one) => one.trim()).filter(Boolean).join(" ") : existing.candidate.what)

  // Handed no place, the form asks for one from the start, and sends nothing until it has one.
  const placeAsked = adding && start?.site === null
  const sites = made ? [...listed, made] : listed
  const where = site ? whereInWords(site.name, hall.name) : null
  const making = mode.kind === "site" ? makeInWords(site, hall) : null
  const one = mode.kind === "move" || mode.kind === "add" || (mode.kind === "assign" && picked.length === 1)
  const missing = {
    machines: tried && mode.kind === "assign" && picked.length === 0,
    site: (tried || placeAsked) && site === null,
    company: tried && site !== null && site.siteId === null && company.trim() === "",
    // Making alone needs something new: a site, or a hall of a site that is there.
    made: tried && mode.kind === "site" && site !== null && making === null,
  }
  // A field of what the machine is says what is missing once a person sent the form, or typed in it.
  const shownProblems = Object.fromEntries(
    (Object.keys(identityProblems) as Array<keyof Identity>).filter((field) => tried || identity[field].trim() !== "").map((field) => [field, identityProblems[field]]),
  ) as IdentityProblems

  const send = async (): Promise<Placed | string> => {
    if (site === null) return "Choose a site."
    if (mode.kind === "site") {
      const asked: ToMake =
        site.siteId === null
          ? { site: { name: site.name, company: company.trim(), hall: hall.name } }
          : { hall: { siteId: site.siteId, hall: hall.name ?? "" } }
      const outcome = await onMake(asked)
      return outcome.ok ? outcome : outcome.reason
    }
    const place = whereOf(site, hall, company)
    const name = one ? displayName : ""
    const machines: Array<ToPlace> =
      mode.kind === "move"
        ? [{ request: { machine: mode.machine, ...place, displayName: name, from: { siteId: mode.placed.siteId, hall: mode.placed.hall } }, what: mode.what }]
        : mode.kind === "add"
          ? [{ request: { machine: addId ?? "", ...place, displayName: name, from: moving ? fromOf(existing.candidate) : null }, what: addName }]
          : picked.map((candidate) => ({ request: { machine: candidate.machine, ...place, displayName: name, from: fromOf(candidate) }, what: candidate.what }))
    const outcome = await onPlace(machines)
    if (!outcome.ok) return outcome.reason
    // The next "Add a machine" or "Assign" starts where these machines went.
    if (adding) keepLastPlace({ siteId: outcome.siteId, hall: outcome.hall })
    return outcome
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    setTried(true)
    const incomplete =
      site === null ||
      (site.siteId === null && company.trim() === "") ||
      (mode.kind === "assign" && picked.length === 0) ||
      (mode.kind === "add" && (addId === undefined || (existing.kind === "placed" && !moveIt) || there)) ||
      (mode.kind === "site" && making === null)
    if (incomplete) return
    setBusy(true)
    setRefused(undefined)
    try {
      const outcome = await send()
      if (typeof outcome === "string") setRefused(outcome)
      else onPlaced?.({ siteId: outcome.siteId, siteName: outcome.siteName, hall: outcome.hall })
    } catch (error) {
      setRefused(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const newSite = site?.siteId === null ? site.name : null
  const to = newSite !== null ? hall.name : where
  const label =
    mode.kind === "move"
      ? where
        ? `Move to ${where}`
        : "Move"
      : mode.kind === "site"
        ? (making ?? "Create site")
        : mode.kind === "add"
          ? addOneInWords(addName, to, moving, newSite)
          : addInWords(picked.length, to, moves, newSite, "Assign")

  return (
    <form
      onSubmit={(event) => void submit(event)}
      // Ctrl+Enter sends the form from any field, as Enter in a field chooses there.
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          void submit()
        }
      }}
      className="flex min-w-0 flex-col gap-6"
      noValidate
    >
      <FieldGroup>
        {mode.kind === "add" && (
          <div className="flex flex-col gap-2">
            <IdentityFields
              id={id}
              value={identity}
              onChange={(change) => {
                setIdentity({ ...identity, ...change })
                setMoveIt(false)
              }}
              problems={shownProblems}
              machineId={addId}
            />
            {/* The id of a machine the list has already: it is assigned or moved, not made a second time. */}
            {existing.kind === "sends" && (
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                This machine already sends data.
                {onAssignInstead && (
                  <Button type="button" variant="ghost" size="xs" onClick={() => onAssignInstead(existing.candidate.machine)}>
                    Assign it instead
                  </Button>
                )}
              </p>
            )}
            {existing.kind === "placed" && existing.candidate.standsOn && (
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                {moving
                  ? `Moved from ${whereInWords(existing.candidate.standsOn.siteName, existing.candidate.standsOn.hall)}.`
                  : `Stands in ${whereInWords(existing.candidate.standsOn.siteName, existing.candidate.standsOn.hall)} already.`}
                {!moving && (
                  <Button type="button" variant="ghost" size="xs" onClick={() => setMoveIt(true)}>
                    Move it here
                  </Button>
                )}
              </p>
            )}
            {there && <FieldError>It stands there already.</FieldError>}
          </div>
        )}
        {mode.kind === "assign" && (
          <MachinePicker
            id={id}
            list={list}
            candidates={candidates}
            chosen={chosen}
            query={query}
            onQuery={setQuery}
            onChosen={setChosen}
            missing={missing.machines}
            listed={shows}
          />
        )}
        <PlaceFields
          id={id}
          sites={sites}
          site={site}
          hall={hall}
          company={company}
          companyKnown={known !== ""}
          onSite={(next) => {
            if (next.siteId === null) setMade(next)
            // A hall of another site is no hall of this one.
            if (next !== site) setHall(NO_HALL)
            setSite(next)
          }}
          onHall={setHall}
          onCompany={setCompany}
          missing={missing}
          hallNeeded={mode.kind === "site" && site !== null && site.siteId !== null}
        />
        {missing.made && <FieldError>{site?.name} is there already: type a new hall for it, or the name of a new site.</FieldError>}
        {one && (
          <Field>
            <FieldLabel htmlFor={`${id}-display`}>
              Display name <span className="font-normal text-muted-foreground">· optional</span>
            </FieldLabel>
            <Input
              id={`${id}-display`}
              value={displayName}
              maxLength={MAX_TEXT}
              placeholder={mode.kind === "move" ? mode.what : mode.kind === "add" ? addName : picked[0]?.what}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <FieldDescription>The name people know the machine by.</FieldDescription>
          </Field>
        )}
      </FieldGroup>

      {refused && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{refused}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {cancel}
        <Button type="submit" disabled={busy || (placeAsked && site === null) || (mode.kind === "add" && existing.kind === "placed" && !moveIt)}>
          {busy && <Spinner data-icon="inline-start" />}
          {label}
        </Button>
      </div>
    </form>
  )
}

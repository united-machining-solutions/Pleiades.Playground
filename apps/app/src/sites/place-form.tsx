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
  candidateById,
  candidatesOf,
  fromOf,
  makeInWords,
  meantBy,
  namedMissing,
  namedOf,
  namedReady,
  placedCandidatesOf,
  siteChoicesOf,
  standsAt,
  startMachinesOf,
  startPlaceOf,
  whereInWords,
  whereOf,
} from "./choosing.ts"
import type { Candidate, HallChoice, Named, PlaceStart, SiteChoice } from "./choosing.ts"
import { keepLastPlace, lastPlaceIn, readLastPlace } from "./last-place.ts"
import { makersOf } from "./machine-id.ts"
import { MachinePicker } from "./machine-picker.tsx"
import { PlaceFields } from "./place-fields.tsx"
import { MAX_TEXT, companyOf } from "./placing.ts"
import type { Placement } from "./placing.ts"
import { useMake, usePlace } from "./use-place.ts"
import type { ToMake, ToPlace } from "./use-place.ts"

// The form of "Add machine", "Move" and of making a site or hall alone, wherever it stands: in the dialog
// of Home, or in a card of the chat that a person confirms. Adding: the machines that sent data in the last
// 24 hours and stand on no site, as a list a person searches and chooses from, as many as go to one place,
// and the site and hall they go to; a machine handed in or typed that stands on a site already is moved
// from there. Moving: the site and hall alone. Making: a new site with a first hall, or a new hall of a site.
// A site or hall that is not there yet is made from the name typed. The form sends through the server of
// the app itself and says when it is done; what stands around it, a title or a dialog, is the business of
// the one who shows it.

/**
 * What the form is for: adding machines to a site, moving one that stands on a site (`placed`), or making
 * a site or a hall without a machine.
 */
export type PlaceMode =
  | { kind: "add" }
  | { kind: "move"; machine: string; title: string; what: string; placed: Placement }
  | { kind: "site" }

/** What went through: the site and the hall the machines went to, or that were made. */
export type Placed = { siteId: string; siteName: string; hall: string | null }

/**
 * The form. `start` chooses machines and a place before a person does; without a site an add starts at
 * the place this browser added machines to last, with a site of null at none. `listed` "chosen" shows the
 * machines handed in alone, until a person opens the whole list. `cancel` stands beside the button that
 * sends, as a dialog has its Cancel. `onPlaced` hears where the machines went, or what was made, once all
 * of it went through.
 */
export function PlaceForm({
  mode,
  list,
  start,
  listed: shows = "all",
  cancel,
  onPlaced,
}: {
  mode: PlaceMode
  list: SiteList
  start?: PlaceStart | undefined
  listed?: "chosen" | "all" | undefined
  cancel?: ReactNode
  onPlaced?: ((placed: Placed) => void) | undefined
}) {
  const id = useId()
  const onPlace = usePlace()
  const onMake = useMake()
  const listed = useMemo(() => siteChoicesOf(list), [list])
  const fromList = useMemo(() => candidatesOf(list), [list])
  const placedOnes = useMemo(() => placedCandidatesOf(list), [list])
  const makers = useMemo(() => makersOf(list), [list])
  // Where the form starts is read once, when it is drawn; the list may change under it afterwards.
  const [first] = useState(() => {
    const handed = mode.kind === "move" ? { site: { siteId: mode.placed.siteId }, hall: mode.placed.hall } : start
    const last = mode.kind === "add" && start?.site === undefined ? lastPlaceIn(list, readLastPlace()) : null
    return {
      place: startPlaceOf(handed, listed, last),
      machines: startMachinesOf(mode.kind === "add" ? start : undefined, fromList, placedOnes),
    }
  })
  const [more, setMore] = useState<ReadonlyArray<Candidate>>(first.machines.more)
  const [named, setNamed] = useState<ReadonlyArray<Named>>(() => (mode.kind === "add" ? namedOf(start, makers) : []))
  const [chosen, setChosen] = useState<ReadonlySet<string>>(first.machines.chosen)
  const [query, setQuery] = useState("")
  const [made, setMade] = useState<SiteChoice | null>(first.place.site?.siteId === null ? first.place.site : null)
  const [site, setSite] = useState<SiteChoice | null>(first.place.site)
  const [hall, setHall] = useState<HallChoice>(first.place.hall)
  const known = companyOf(list)
  const [company, setCompany] = useState(start?.company?.trim() || known)
  // One machine named by its name alone is known by that name.
  const [displayName, setDisplayName] = useState(() =>
    mode.kind === "move"
      ? (mode.placed.displayName ?? "")
      : (start?.displayName ?? (first.machines.chosen.size === 0 && named.length === 1 ? named[0]!.name : "")),
  )
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string>()

  // A machine placed meanwhile, by someone else or by a request that went through, is no machine of the list
  // any more; one handed in or typed stays listed with where it stood, or goes where it is placed now.
  const candidates = [
    ...more.filter((one) => !fromList.some((other) => other.machine === one.machine)).map((one) => (one.standsOn ? (placedOnes.get(one.machine) ?? one) : one)),
    ...fromList,
  ]
  // A machine to move that stands at the place chosen already has nothing to do, and is not sent.
  const picked = candidates.filter((one) => chosen.has(one.machine) && !standsAt(one, site, hall))
  const moves = picked.filter((one) => one.standsOn !== null).length
  const ready = namedReady(named, makers)
  const count = picked.length + ready.length
  // Handed no place, the form asks for one from the start, and sends nothing until it has one.
  const placeAsked = mode.kind === "add" && start?.site === null
  const sites = made ? [...listed, made] : listed
  const where = site ? whereInWords(site.name, hall.name) : null
  const making = mode.kind === "site" ? makeInWords(site, hall) : null
  const one = mode.kind === "move" || (mode.kind === "add" && picked.length + named.filter((each) => each.chosen).length === 1)
  const missing = {
    machines: tried && mode.kind === "add" && count === 0 && !namedMissing(named, makers),
    site: (tried || placeAsked) && site === null,
    company: tried && site !== null && site.siteId === null && company.trim() === "",
    // Making alone needs something new: a site, or a hall of a site that is there.
    made: tried && mode.kind === "site" && site !== null && making === null,
  }

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
        : [
            ...picked.map((candidate) => ({ request: { machine: candidate.machine, ...place, displayName: name, from: fromOf(candidate) }, what: candidate.what })),
            // A machine named by its name is known by it, also where several go at once.
            ...ready.map((each) => ({ request: { machine: each.id, ...place, displayName: one ? name : each.name, from: null }, what: each.name })),
          ]
    const outcome = await onPlace(machines)
    if (!outcome.ok) return outcome.reason
    // The next "Add machine" starts where these machines went.
    if (mode.kind === "add") keepLastPlace({ siteId: outcome.siteId, hall: outcome.hall })
    return outcome
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    setTried(true)
    const incomplete =
      site === null ||
      (site.siteId === null && company.trim() === "") ||
      (mode.kind === "add" && (count === 0 || namedMissing(named, makers))) ||
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

  const label =
    mode.kind === "move"
      ? where
        ? `Move to ${where}`
        : "Move"
      : mode.kind === "site"
        ? (making ?? "Create site")
        : site?.siteId === null
          ? addInWords(count, hall.name, moves, site.name)
          : addInWords(count, where, moves)

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
          <MachinePicker
            id={id}
            list={list}
            candidates={candidates}
            chosen={chosen}
            query={query}
            onQuery={setQuery}
            onChosen={setChosen}
            onAddById={(machine) => {
              // One that stands on a site is moved from there; any other is one without data.
              const added = placedOnes.get(machine) ?? candidateById(machine)
              setMore((before) => [added, ...before.filter((other) => other.machine !== machine)])
              setChosen((before) => new Set(before).add(machine))
              setQuery("")
            }}
            missing={missing.machines}
            listed={shows}
            named={named}
            makers={makers}
            tried={tried}
            onNamed={(index, change) => setNamed((before) => before.map((each, at) => (at === index ? { ...each, ...change } : each)))}
            onAddNamed={(name) => {
              const meant = meantBy(name, candidates).map((each) => each.machine)
              setNamed((before) => [...before, { name, meant, chosen: true, manufacturer: "", model: "", serialNumber: "" }])
              // The only machine of the form is known by the name it was added by.
              if (displayName === "" && count === 0) setDisplayName(name)
              setQuery("")
            }}
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
              placeholder={mode.kind === "move" ? mode.what : (picked[0]?.what ?? named.find((each) => each.chosen)?.name)}
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
        <Button type="submit" disabled={busy || (placeAsked && site === null)}>
          {busy && <Spinner data-icon="inline-start" />}
          {label}
        </Button>
      </div>
    </form>
  )
}

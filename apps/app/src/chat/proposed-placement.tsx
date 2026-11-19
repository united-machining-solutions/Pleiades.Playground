import type { SiteList } from "@pleiades/cards/site/contract.ts"
import { Alert, AlertDescription } from "@pleiades/ui/components/alert"
import { Button, buttonVariants } from "@pleiades/ui/components/button"
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Spinner } from "@pleiades/ui/components/spinner"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon, CircleAlertIcon, CircleCheckIcon } from "lucide-react"
import { useEffect, useId, useState } from "react"
import type { ReactNode } from "react"

import { getSites } from "@/machines/get-machines.ts"
import { confirmedOf, keepConfirmed } from "@/placement/confirmed.ts"
import type { Confirmed } from "@/placement/confirmed.ts"
import { PROPOSE_PLACEMENT_TOOL, changesNothing, checkPlacement, nameToWrite, proposedPlacement } from "@/placement/proposal.ts"
import type { PlacementCheck, PlacementInput } from "@/placement/proposal.ts"
import {
  NO_HALL,
  addInWords,
  addOneInWords,
  candidatesOf,
  madeInWords,
  makeInWords,
  placedCandidatesOf,
  siteChoicesOf,
  whereInWords,
  whereOf,
} from "@/sites/choosing.ts"
import type { Candidate, SiteChoice } from "@/sites/choosing.ts"
import { DoneStep, OpenStep } from "@/sites/done-step.tsx"
import { IdentityFields } from "@/sites/identity-fields.tsx"
import { identityInWords, machineIdOf, makersOf, problemsOfIdentity } from "@/sites/machine-id.ts"
import type { Identity, Maker } from "@/sites/machine-id.ts"
import { PlaceFields } from "@/sites/place-fields.tsx"
import { placeReady } from "@/sites/place-value.ts"
import type { PlaceValue } from "@/sites/place-value.ts"
import { companyOf } from "@/sites/placing.ts"
import { useMake, usePlace } from "@/sites/use-place.ts"
import type { ToPlace } from "@/sites/use-place.ts"

import type { ChatTool } from "./tool-results.ts"

/**
 * The entry of the chat's list for a proposal of where machines go (placement/proposal.ts, ADR-0026): what
 * a call is called, and the card the chat draws for its result. Only the chat calls the tool; a page never
 * holds it.
 */
export const placementTool: ChatTool = {
  name: PROPOSE_PLACEMENT_TOOL,
  label: {
    running: "Proposing where the machines go",
    done: "Proposed where the machines go",
    failed: "Failed to propose where the machines go",
  },
  saveAsPage: false,
  draw(content, call) {
    const input = proposedPlacement(content)
    return input && <ProposedPlacement input={input} call={call?.id} />
  },
}

/** The list of the sites as the card reads it when it is drawn: the values, or why there are none. */
type Read = { list: SiteList } | { error: string } | undefined

/**
 * A proposal of the chat: a card that leads the person to what is missing, step by step, and writes only when
 * the person confirms. What the language model proposed is checked again against the list of now and fills
 * the steps in. What it did is noted by the id of the tool call (placement/confirmed.ts), so the card says so
 * after a reload instead of offering it again.
 */
function ProposedPlacement({ input, call }: { input: PlacementInput; call?: string | undefined }) {
  const [read, setRead] = useState<Read>()
  const [done, setDone] = useState<Confirmed | undefined>(() => (call === undefined ? undefined : confirmedOf(call)))
  const [dismissed, setDismissed] = useState(false)

  const load = () => {
    setRead(undefined)
    getSites()
      .then((answer) => setRead(answer.values ? { list: answer.values } : { error: answer.error }))
      .catch((error: unknown) => setRead({ error: error instanceof Error ? error.message : String(error) }))
  }
  // Read once, when the card is drawn: it shows the list of that moment.
  useEffect(load, [])

  const shell = (title: string, body: ReactNode) => (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {body}
    </Card>
  )

  if (done) {
    return shell(
      done.title ?? titleOf(input),
      <CardFooter role="status" className="flex-wrap gap-2">
        <CircleCheckIcon aria-hidden className="size-4" />
        <span>{done.words}</span>
        <Link to="/" className={buttonVariants({ variant: "ghost", size: "xs" })}>
          Open Home
        </Link>
      </CardFooter>,
    )
  }
  if (dismissed) {
    return shell(
      titleOf(input),
      <CardFooter role="status" className="flex-wrap gap-2 text-muted-foreground">
        <span>Not added.</span>
        <Button variant="ghost" size="xs" onClick={() => setDismissed(false)}>
          Show again
        </Button>
      </CardFooter>,
    )
  }
  if (read === undefined) {
    return shell(
      titleOf(input),
      <CardContent role="status" className="flex items-center gap-2 text-muted-foreground">
        <Spinner /> Reading the sites…
      </CardContent>,
    )
  }
  if ("error" in read || read.list.sitesError !== null) {
    const why = "error" in read ? read.error : read.list.sitesError
    return shell(
      titleOf(input),
      <>
        <CardContent>
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription>The sites cannot be read now: {why}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button variant="outline" size="sm" onClick={load}>
            Try again
          </Button>
        </CardFooter>
      </>,
    )
  }

  const check = checkPlacement(input, read.list)
  if (changesNothing(check) && check.site !== null) {
    const where = whereInWords(check.site.name, check.hall?.name ?? null)
    return shell(
      titleOf(input),
      <CardFooter role="status" className="flex-wrap gap-2">
        <CircleCheckIcon aria-hidden className="size-4" />
        <span>{check.machines.length > 0 ? `Done: every machine named stands on ${where}.` : `${where} is there already.`}</span>
      </CardFooter>,
    )
  }
  return (
    <Steps
      input={input}
      check={check}
      list={read.list}
      onDone={(confirmed) => {
        if (call !== undefined) keepConfirmed(call, confirmed)
        setDone(confirmed)
      }}
      onDismiss={() => setDismissed(true)}
    />
  )
}

/** The title of a card: what the proposal is about. */
function titleOf(input: PlacementInput, check?: PlacementCheck): string {
  const machines = input.machines ?? []
  if (machines.length === 1) {
    const [only] = machines
    const name =
      typeof only === "string"
        ? only
        : only?.name || (only && identityInWords({ manufacturer: only.manufacturer ?? "", model: only.model ?? "", serialNumber: only.serialNumber ?? "" }))
    if (name) return `Add ${name}`
  }
  if (machines.length > 1) return `Add ${machines.length} machines`
  if (check === undefined) return input.hall?.trim() ? "Create a site or a hall" : "Create a site"
  return check.site?.kind === "new" ? "Create a site" : "Add a hall"
}

/** A machine of the card: one it knows, or one the person names that it asks about. */
type Step =
  | {
      kind: "known"
      key: string
      machine: string
      what: string
      maker: string
      from: { siteId: string; hall: string | null } | null
      fromWords: string | null
    }
  | {
      kind: "named"
      key: string
      name: string
      meant: ReadonlyArray<Candidate>
      identity: Identity
      /** The machine of `meant` the person chose, or null. */
      chosen: Candidate | null
      /** Whether the person chose none of `meant`, or there is none: then the fields ask. */
      none: boolean
      /** Whether the fields are done: the person said so, or they came complete. */
      settled: boolean
    }

type Named = Extract<Step, { kind: "named" }>

function knownOf(candidate: Candidate): Step {
  const stands = candidate.standsOn
  return {
    kind: "known",
    key: candidate.machine,
    machine: candidate.machine,
    what: candidate.what,
    maker: candidate.manufacturer,
    from: stands ? { siteId: stands.siteId, hall: stands.hall } : null,
    fromWords: stands ? whereInWords(stands.siteName, stands.hall) : null,
  }
}

/** The steps a check starts with: what is known, and what the card asks about. */
function stepsOf(check: PlacementCheck, list: SiteList, makers: ReadonlyArray<Maker>): Array<Step> {
  const all = [...candidatesOf(list), ...placedCandidatesOf(list).values()]
  const candidate = (machine: string) => all.find((one) => one.machine === machine)
  return check.machines.flatMap((one, index): Array<Step> => {
    if (one.status === "add" || one.status === "move") {
      const found = candidate(one.machine)
      return found ? [knownOf(found)] : []
    }
    if (one.status === "named" || one.status === "ambiguous" || one.status === "unknown") {
      const meant = (one.status === "ambiguous" ? one.fits : one.meant).flatMap((fit) => candidate(fit.machine) ?? [])
      const identity = one.status === "named" ? one.identity : { manufacturer: "", model: "", serialNumber: "" }
      const name = one.status === "named" ? one.name : one.said
      const complete = machineIdOf(identity, makers) !== undefined
      return [{ kind: "named", key: `${index}:${name}`, name, meant, identity, chosen: null, none: meant.length === 0 || complete, settled: complete }]
    }
    return []
  })
}

/** The place a check starts with: the site and hall it names, as choices of the list or new ones. */
function placeOf(check: PlacementCheck, list: SiteList): PlaceValue {
  const sites = siteChoicesOf(list)
  const company = check.site?.kind === "new" ? check.site.company : companyOf(list)
  if (check.site === null) return { site: null, hall: null, company }
  const named = check.site
  const site = named.kind === "new" ? { siteId: null, name: named.name, halls: [] } : (sites.find((one) => one.siteId === named.siteId) ?? null)
  const hall = check.hall === null ? NO_HALL : { name: check.hall.name, made: check.hall.kind === "new" }
  return { site, hall, company }
}

/** Whether a step needs nothing more from the person. */
function settled(step: Step, makers: ReadonlyArray<Maker>): boolean {
  return step.kind === "known" || step.chosen !== null || (step.settled && machineIdOf(step.identity, makers) !== undefined)
}

/** A machine as the line of a done step says it: "MFP 20 · Mägerle · MFP 20 · 6834-2345", "Laser2D L-01 · TRUMPF". */
function lineOf(step: Step): string {
  if (step.kind === "known") return [step.what, step.maker].filter(Boolean).join(" · ")
  if (step.chosen) return [step.chosen.what, step.chosen.manufacturer].filter(Boolean).join(" · ")
  return [step.name, identityInWords(step.identity)].filter(Boolean).join(" · ")
}

/**
 * The steps: which machine each one is, where they go, and the button. A step that is done is one line, a
 * click opens it again; a proposal that is whole shows the button at once.
 */
function Steps({
  input,
  check,
  list,
  onDone,
  onDismiss,
}: {
  input: PlacementInput
  check: PlacementCheck
  list: SiteList
  onDone: (confirmed: Confirmed) => void
  onDismiss: () => void
}) {
  const makers = makersOf(list)
  const [steps, setSteps] = useState(() => stepsOf(check, list, makers))
  const [place, setPlace] = useState(() => placeOf(check, list))
  // A site typed in the field that the list does not have yet: offered beside the sites until it is made.
  const [made, setMade] = useState<SiteChoice | null>(() => (place.site?.siteId === null ? place.site : null))
  // The steps a person opened again; a step that needs something is open anyway. The place stays open until
  // the person says it is done where it was not whole at first, so the hall can be chosen after the site; and
  // where a mistyped site or hall was taken for another, so the person sees what it was taken for.
  const [open, setOpen] = useState<ReadonlySet<string>>(() =>
    new Set(!placeReady(placeOf(check, list)) || check.site?.kind === "guess" || check.hall?.kind === "guess" ? ["where"] : []),
  )
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string>()
  const onPlace = usePlace()
  const onMake = useMake()
  const placeId = useId()

  const change = (key: string, next: Partial<Named>) =>
    setSteps((before) => before.map((step) => (step.key === key && step.kind === "named" ? { ...step, ...next } : step)))
  const close = (key: string) => setOpen((before) => new Set([...before].filter((one) => one !== key)))
  const reopen = (key: string) => setOpen((before) => new Set(before).add(key))

  const machinesReady = steps.every((step) => settled(step, makers))
  const ready = placeReady(place)
  const newSite = place.site !== null && place.site.siteId === null ? place.site.name.trim() : null
  const where = place.site && place.hall ? whereInWords(place.site.name.trim(), place.hall.name?.trim() || null) : null
  const making = steps.length === 0
  const moving = (step: Step) => (step.kind === "known" ? step.from !== null : step.chosen?.standsOn != null)
  const moves = steps.filter(moving).length
  const label = (() => {
    if (making) return (place.site && place.hall && makeInWords(place.site, place.hall)) ?? "Nothing to create"
    const [only] = steps
    if (steps.length === 1 && only) {
      const name = only.kind === "known" ? only.what : (only.chosen?.what ?? only.name)
      return addOneInWords(name, newSite === null ? where : (place.hall?.name?.trim() || null), moves === 1, newSite)
    }
    return addInWords(steps.length, newSite === null ? where : (place.hall?.name?.trim() || null), moves, newSite)
  })()

  const confirm = async () => {
    if (!ready || !place.site || !place.hall) return
    setBusy(true)
    setRefused(undefined)
    try {
      const title = titleOf(input, check)
      const site = { ...place.site, name: place.site.name.trim() }
      const hall = { ...place.hall, name: place.hall.name?.trim() || null }
      if (making) {
        const outcome = await onMake(
          site.siteId === null ? { site: { name: site.name, company: place.company.trim(), hall: hall.name } } : { hall: { siteId: site.siteId, hall: hall.name ?? "" } },
        )
        if (!outcome.ok) return setRefused(outcome.reason)
        return onDone({ words: madeInWords(outcome.siteName, outcome.hall, site.siteId === null), at: new Date().toISOString(), title })
      }
      const at = whereOf(site, hall, place.company)
      const one = steps.length === 1
      const machines: Array<ToPlace> = steps.map((step) => {
        if (step.kind === "known") {
          // A machine that is moved keeps its display name, unless the proposal gives one; one added has none but that.
          const displayName = step.from ? nameToWrite(one ? check.displayName : null, list, step.machine) : one ? check.displayName : null
          return { request: { machine: step.machine, ...at, displayName, from: step.from }, what: step.what }
        }
        if (step.chosen) {
          const stands = step.chosen.standsOn
          const from = stands ? { siteId: stands.siteId, hall: stands.hall } : null
          return { request: { machine: step.chosen.machine, ...at, displayName: stands ? nameToWrite(null, list, step.chosen.machine) : null, from }, what: step.chosen.what }
        }
        // A machine that sent no data: its id is made of what it is, and it is known by the name the person said.
        const machine = machineIdOf(step.identity, makers)!
        return { request: { machine, ...at, displayName: step.name, from: null }, what: step.name }
      })
      const outcome = await onPlace(machines)
      if (!outcome.ok) return setRefused(outcome.reason)
      // The page reads its list again after the change and may cut this read off: then once more.
      const after = (await getSites().catch(() => null))?.values ?? (await getSites().catch(() => null))?.values
      const words = after ? doneInWords(list, after, outcome) : `Added to ${whereInWords(outcome.siteName, outcome.hall)}`
      onDone({ words, at: new Date().toISOString(), title })
    } finally {
      setBusy(false)
    }
  }

  // The machine whose fields are open, the first that is not done: its "Done" stands in the footer, and its
  // way back to the suggestions in the head.
  const asking = steps.find((step): step is Named => step.kind === "named" && step.none && (!settled(step, makers) || open.has(step.key)))
  const asked = asking ? machineIdOf(asking.identity, makers) : undefined

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{titleOf(input, check)}</CardTitle>
        {asking && asking.meant.length > 0 && (
          <CardAction>
            <Button size="sm" variant="ghost" aria-label="Back to the suggestions" onClick={() => change(asking.key, { none: false })}>
              <ArrowLeftIcon data-icon="inline-start" />
              Back
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col divide-y [&>*]:py-3 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
        {steps.map((step) =>
          settled(step, makers) && !open.has(step.key) ? (
            <DoneStep key={step.key} onOpen={() => reopen(step.key)}>
              {lineOf(step)}
              {step.kind === "known" && step.fromWords && <span className="text-muted-foreground"> · from {step.fromWords}</span>}
              {/* A display name from the proposal is seen before it is written. */}
              {step.kind === "known" && steps.length === 1 && check.displayName && <span className="text-muted-foreground"> · shown as “{check.displayName}”</span>}
            </DoneStep>
          ) : step.kind === "named" ? (
            <WhichMachine key={step.key} step={step} makers={makers} onChange={(next) => change(step.key, next)} onChosen={() => close(step.key)} />
          ) : null,
        )}
        {check.machines.flatMap((one) =>
          one.status === "already"
            ? [
                <p key={one.machine} className="px-2 text-sm text-muted-foreground">
                  {one.what} is there already.
                </p>,
              ]
            : one.status === "invalid"
              ? [
                  <p key={one.said} className="px-2 text-sm text-muted-foreground">
                    “{one.said}”: {one.problem}
                  </p>,
                ]
              : [],
        )}
        {machinesReady &&
          (ready && !open.has("where") ? (
            <DoneStep onOpen={() => reopen("where")}>{where}</DoneStep>
          ) : (
            <OpenStep title="Where?">
              {check.site?.kind === "guess" && place.site?.siteId === check.site.siteId && (
                <p className="text-xs text-muted-foreground">No site “{check.site.said}”, so {check.site.name}.</p>
              )}
              <PlaceFields
                id={placeId}
                sites={made ? [...siteChoicesOf(list), made] : siteChoicesOf(list)}
                site={place.site}
                hall={place.hall ?? NO_HALL}
                company={place.company}
                companyKnown={companyOf(list) !== ""}
                onSite={(next) => {
                  if (next.siteId === null) setMade(next)
                  // A hall of another site is no hall of this one.
                  setPlace((before) => ({ ...before, site: next, hall: next === before.site ? before.hall : NO_HALL }))
                }}
                onHall={(next) => setPlace((before) => ({ ...before, hall: next }))}
                onCompany={(next) => setPlace((before) => ({ ...before, company: next }))}
                missing={{ site: place.site === null, company: newSite !== null && place.company.trim() === "" }}
                hallNeeded={making && place.site?.siteId != null}
              />
            </OpenStep>
          ))}
        {refused && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription>{refused}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      {/* Dismiss on the left; on the right what moves on: the step whose fields are open, or the change itself. */}
      <CardFooter className="flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
        {asking ? (
          <Button
            size="sm"
            disabled={asked === undefined}
            onClick={() => {
              change(asking.key, { settled: true })
              close(asking.key)
            }}
          >
            Done
          </Button>
        ) : (
          machinesReady &&
          ready && (
            <Button size="sm" disabled={busy} onClick={() => void confirm()}>
              {busy && <Spinner data-icon="inline-start" />}
              {label}
            </Button>
          )
        )}
      </CardFooter>
    </Card>
  )
}

/**
 * Which machine a name means: one of the machines near it, to tap; or, where none is, its manufacturer, model
 * and serial number, of which the app makes its id. "Done" and the way back to the suggestions are buttons of
 * the card, in its footer and its head.
 */
function WhichMachine({
  step,
  makers,
  onChange,
  onChosen,
}: {
  step: Named
  makers: ReadonlyArray<Maker>
  onChange: (next: Partial<Named>) => void
  onChosen: () => void
}) {
  const id = useId()
  if (!step.none) {
    return (
      <OpenStep title={`Which machine is ${step.name}?`}>
        <ul className="-mx-2 flex flex-col">
          {step.meant.map((one) => (
            <li key={one.machine}>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto w-full justify-start px-2 py-1.5 text-left font-normal whitespace-normal"
                onClick={() => {
                  onChange({ chosen: one })
                  onChosen()
                }}
              >
                <span className="min-w-0 wrap-anywhere">
                  {one.what}
                  {one.manufacturer && <span className="text-muted-foreground"> · {one.manufacturer}</span>}
                  {one.standsOn && <span className="text-muted-foreground"> · on {whereInWords(one.standsOn.siteName, one.standsOn.hall)}</span>}
                </span>
              </Button>
            </li>
          ))}
          <li>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto w-full justify-start px-2 py-1.5 font-normal text-muted-foreground"
              onClick={() => onChange({ none: true, chosen: null })}
            >
              None of these: a new machine
            </Button>
          </li>
        </ul>
      </OpenStep>
    )
  }
  const machine = machineIdOf(step.identity, makers)
  return (
    <OpenStep title={`What is ${step.name}?`}>
      <IdentityFields
        id={id}
        value={step.identity}
        onChange={(next) => onChange({ identity: { ...step.identity, ...next }, settled: false })}
        problems={step.settled ? problemsOfIdentity(step.identity, makers) : undefined}
        machineId={machine}
      />
    </OpenStep>
  )
}

/** The machines that stand in one place of a list, by id. */
function standingAt(list: SiteList, siteId: string, hall: string | null): Set<string> {
  return new Set(
    list.sites
      .filter((site) => site.siteId === siteId)
      .flatMap((site) => site.halls.filter((one) => one.name === hall).flatMap((one) => one.machines.map((machine) => machine.machine))),
  )
}

/** What a click did, by the lists before and after it: "3 machines added, 1 moved · North plant · Hall 4". */
function doneInWords(before: SiteList, after: SiteList, outcome: { siteId: string; siteName: string; hall: string | null }): string {
  const was = standingAt(before, outcome.siteId, outcome.hall)
  const arrived = [...standingAt(after, outcome.siteId, outcome.hall)].filter((machine) => !was.has(machine))
  const placed = new Set(before.sites.flatMap((site) => site.halls.flatMap((hall) => hall.machines.map((one) => one.machine))))
  const moved = arrived.filter((machine) => placed.has(machine)).length
  const added = arrived.length - moved
  const where = whereInWords(outcome.siteName, outcome.hall)
  const machines = (count: number) => (count === 1 ? "1 machine" : `${count} machines`)
  if (moved === 0) return `${machines(added)} added · ${where}`
  if (added === 0) return `${machines(moved)} moved · ${where}`
  return `${machines(added)} added, ${moved} moved · ${where}`
}

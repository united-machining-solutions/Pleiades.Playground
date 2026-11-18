import type { State } from "@pleiades/cards/machine/contract.ts"
import { stateLabel } from "@pleiades/cards/machine/state.ts"
import type { SiteList } from "@pleiades/cards/site/contract.ts"
import { modelOf } from "@pleiades/cards/site/in-words.ts"
import { Alert, AlertDescription } from "@pleiades/ui/components/alert"
import { Button } from "@pleiades/ui/components/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@pleiades/ui/components/combobox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@pleiades/ui/components/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@pleiades/ui/components/field"
import { Input } from "@pleiades/ui/components/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@pleiades/ui/components/select"
import { Spinner } from "@pleiades/ui/components/spinner"
import { CircleAlertIcon } from "lucide-react"
import { useId, useMemo, useState } from "react"
import type { FormEvent } from "react"

import { MAX_TEXT, companyOf } from "./placing.ts"
import type { PlaceOutcome, PlaceRequest, Placement } from "./placing.ts"
import { typedMachineOf } from "./unplaced.ts"

// The dialog of "Add machine" and "Move": which machine, the site, the hall and the name people know
// it by. The machines to add are those that sent data in the last 24 hours and stand on no site, or one
// a person names by its id; the sites and their halls are those of the list Home read. A new site or hall is made when the
// machine is placed.

/** A site to choose, or the entry that makes a new one. */
type SiteChoice = { siteId: string; name: string; company: string; halls: Array<string> }

const NEW_SITE: SiteChoice = { siteId: "", name: "New site…", company: "", halls: [] }

/** A machine to add, with what it does now, or the entry where a person types an id. */
type MachineChoice = { machine: string; what: string; state: State | null }

const ANOTHER: MachineChoice = { machine: "", what: "Another machine…", state: null }

/** The choices of the hall: none, a hall of the site, or a new one. */
const NO_HALL = "none"
const NEW_HALL = "new"
const hallKey = (hall: string) => `hall:${hall}`

function siteChoicesOf(list: SiteList): Array<SiteChoice> {
  const sites = list.sites.map((site) => ({
    siteId: site.siteId,
    name: site.name,
    company: site.company,
    halls: site.halls.flatMap((hall) => (hall.name === null ? [] : [hall.name])),
  }))
  return [...sites, NEW_SITE]
}

function machineChoicesOf(list: SiteList): Array<MachineChoice> {
  return [...list.unplaced.map((one) => ({ machine: one.machine, what: modelOf(one), state: one.state })), ANOTHER]
}

/**
 * What the dialog is for: adding a machine to a site, with `first` chosen where "Review and add"
 * opened it, or moving one that stands on a site, `placed`.
 */
export type PlaceMode = { kind: "add"; first?: string | undefined } | { kind: "move"; machine: string; title: string; what: string; placed: Placement }

/**
 * The dialog. `onPlace` sends the request with what the machine is, for the words of the toast, and
 * says what became of it; the dialog closes when it is done.
 */
export function PlaceDialog({
  open,
  onOpenChange,
  mode,
  list,
  onPlace,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: PlaceMode
  list: SiteList
  onPlace: (request: PlaceRequest, what: string) => Promise<PlaceOutcome>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* The form is drawn anew each time the dialog opens, so it starts from where the machine stands. */}
        <PlaceForm mode={mode} list={list} onPlace={onPlace} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function PlaceForm({
  mode,
  list,
  onPlace,
  onDone,
}: {
  mode: PlaceMode
  list: SiteList
  onPlace: (request: PlaceRequest, what: string) => Promise<PlaceOutcome>
  onDone: () => void
}) {
  const id = useId()
  const placed = mode.kind === "move" ? mode.placed : undefined
  // Built when the list changes, not with every key a person presses.
  const sites = useMemo(() => siteChoicesOf(list), [list])
  const machines = useMemo(() => machineChoicesOf(list), [list])
  const [machine, setMachine] = useState<MachineChoice | null>(() =>
    mode.kind === "add" ? (machines.find((one) => one !== ANOTHER && one.machine === mode.first) ?? null) : null,
  )
  const [typed, setTyped] = useState("")
  const [site, setSite] = useState<SiteChoice | null>(() => sites.find((one) => one.siteId === placed?.siteId) ?? null)
  const [siteName, setSiteName] = useState("")
  const [company, setCompany] = useState(() => companyOf(list))
  const [hall, setHall] = useState<string>(() => (placed?.hall ? hallKey(placed.hall) : NO_HALL))
  const [newHall, setNewHall] = useState("")
  const [displayName, setDisplayName] = useState(placed?.displayName ?? "")
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string>()

  const byHand = machine === ANOTHER
  const typedMachine = byHand ? typedMachineOf(list, typed.trim()) : undefined
  // What the machine is, for the placeholder of its name and the words of the toast.
  const what =
    mode.kind === "move"
      ? mode.what
      : typedMachine?.kind === "sending"
        ? modelOf(typedMachine.machine)
        : byHand
          ? typed.trim()
          : (machine?.what ?? "")
  const machineId = mode.kind === "move" ? mode.machine : byHand ? typed.trim() : (machine?.machine ?? "")

  const isNew = site === NEW_SITE
  const halls = site && !isNew ? site.halls : []
  // A hall of another site, after the site changed, is no hall.
  const hallChosen = hall === NO_HALL || hall === NEW_HALL || halls.some((one) => hallKey(one) === hall) ? hall : NO_HALL
  const hallItems = [
    { label: "No hall", value: NO_HALL },
    ...halls.map((one) => ({ label: one, value: hallKey(one) })),
    { label: "New hall…", value: NEW_HALL },
  ]
  const missing = {
    machine: mode.kind === "add" && (machine === null || (byHand && typed.trim() === "")),
    // A typed id that is no id, or of a machine that stands on a site already, cannot be added.
    typed: typedMachine?.kind === "invalid" && typed.trim() !== "",
    placed: typedMachine?.kind === "placed",
    site: site === null,
    siteName: isNew && siteName.trim() === "",
    company: isNew && company.trim() === "",
    hall: !isNew && hallChosen === NEW_HALL && newHall.trim() === "",
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTried(true)
    if (site === null || Object.values(missing).some(Boolean)) return
    const chosenHall = isNew ? newHall : hallChosen === NEW_HALL ? newHall : hallChosen === NO_HALL ? null : hallChosen.slice("hall:".length)
    setBusy(true)
    setRefused(undefined)
    try {
      const outcome = await onPlace(
        {
          machine: machineId,
          site: isNew ? { name: siteName, company } : { siteId: site.siteId },
          hall: chosenHall,
          newHall: isNew || hallChosen === NEW_HALL,
          displayName,
          from: placed ? { siteId: placed.siteId, hall: placed.hall } : null,
        },
        what,
      )
      if (outcome.ok) onDone()
      else setRefused(outcome.reason)
    } catch (error) {
      setRefused(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const machineInvalid = (tried && missing.machine) || missing.typed || missing.placed
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-6" noValidate>
      <DialogHeader>
        <DialogTitle>{mode.kind === "move" ? `Move ${mode.title}` : "Add machine"}</DialogTitle>
        <DialogDescription>
          {mode.kind === "move"
            ? "Choose where it stands now. Its values and notifications stay as they are."
            : "Choose a machine that sent data lately, or name one by its id, and the site it stands on."}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        {mode.kind === "add" && (
          <Field data-invalid={machineInvalid || undefined}>
            <FieldLabel htmlFor={`${id}-machine`}>Machine</FieldLabel>
            <Combobox
              items={machines}
              value={machine}
              onValueChange={(chosen: MachineChoice | null) => setMachine(chosen)}
              itemToStringLabel={(one: MachineChoice) => one.what}
              itemToStringValue={(one: MachineChoice) => one.machine}
              isItemEqualToValue={(a: MachineChoice, b: MachineChoice) => a.machine === b.machine}
              // "Another machine…" stays in the list, whatever is typed.
              filter={(one: MachineChoice, query: string) =>
                one === ANOTHER || `${one.what} ${one.machine}`.toLowerCase().includes(query.trim().toLowerCase())
              }
            >
              <ComboboxInput
                id={`${id}-machine`}
                placeholder="Find a machine"
                className="w-full"
                aria-invalid={(tried && missing.machine && !byHand) || undefined}
              />
              <ComboboxContent>
                <ComboboxEmpty>No machine of that name sent data lately.</ComboboxEmpty>
                <ComboboxList>
                  {(one: MachineChoice) => (
                    <ComboboxItem key={one.machine || "another"} value={one}>
                      {one.what}
                      {one.state && <span className="ml-auto text-muted-foreground">{stateLabel[one.state]}</span>}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            {byHand && (
              <Input
                aria-label="Machine id"
                value={typed}
                placeholder="manufacturer_model_serial number"
                spellCheck={false}
                onChange={(event) => setTyped(event.target.value)}
                aria-invalid={machineInvalid || undefined}
              />
            )}
            {byHand && <TypedHint typed={typed} tried={tried} kind={typedMachine} />}
            {!byHand && tried && missing.machine && <FieldError>Choose a machine, or name one by its id.</FieldError>}
          </Field>
        )}

        <Field data-invalid={(tried && missing.site) || undefined}>
          <FieldLabel htmlFor={`${id}-site`}>Site</FieldLabel>
          <Combobox
            items={sites}
            value={site}
            onValueChange={(chosen: SiteChoice | null) => setSite(chosen)}
            itemToStringLabel={(one: SiteChoice) => one.name}
            itemToStringValue={(one: SiteChoice) => one.siteId}
            isItemEqualToValue={(a: SiteChoice, b: SiteChoice) => a.siteId === b.siteId}
            // "New site…" stays in the list, whatever is typed.
            filter={(one: SiteChoice, query: string) =>
              one === NEW_SITE || `${one.name} ${one.company}`.toLowerCase().includes(query.trim().toLowerCase())
            }
          >
            <ComboboxInput id={`${id}-site`} placeholder="Find a site" className="w-full" aria-invalid={(tried && missing.site) || undefined} />
            <ComboboxContent>
              <ComboboxEmpty>No site of that name.</ComboboxEmpty>
              <ComboboxList>
                {(one: SiteChoice) => (
                  <ComboboxItem key={one.siteId || "new"} value={one}>
                    {one.name}
                    {one !== NEW_SITE && <span className="ml-auto text-muted-foreground">{one.company}</span>}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          {tried && missing.site && <FieldError>Choose a site, or make a new one.</FieldError>}
        </Field>

        {isNew && (
          <>
            <Field data-invalid={(tried && missing.siteName) || undefined}>
              <FieldLabel htmlFor={`${id}-name`}>Name of the site</FieldLabel>
              <Input
                id={`${id}-name`}
                value={siteName}
                maxLength={MAX_TEXT}
                placeholder="North plant"
                onChange={(event) => setSiteName(event.target.value)}
                aria-invalid={(tried && missing.siteName) || undefined}
              />
              {tried && missing.siteName && <FieldError>A site needs a name.</FieldError>}
            </Field>
            <Field data-invalid={(tried && missing.company) || undefined}>
              <FieldLabel htmlFor={`${id}-company`}>Company</FieldLabel>
              <Input
                id={`${id}-company`}
                value={company}
                maxLength={MAX_TEXT}
                onChange={(event) => setCompany(event.target.value)}
                aria-invalid={(tried && missing.company) || undefined}
              />
              {tried && missing.company && <FieldError>A site needs a company.</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-new-hall`}>Hall</FieldLabel>
              <Input id={`${id}-new-hall`} value={newHall} maxLength={MAX_TEXT} onChange={(event) => setNewHall(event.target.value)} />
              <FieldDescription>Optional. A machine added here later can add another hall.</FieldDescription>
            </Field>
          </>
        )}

        {site !== null && !isNew && (
          <Field data-invalid={(tried && missing.hall) || undefined}>
            <FieldLabel htmlFor={`${id}-hall`}>Hall</FieldLabel>
            <Select items={hallItems} value={hallChosen} onValueChange={(chosen) => setHall(chosen ?? NO_HALL)}>
              <SelectTrigger id={`${id}-hall`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {hallItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {hallChosen === NEW_HALL && (
              <Input
                aria-label="Name of the new hall"
                value={newHall}
                maxLength={MAX_TEXT}
                onChange={(event) => setNewHall(event.target.value)}
                aria-invalid={(tried && missing.hall) || undefined}
              />
            )}
            {tried && missing.hall && <FieldError>A new hall needs a name.</FieldError>}
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor={`${id}-display`}>Display name</FieldLabel>
          <Input
            id={`${id}-display`}
            value={displayName}
            maxLength={MAX_TEXT}
            placeholder={what}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <FieldDescription>Optional. The name people know the machine by.</FieldDescription>
        </Field>
      </FieldGroup>

      {refused && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{refused}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={busy || missing.placed}>
          {busy && <Spinner data-icon="inline-start" />}
          {mode.kind === "move" ? "Move" : "Add"}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** What the stack knows of a machine id a person typed, under the field. */
function TypedHint({ typed, tried, kind }: { typed: string; tried: boolean; kind: ReturnType<typeof typedMachineOf> | undefined }) {
  if (typed.trim() === "") {
    return tried ? (
      <FieldError>Name the machine by its id.</FieldError>
    ) : (
      <FieldDescription>The id in its topics, below machines/: manufacturer_model_serial number.</FieldDescription>
    )
  }
  switch (kind?.kind) {
    case "invalid":
      return <FieldError>{kind.problem}</FieldError>
    case "placed":
      return <FieldError>It already stands on {kind.siteName}. Move it from its row.</FieldError>
    case "sending":
      return <FieldDescription>It sent data in the last 24 hours: {modelOf(kind.machine)}.</FieldDescription>
    default:
      return <FieldDescription>No value from it in the last 24 hours. It shows "No data" until it sends.</FieldDescription>
  }
}

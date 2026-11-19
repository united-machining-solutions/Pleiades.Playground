import { CircleAlertIcon, CircleCheckIcon, InfoIcon, NetworkIcon, ServerIcon, ShieldAlertIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "@tanstack/react-router"
import { Fragment, useEffect, useId, useState } from "react"
import type { ComponentProps, ReactNode } from "react"

import type { ChatTool, ToolLabel } from "@/chat/tool-results.ts"
import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@pleiades/ui/components/alert-dialog"
import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@pleiades/ui/components/collapsible"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@pleiades/ui/components/field"
import { Input } from "@pleiades/ui/components/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@pleiades/ui/components/select"
import { toast } from "@pleiades/ui/components/toast"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@pleiades/ui/components/item"
import { RadioGroup, RadioGroupItem } from "@pleiades/ui/components/radio-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"

import { chooseSecurity, commitProposal, forgetSecurity, removeMachine, storeUser } from "@/opcua/adapter.ts"
import type { Outcome } from "@/opcua/adapter.ts"
import { siteStepOf } from "@/sites/placing.ts"
import type { AddedOutcome, SiteStep, SitesOutcome } from "@/sites/placing.ts"
import { listSites, placeAddedMachine } from "@/sites/sites-api.ts"
import {
  addedInWords,
  chosenRows,
  doneInWords,
  endpointSummary,
  inDoubt,
  securityKey,
  securityWarning,
  machineListOf,
  mappingOf,
  needingALook,
  proposalOf,
  rankedEndpointsOf,
  sameChoice,
  securityOf,
  serverListOf,
  shownProfiles,
  shownValue,
  userStep,
} from "./results.ts"
import type {
  MachineList,
  MappingRow,
  MappingState,
  MappingSummary,
  Mapping,
  ProfileCheck,
  Proposal,
  RankedEndpoint,
  RankedEndpoints,
  RowChoice,
  SecurityWarning,
  Server,
  ServerList,
} from "./results.ts"

// The OPC UA cards in the chat: the added servers, the machines a server serves, the mapping of one,
// and a proposal after a scan.
// chat/cards.tsx lists this module. Adding and removing a machine are buttons here, never tools of
// the language model. A machine that is added goes on a site too, so Home shows it: the only one there
// is, or the one the person chooses.

const stateBadge: Record<MappingState, "default" | "secondary" | "destructive" | "outline"> = {
  Mismatch: "destructive",
  Unclear: "default",
  Derived: "secondary",
  Missing: "outline",
  Ok: "outline",
}

/**
 * The chips of a card that has the rows: one chosen, the table shows its rows. Without `onChoose` the chips are
 * only badges, as on the list of servers, which has the numbers but not the rows.
 */
type Choosing = {
  chosen?: RowChoice | null
  onChoose?: (choice: RowChoice | null) => void
  /** The id of the list the chips fill, for `aria-controls`. */
  controls?: string
}

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>

/**
 * The hover of a chip that is a button. Badge has one only for a link (`[a]:hover`); this is the same for a
 * button, with the tokens of the variant.
 */
const chipHover: Partial<Record<BadgeVariant, string>> = {
  default: "hover:bg-primary/80",
  secondary: "hover:bg-secondary/80",
  destructive: "hover:bg-destructive/20",
  outline: "hover:bg-muted hover:text-muted-foreground",
}

/**
 * A chip that chooses rows. Pressed again, it lets go of them. It is 24px high, the least target size of
 * WCAG 2.2 (2.5.8), where a badge is 20px.
 */
function ChoiceBadge({
  choice,
  chosen,
  onChoose,
  controls,
  variant = "default",
  children,
}: Choosing & { choice: RowChoice; variant: BadgeVariant; children: ReactNode }) {
  if (!onChoose) return <Badge variant={variant}>{children}</Badge>
  const pressed = sameChoice(choice, chosen)
  const shown = pressed ? "default" : variant
  return (
    <Badge
      variant={shown}
      className={`h-6 cursor-pointer ${chipHover[shown] ?? ""}`}
      render={
        <button
          type="button"
          aria-pressed={pressed}
          aria-controls={controls}
          onClick={() => onChoose(pressed ? null : choice)}
        />
      }
    >
      {children}
    </Badge>
  )
}

/** The numbers of a mapping, what needs a look first. A zero is left out. */
function Counts({ summary, ...choosing }: Choosing & { summary: MappingSummary }) {
  const parts: Array<[MappingState, number]> = [
    ["Mismatch", summary.mismatch],
    ["Unclear", summary.unclear],
    ["Derived", summary.derived],
    ["Missing", summary.missing],
    ["Ok", summary.ok],
  ]
  return (
    <span className={choosing.onChoose ? "flex flex-wrap gap-2" : "flex flex-wrap gap-1"}>
      {parts
        .filter(([, count]) => count > 0)
        .map(([state, count]) => (
          <ChoiceBadge key={state} choice={{ state }} variant={stateBadge[state]} {...choosing}>
            {count} {state.toLowerCase()}
          </ChoiceBadge>
        ))}
    </span>
  )
}

/** A profile with the instances it publishes: "ChannelMonitoring 1, 2". */
function profileName(check: ProfileCheck): string {
  return check.instances.length > 0 ? `${check.name} ${check.instances.join(", ")}` : check.name
}

/**
 * The core and the profiles of the data model at a glance: whether the core is fulfilled, the profiles that
 * are complete, and those the server offers in part, which are not published.
 */
function ProfileBadges({ checks, ...choosing }: Choosing & { checks?: ReadonlyArray<ProfileCheck> }) {
  const { core, fulfilled, incomplete } = shownProfiles(checks)
  if (!core) return null
  return (
    <span className={choosing.onChoose ? "flex flex-wrap gap-2" : "flex flex-wrap gap-1"}>
      {core.fulfilled ? (
        <Badge variant="secondary">
          <CircleCheckIcon data-icon="inline-start" />
          Core complete
        </Badge>
      ) : (
        <ChoiceBadge choice={{ profile: core.name }} variant="outline" {...choosing}>
          <CircleAlertIcon data-icon="inline-start" />
          Core: {core.missing.length} not available
        </ChoiceBadge>
      )}
      {fulfilled.map((check) => (
        <Badge key={check.name} variant="outline">
          {profileName(check)}
        </Badge>
      ))}
      {incomplete.map((check) => (
        <ChoiceBadge key={check.name} choice={{ profile: check.name }} variant="ghost" {...choosing}>
          {check.name} incomplete
        </ChoiceBadge>
      ))}
    </span>
  )
}

/**
 * The list the chips fill: the rows of the chosen chip, or what stands without a choice. The chips point to it
 * with `aria-controls`, and its first line is always there and polite, so a screen reader says what the chip
 * opened or closed.
 */
function ChosenList({
  id,
  rows,
  choice,
  checks,
  hint,
  idle,
}: {
  id: string
  rows: ReadonlyArray<MappingRow>
  choice: RowChoice | null
  checks?: ReadonlyArray<ProfileCheck>
  /** The line without a choice. */
  hint: string
  /** What stands without a choice. */
  idle?: ReactNode
}) {
  const shown = choice ? chosenRows(rows, choice, checks) : null
  const what =
    choice && shown
      ? `${"state" in choice ? `${shown.length} ${choice.state.toLowerCase()}` : `What ${choice.profile} lacks`}. Press the chip again to close the list.`
      : hint
  return (
    <div id={id} className="flex flex-col gap-2">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {what}
      </p>
      {shown ? shown.length > 0 && <Rows rows={shown} /> : idle}
    </div>
  )
}

/** What the core lacks, and which profiles are not published for what they lack. */
function ProfileGaps({ checks }: { checks?: ReadonlyArray<ProfileCheck> }) {
  const { core, incomplete } = shownProfiles(checks)
  if (!core) return null
  return (
    <>
      {!core.fulfilled && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>The core of the data model is not fulfilled</AlertTitle>
          <AlertDescription>
            A machine is added only with every element of the core. Not mapped: {core.missing.join(", ")}.
          </AlertDescription>
        </Alert>
      )}
      {incomplete.length > 0 && (
        <Alert>
          <CircleAlertIcon />
          <AlertTitle>Profiles that are not published</AlertTitle>
          <AlertDescription>
            <ul>
              {incomplete.map((check) => (
                <li key={check.name}>
                  {check.name} lacks {check.missing.join(", ")}.
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}

/** The elements of a mapping as a table: state, element, value, and why. */
function Rows({ rows }: { rows: ReadonlyArray<MappingRow> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>State</TableHead>
          <TableHead>Element</TableHead>
          <TableHead>Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.area}/${row.path}`}>
            <TableCell className="align-top">
              <Badge variant={stateBadge[row.state]}>{row.state}</Badge>
            </TableCell>
            <TableCell className="align-top whitespace-normal">
              <span className="font-medium">{row.area === "oem" ? `oem/${row.path}` : row.path}</span>
              {row.detail && <span className="block text-muted-foreground">{row.detail}</span>}
            </TableCell>
            <TableCell className="align-top tabular-nums">{shownValue(row)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** What needs a look, and the rest folded away. */
function Review({ rows }: { rows: ReadonlyArray<MappingRow> }) {
  const look = needingALook(rows)
  const fine = rows.filter((row) => row.state === "Ok")
  return (
    <>
      {look.length > 0 ? <Rows rows={look} /> : <p className="text-sm text-muted-foreground">Every element is mapped without doubt.</p>}
      {fine.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
            {fine.length} elements mapped without doubt
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Rows rows={fine} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  )
}

function Done({ outcome, done }: { outcome: Outcome; done: string }) {
  return outcome.ok ? (
    <Alert>
      <CircleCheckIcon />
      <AlertTitle>{done}</AlertTitle>
    </Alert>
  ) : (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>That did not work</AlertTitle>
      <AlertDescription>{outcome.reason}</AlertDescription>
    </Alert>
  )
}

/**
 * What a call to the adapter gave, also when the server function rejects (its validator throws on a user name of
 * only spaces, for example): then the reason is the outcome, and nothing stays busy.
 */
async function outcomeOf(call: () => Promise<Outcome>): Promise<Outcome> {
  try {
    return await call()
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

/** Remove, after the person confirmed it. */
function RemoveServer({ server, onRemoved }: { server: Server; onRemoved: (outcome: Outcome) => void }) {
  const shared = server.sessionSharedWith ?? []
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    setBusy(true)
    try {
      onRemoved(await outcomeOf(() => removeMachine({ data: server.serialNumber })))
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>Remove</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Remove {server.serialNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            {shared.length > 0
              ? `The adapter takes it off the session to ${server.endpoint.url}, which stays open for ${shared.join(", ")}, and forgets the registration.`
              : `The adapter closes its session to ${server.endpoint.url} and forgets the registration.`}{" "}
            Its last values are taken back from the broker. What was stored of it stays in the history. To add
            it again, scan the server again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void remove()}>
            {busy ? "Removing" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ServerRow({ server }: { server: Server }) {
  const [removed, setRemoved] = useState<Outcome>()
  return (
    <Item role="listitem" className="flex-wrap">
      <ItemContent>
        <ItemTitle>
          {server.serialNumber}
          <Badge variant={server.state === "Running" ? "secondary" : server.state === "Initializing" ? "outline" : "destructive"}>
            {server.state}
          </Badge>
          {server.needsRescan && <Badge variant="destructive">Scan again</Badge>}
          {server.endpoint.securityMode === "None" && <Badge variant="destructive">No security</Badge>}
        </ItemTitle>
        <ItemDescription>
          <span className="text-foreground">{server.endpoint.url}</span> · {securityOf(server.endpoint)}
          {server.lastError && ` · ${server.lastError}`}
          {(server.sessionSharedWith?.length ?? 0) > 0 && (
            <span className="block">One session with {server.sessionSharedWith?.join(", ")}</span>
          )}
        </ItemDescription>
        <ProfileBadges checks={server.conformance} />
        <Counts summary={server.mapping} />
      </ItemContent>
      <ItemActions>{removed?.ok ? null : <RemoveServer server={server} onRemoved={setRemoved} />}</ItemActions>
      {removed && (
        <div className="basis-full">
          <Done outcome={removed} done={`${server.serialNumber} is removed.`} />
        </div>
      )}
    </Item>
  )
}

function Servers({ values }: { values: ServerList }) {
  if (values.servers.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ServerIcon />
          </EmptyMedia>
          <EmptyTitle>No OPC UA server is added</EmptyTitle>
          <EmptyDescription>Scan one with /discover opc.tcp://host:port.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <Card className="gap-0 py-0">
      <ItemGroup className="gap-0">
        {values.servers.map((server, position) => (
          <Fragment key={server.serialNumber}>
            {position > 0 && <ItemSeparator className="my-0" />}
            <ServerRow server={server} />
          </Fragment>
        ))}
      </ItemGroup>
    </Card>
  )
}

/** The machines a server serves. A gateway serves several; each is added by its own proposal. */
function ServedMachines({ values }: { values: MachineList }) {
  if (values.machines.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <NetworkIcon />
          </EmptyMedia>
          <EmptyTitle>No machine found</EmptyTitle>
          <EmptyDescription>
            {values.url} serves no object with an Identification and a serial number. A gateway may not reach its machines.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="pb-4">
        <CardTitle>
          {values.machines.length === 1 ? "One machine" : `${values.machines.length} machines`} at {values.url}
        </CardTitle>
        <CardDescription>
          {values.gateway ? "A gateway: the machines share one session. " : ""}
          {values.endpoint && securityOf(values.endpoint)}
        </CardDescription>
      </CardHeader>
      <ItemGroup className="gap-0">
        {values.machines.map((machine) => (
          <Fragment key={machine.node}>
            <ItemSeparator className="my-0" />
            <Item size="sm">
              <ItemContent>
                <ItemTitle>
                  {machine.serialNumber ?? "No serial number"}
                  {machine.added && <Badge variant="secondary">Added</Badge>}
                </ItemTitle>
                <ItemDescription>
                  {[machine.path, machine.manufacturer, machine.model].filter(Boolean).join(" · ")}
                </ItemDescription>
              </ItemContent>
            </Item>
          </Fragment>
        ))}
      </ItemGroup>
    </Card>
  )
}

function ShownMapping({ values }: { values: Mapping }) {
  const { server } = values
  const [chosen, setChosen] = useState<RowChoice | null>(null)
  const listId = useId()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mapping of {server.serialNumber}</CardTitle>
        <CardDescription>
          {server.endpoint.url} · {securityOf(server.endpoint)} · {server.state}
        </CardDescription>
        <Counts summary={server.mapping} chosen={chosen} onChoose={setChosen} controls={listId} />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ChosenList
          id={listId}
          rows={values.rows}
          choice={chosen}
          checks={server.conformance}
          hint="Press a chip above to see only its elements."
          idle={<Review rows={values.rows} />}
        />
      </CardContent>
    </Card>
  )
}

function ChangeList({ proposal }: { proposal: Proposal }) {
  const changes = proposal.changes
  if (!proposal.replaces || !changes) return null
  if (!changes.any) return <p className="text-sm text-muted-foreground">Nothing would change against the stored registration.</p>
  const lines: Array<[string, Array<string>]> = [
    ["New profiles", changes.profilesAdded],
    ["Profiles gone", changes.profilesRemoved],
    ["New elements", changes.added],
    ["Changed elements", changes.changed],
    ["Elements gone", changes.removed],
  ]
  return (
    <ul className="text-sm">
      {lines
        .filter(([, items]) => items.length > 0)
        .map(([title, items]) => (
          <li key={title}>
            <span className="font-medium">{title}:</span> {items.join(", ")}
          </li>
        ))}
      {changes.endpointChanged && <li className="font-medium">The endpoint or its security changes.</li>}
    </ul>
  )
}

/**
 * The sites there are, read once when the card of a machine to add is drawn, so the machine goes on one of
 * them: undefined while they are read.
 */
function useSites(wanted: boolean): SitesOutcome | undefined {
  const [sites, setSites] = useState<SitesOutcome>()
  useEffect(() => {
    if (!wanted) return
    let current = true
    listSites()
      .catch((error: unknown): SitesOutcome => ({ ok: false, reason: error instanceof Error ? error.message : String(error) }))
      .then((outcome) => {
        if (current) setSites(outcome)
      })
    return () => {
      current = false
    }
  }, [wanted])
  return sites
}

/**
 * The site a machine to add goes on: the only one there is, said in a line, or the one a person chooses from
 * the list. Where there is none, or the Sites API does not answer, the line says that it goes on no site.
 */
function SitePick({
  id,
  sites,
  step,
  chosen,
  onChoose,
  invalid,
}: {
  id: string
  sites: SitesOutcome | undefined
  step: SiteStep
  chosen: string | null
  onChoose: (siteId: string | null) => void
  invalid: boolean
}) {
  if (sites === undefined) return <p className="text-sm text-muted-foreground">Reading the sites…</p>
  if (!sites.ok) return <p className="text-sm text-muted-foreground">It goes on no site: {sites.reason}</p>
  if (step.kind === "none") {
    return <p className="text-sm text-muted-foreground">There is no site yet: put it on one with Add machine on Home.</p>
  }
  if (step.kind === "one") return <p className="text-sm text-muted-foreground">It goes on {step.site.name}.</p>
  const items = step.sites.map((site) => ({ label: site.name, value: site.siteId }))
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>Site</FieldLabel>
      <Select items={items} value={chosen} onValueChange={(value) => onChoose(typeof value === "string" ? value : null)}>
        <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined}>
          <SelectValue placeholder="Choose a site" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {invalid ? <FieldError>Choose the site the machine stands on.</FieldError> : <FieldDescription>Home shows the machine on it.</FieldDescription>}
    </Field>
  )
}

/** What became of putting an added machine on a site, also when the server function rejects. */
async function placedOf(call: () => Promise<AddedOutcome>): Promise<AddedOutcome> {
  try {
    return await call()
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

function ShownProposal({ values }: { values: Proposal }) {
  const [outcome, setOutcome] = useState<Outcome>()
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  // A new machine goes on a site, else Home does not show it. A registration that replaces one leaves the
  // machine where it stands, and an older adapter does not say the machine id it publishes under.
  const machineId = !values.replaces && values.accepted && values.draftId ? values.machineId : undefined
  const sites = useSites(machineId !== undefined)
  const step: SiteStep = sites?.ok ? siteStepOf(sites.sites) : { kind: "none" }
  const [siteId, setSiteId] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [placed, setPlaced] = useState<AddedOutcome>()
  const site = step.kind === "one" ? step.site : step.kind === "choose" ? step.sites.find((one) => one.siteId === siteId) : undefined
  const pickId = useId()
  // The table is closed until a chip is chosen, but for a mapping in doubt: that stands open, so no one adds a
  // machine with a wrong element without having seen it. The alerts say what the core and the profiles lack.
  const [chosen, setChosen] = useState<RowChoice | null>(null)
  const listId = useId()
  const doubts = inDoubt(values.rows)
  const add = async () => {
    if (!values.draftId) return
    const draftId = values.draftId
    if (machineId !== undefined && step.kind === "choose" && site === undefined) {
      setTried(true)
      return
    }
    setBusy(true)
    try {
      const committed = await outcomeOf(() => commitProposal({ data: draftId }))
      const onSite =
        committed.ok && machineId !== undefined && site !== undefined
          ? await placedOf(() => placeAddedMachine({ data: { machine: machineId, siteId: site.siteId } }))
          : undefined
      setPlaced(onSite)
      setOutcome(committed)
      if (!committed.ok) return
      if (onSite?.ok) void router.invalidate()
      const { title, description } = addedInWords(values, sites, onSite)
      toast.add({ title, description })
    } finally {
      setBusy(false)
    }
  }
  const verb = values.replaces ? "Replace the registration" : "Add the machine"
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {values.replaces ? "New registration for" : "Proposal:"} {values.serialNumber}
        </CardTitle>
        <CardDescription>
          {values.endpoint.url} · {securityOf(values.endpoint)}
          {values.endpoint.certificateThumbprint && (
            <span className="block break-all">Server certificate {values.endpoint.certificateThumbprint}</span>
          )}
        </CardDescription>
        <ProfileBadges checks={values.conformance} chosen={chosen} onChoose={setChosen} controls={listId} />
        {values.summary && <Counts summary={values.summary} chosen={chosen} onChoose={setChosen} controls={listId} />}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <SecurityAlert warning={securityWarning(values.endpoint)} />
        <ProfileGaps checks={values.conformance} />
        {values.notices && values.notices.length > 0 && (
          <Alert>
            <InfoIcon />
            <AlertTitle>Good to know</AlertTitle>
            <AlertDescription>
              <ul>
                {values.notices.map((notice) => (
                  <li key={notice}>{notice}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {!values.accepted && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>The proposal does not fit the server</AlertTitle>
            <AlertDescription>
              <ul>
                {values.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <ChangeList proposal={values} />
        {values.rows.length > 0 &&
          (values.summary ? (
            <ChosenList
              id={listId}
              rows={values.rows}
              choice={chosen}
              checks={values.conformance}
              hint={
                doubts.length > 0
                  ? `${doubts.length === 1 ? "One element is" : `${doubts.length} elements are`} in doubt: look at ${doubts.length === 1 ? "it" : "them"} before you add the machine. Press a chip above to see the others.`
                  : "Press a chip above to see its elements."
              }
              idle={doubts.length > 0 && <Rows rows={doubts} />}
            />
          ) : (
            // An older adapter gives no numbers, so there is no chip to press.
            <Review rows={values.rows} />
          ))}
      </CardContent>
      {values.accepted && values.draftId && (
        <CardFooter className="flex flex-col items-stretch gap-2">
          {outcome ? (
            <Done outcome={outcome} done={doneInWords(values, sites, placed)} />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Check the certificate and what needs a look. The adapter tries the registration once more when you click.
              </p>
              {machineId !== undefined && (
                <SitePick
                  id={pickId}
                  sites={sites}
                  step={step}
                  chosen={siteId}
                  onChoose={(chosen) => {
                    setSiteId(chosen)
                    setTried(false)
                  }}
                  invalid={tried && site === undefined}
                />
              )}
              <Button disabled={busy || (machineId !== undefined && sites === undefined)} onClick={() => void add()}>
                {busy ? "Adding" : verb}
              </Button>
            </>
          )}
        </CardFooter>
      )}
    </Card>
  )
}

/**
 * The user name and password of a server, typed by the person. They go from here to the server of the
 * app and on to the adapter, which tries them on the server before it keeps them. They are never part
 * of the chat, so the language model does not see them.
 */
function UserForm({ url, user }: { url: string; user?: string }) {
  const id = useId()
  const [outcome, setOutcome] = useState<Outcome>()
  const [busy, setBusy] = useState(false)
  const store = async (form: HTMLFormElement) => {
    const data = new FormData(form)
    setBusy(true)
    try {
      const result = await outcomeOf(() =>
        storeUser({ data: { url, user: String(data.get("user") ?? ""), password: String(data.get("password") ?? "") } }),
      )
      if (result.ok) form.reset()
      setOutcome(result)
    } finally {
      setBusy(false)
    }
  }
  if (outcome?.ok) {
    return (
      <Done
        outcome={outcome}
        done="The user is stored, and the machines added from this server start their sessions anew with it. Tell the chat to go on: it connects again and logs in with the user."
      />
    )
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void store(event.currentTarget)
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-user`}>User name</FieldLabel>
          <Input id={`${id}-user`} name="user" autoComplete="username" defaultValue={user} required />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-password`}>Password</FieldLabel>
          <Input id={`${id}-password`} name="password" type="password" autoComplete="current-password" required />
          <FieldDescription>
            Goes to the OPC UA adapter, not into the chat. The adapter tries it on the server before it keeps it.
          </FieldDescription>
        </Field>
      </FieldGroup>
      {outcome && <Done outcome={outcome} done="" />}
      <Button type="submit" disabled={busy}>
        {busy ? "Trying the user" : "Store the user"}
      </Button>
    </form>
  )
}

/** The warning a security deserves: destructive for no security at all, plain for one that is weak. */
function SecurityAlert({ warning }: { warning: SecurityWarning | undefined }) {
  if (!warning) return null
  return (
    <Alert variant={warning.severity === "danger" ? "destructive" : "default"}>
      <ShieldAlertIcon />
      <AlertTitle>{warning.title}</AlertTitle>
      <AlertDescription>{warning.text}</AlertDescription>
    </Alert>
  )
}

/** An endpoint in words, with the user only where a session there logs in with it. */
function securityIn(endpoint: RankedEndpoint, user: string | undefined): string {
  return securityOf({ ...endpoint, user: endpoint.withUser === false ? undefined : user })
}

/**
 * The security of the sessions to a server, chosen by the person: every endpoint the adapter can use, the strongest
 * first, None included. The warning of the endpoint picked stands before the button, so no one chooses no security
 * without having read what it means. The choice goes from here to the server of the app and on to the adapter,
 * never through the language model.
 */
function SecurityChoice({ values }: { values: RankedEndpoints }) {
  const id = useId()
  const { used, chosen, dormant } = endpointSummary(values)
  const usedKey = used ? securityKey(used) : ""
  const [picked, setPicked] = useState(usedKey)
  const [outcome, setOutcome] = useState<{ outcome: Outcome; done: string }>()
  const [busy, setBusy] = useState(false)
  const endpoint = values.endpoints.find((one) => securityKey(one) === picked)
  const run = async (call: () => Promise<Outcome>, done: string) => {
    setBusy(true)
    try {
      setOutcome({ outcome: await outcomeOf(call), done })
    } finally {
      setBusy(false)
    }
  }
  const choose = () => {
    if (!endpoint) return
    const { securityMode, securityPolicy } = endpoint
    void run(
      () => chooseSecurity({ data: { url: values.url, securityMode, securityPolicy } }),
      `The adapter connects with ${securityIn(endpoint, values.user)} from now on. Tell the chat to go on.`,
    )
  }
  const back = () =>
    void run(() => forgetSecurity({ data: values.url }), "The adapter takes the strongest endpoint again. Tell the chat to go on.")
  if (outcome?.outcome.ok) return <Done outcome={outcome.outcome} done={outcome.done} />
  return (
    <div className="flex flex-col gap-3">
      <FieldSet>
        <FieldLegend variant="label">Security of the session</FieldLegend>
        <FieldDescription>
          The adapter connects with the endpoint you choose, for the scan and for every machine you add from it.
        </FieldDescription>
        <RadioGroup
          value={picked}
          onValueChange={(value) => {
            setPicked(String(value))
            setOutcome(undefined)
          }}
        >
          {values.endpoints.map((one, position) => {
            const key = securityKey(one)
            return (
              <Field key={key} orientation="horizontal">
                <RadioGroupItem value={key} id={`${id}-${position}`} />
                <FieldContent>
                  <FieldLabel htmlFor={`${id}-${position}`} className="font-normal">
                    {securityIn(one, values.user)}
                    {one.weak && <Badge variant={one.securityMode === "None" ? "destructive" : "outline"}>Weak</Badge>}
                  </FieldLabel>
                  {position === 0 && <FieldDescription>The strongest the server offers.</FieldDescription>}
                </FieldContent>
              </Field>
            )
          })}
        </RadioGroup>
      </FieldSet>
      {endpoint && picked !== usedKey && <SecurityAlert warning={securityWarning(endpoint)} />}
      {outcome && <Done outcome={outcome.outcome} done="" />}
      <Button
        variant={endpoint?.securityMode === "None" ? "destructive" : "default"}
        disabled={busy || !endpoint || picked === usedKey}
        onClick={choose}
      >
        {busy ? "Choosing" : endpoint?.securityMode === "None" ? "Connect without security" : "Connect with this security"}
      </Button>
      {(chosen || dormant) && (
        <Button variant="outline" disabled={busy} onClick={back}>
          Back to the strongest
        </Button>
      )}
    </div>
  )
}

/**
 * The endpoint the adapter takes, in one line, with its warning if it is weak, and the choice of another one
 * folded. That the server also takes sessions without security is said without unfolding.
 */
function EndpointSummary({ values }: { values: RankedEndpoints }) {
  const { used, strongest, chosen, dormant, others, unsecured } = endpointSummary(values)
  if (!used) {
    return (
      <Item size="sm">
        <ItemContent>
          <ItemTitle>No endpoint for this session</ItemTitle>
          <ItemDescription>{values.url} offers no endpoint the adapter can use.</ItemDescription>
        </ItemContent>
      </Item>
    )
  }
  const warning = securityWarning(used)
  return (
    <Collapsible>
      <Item size="sm">
        <ItemContent>
          <ItemTitle>
            {securityIn(used, values.user)}
            {used.weak && <Badge variant={used.securityMode === "None" ? "destructive" : "outline"}>Weak</Badge>}
          </ItemTitle>
          <ItemDescription>
            {chosen && strongest && strongest !== used
              ? `Chosen by a person; the adapter connects with it. The strongest the server offers is ${securityIn(strongest, values.user)}.`
              : chosen
                ? "Chosen by a person; the adapter connects with it."
                : "The strongest the server offers, the one the adapter connects with."}
          </ItemDescription>
          {unsecured && <ItemDescription>The server also accepts sessions without security.</ItemDescription>}
          {dormant && (
            <ItemDescription>
              A person chose {securityOf(dormant)} for this server, which it does not offer now, so the adapter takes the
              strongest. If the server offers it again, the adapter takes it again; "Back to the strongest" forgets it.
            </ItemDescription>
          )}
        </ItemContent>
        {(others.length > 0 || chosen || dormant) && (
          <ItemFooter>
            <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>Choose the security</CollapsibleTrigger>
          </ItemFooter>
        )}
      </Item>
      {warning && (
        <div className="px-4 pb-3">
          <SecurityAlert warning={warning} />
        </div>
      )}
      <CollapsibleContent>
        <ItemSeparator className="my-0" />
        <div className="p-4">
          {/* Keyed by the endpoint taken, so the pick starts there again when the card gets new values. */}
          <SecurityChoice key={securityKey(used)} values={values} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function Endpoints({ values }: { values: RankedEndpoints }) {
  const step = userStep(values)
  if (step === "none") {
    return (
      <Card className="gap-0 py-0">
        <EndpointSummary values={values} />
      </Card>
    )
  }
  if (step === "required") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>The server wants a user</CardTitle>
          <CardDescription>
            {values.url} accepts no session without one. Enter its user name and password here, never in the chat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserForm url={values.url} />
        </CardContent>
      </Card>
    )
  }
  return (
    <Card className="gap-0 pb-0">
      <CardFooter className="flex-col items-stretch pb-3">
        <Collapsible>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
            {values.user
              ? `Logs in as ${values.user}: change the user`
              : "Log in with a user instead of anonymously"}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <UserForm url={values.url} user={values.user} />
          </CollapsibleContent>
        </Collapsible>
      </CardFooter>
      <EndpointSummary values={values} />
    </Card>
  )
}

const label = (running: string, done: string, failed: string): ToolLabel => ({ running, done, failed })

// The cards of the OPC UA adapter are for the chat only (`saveAsPage: false`): a page asks the generative UI
// backend alone (pages/call-part.ts), which has no opcua_* tool, and a scan is no part to run again
// each time a page opens.
export const opcuaTools: ReadonlyArray<ChatTool> = [
  {
    name: "opcua_server_list",
    label: label("Reading the OPC UA servers", "Read the OPC UA servers", "Failed to read the OPC UA servers"),
    saveAsPage: false,
    draw(content) {
      const values = serverListOf(content)
      return values && <Servers values={values} />
    },
  },
  {
    name: "opcua_machine_list",
    label: label("Looking for the machines of the server", "Looked for the machines of the server", "Failed to look for the machines"),
    saveAsPage: false,
    draw(content) {
      const values = machineListOf(content)
      return values && <ServedMachines values={values} />
    },
  },
  {
    name: "opcua_mapping_show",
    label: label("Reading the mapping", "Read the mapping", "Failed to read the mapping"),
    saveAsPage: false,
    draw(content) {
      const values = mappingOf(content)
      return values && <ShownMapping values={values} />
    },
  },
  {
    name: "opcua_registration_propose",
    label: label("Trying the registration on the server", "Tried the registration on the server", "Failed to try the registration"),
    saveAsPage: false,
    draw(content) {
      const values = proposalOf(content)
      return values && <ShownProposal values={values} />
    },
  },
  {
    name: "opcua_endpoint_rank",
    label: label("Asking the server for its endpoints", "Asked the server for its endpoints", "Failed to reach the server"),
    saveAsPage: false,
    draw(content) {
      const values = rankedEndpointsOf(content)
      return values && <Endpoints values={values} />
    },
  },
  { name: "opcua_describe_server", label: label("Looking at the OPC UA adapter", "Looked at the OPC UA adapter", "Failed to look at the OPC UA adapter") },
  { name: "opcua_get_skill_guide", label: label("Reading the scan guide", "Read the scan guide", "Failed to read the scan guide") },
  { name: "opcua_ua_get_endpoints", label: label("Reading the endpoints", "Read the endpoints", "Failed to read the endpoints") },
  { name: "opcua_ua_connect", label: label("Connecting to the server", "Connected to the server", "Failed to connect to the server") },
  { name: "opcua_ua_disconnect", label: label("Closing the session", "Closed the session", "Failed to close the session") },
  { name: "opcua_ua_get_connection_status", label: label("Checking the session", "Checked the session", "Failed to check the session") },
  { name: "opcua_ua_browse", label: label("Browsing the server", "Browsed the server", "Failed to browse the server") },
  { name: "opcua_ua_browse_next", label: label("Browsing on", "Browsed on", "Failed to browse on") },
  { name: "opcua_ua_browse_all", label: label("Browsing the address space", "Browsed the address space", "Failed to browse the address space") },
  { name: "opcua_ua_translate_browse_paths", label: label("Resolving browse paths", "Resolved browse paths", "Failed to resolve browse paths") },
  { name: "opcua_ua_read", label: label("Reading attributes", "Read attributes", "Failed to read attributes") },
  { name: "opcua_ua_read_node", label: label("Reading a node", "Read a node", "Failed to read a node") },
  { name: "opcua_ua_read_value", label: label("Reading a value", "Read a value", "Failed to read a value") },
  { name: "opcua_ua_read_values", label: label("Reading values", "Read values", "Failed to read values") },
]

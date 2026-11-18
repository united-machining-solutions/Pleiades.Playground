import { CircleAlertIcon, CircleCheckIcon, NetworkIcon, ServerIcon, Trash2Icon } from "lucide-react"
import { Fragment, useId, useState } from "react"

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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@pleiades/ui/components/field"
import { Input } from "@pleiades/ui/components/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@pleiades/ui/components/item"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"

import { commitProposal, removeMachine, storeUser } from "@/opcua/adapter.ts"
import type { Outcome } from "@/opcua/adapter.ts"
import {
  machineListOf,
  mappingOf,
  needingALook,
  proposalOf,
  rankedEndpointsOf,
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
  RankedEndpoints,
  Server,
  ServerList,
} from "./results.ts"

// The OPC UA cards in the chat: the added servers, the machines a server serves, the mapping of one,
// and a proposal after a scan.
// chat/cards.tsx lists this module. Adding and removing a machine are buttons here, never tools of
// the language model.

const stateBadge: Record<MappingState, "default" | "secondary" | "destructive" | "outline"> = {
  Mismatch: "destructive",
  Unclear: "default",
  Derived: "secondary",
  Missing: "outline",
  Ok: "outline",
}

/** The numbers of a mapping, what needs a look first. A zero is left out. */
function Counts({ summary }: { summary: MappingSummary }) {
  const parts: Array<[MappingState, number]> = [
    ["Mismatch", summary.mismatch],
    ["Unclear", summary.unclear],
    ["Derived", summary.derived],
    ["Missing", summary.missing],
    ["Ok", summary.ok],
  ]
  return (
    <span className="flex flex-wrap gap-1">
      {parts
        .filter(([, count]) => count > 0)
        .map(([state, count]) => (
          <Badge key={state} variant={stateBadge[state]}>
            {count} {state.toLowerCase()}
          </Badge>
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
function ProfileBadges({ checks }: { checks?: ReadonlyArray<ProfileCheck> }) {
  const { core, fulfilled, incomplete } = shownProfiles(checks)
  if (!core) return null
  return (
    <span className="flex flex-wrap gap-1">
      <Badge variant={core.fulfilled ? "secondary" : "outline"}>
        {core.fulfilled ? <CircleCheckIcon data-icon="inline-start" /> : <CircleAlertIcon data-icon="inline-start" />}
        {core.fulfilled ? "Core complete" : `Core: ${core.missing.length} not available`}
      </Badge>
      {fulfilled.map((check) => (
        <Badge key={check.name} variant="outline">
          {profileName(check)}
        </Badge>
      ))}
      {incomplete.map((check) => (
        <Badge key={check.name} variant="ghost">
          {check.name} incomplete
        </Badge>
      ))}
    </span>
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mapping of {server.serialNumber}</CardTitle>
        <CardDescription>
          {server.endpoint.url} · {securityOf(server.endpoint)} · {server.state}
        </CardDescription>
        <Counts summary={server.mapping} />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Review rows={values.rows} />
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

function ShownProposal({ values }: { values: Proposal }) {
  const [outcome, setOutcome] = useState<Outcome>()
  const [busy, setBusy] = useState(false)
  const add = async () => {
    if (!values.draftId) return
    const draftId = values.draftId
    setBusy(true)
    try {
      setOutcome(await outcomeOf(() => commitProposal({ data: draftId })))
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
        <ProfileBadges checks={values.conformance} />
        {values.summary && <Counts summary={values.summary} />}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ProfileGaps checks={values.conformance} />
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
        {values.rows.length > 0 && <Review rows={values.rows} />}
      </CardContent>
      {values.accepted && values.draftId && (
        <CardFooter className="flex flex-col items-stretch gap-2">
          {outcome ? (
            <Done outcome={outcome} done={`${values.serialNumber} is added. Its values appear on Home within seconds.`} />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Check the certificate and what needs a look. The adapter tries the registration once more when you click.
              </p>
              <Button disabled={busy} onClick={() => void add()}>
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
    return <Done outcome={outcome} done="The user is stored. Tell the chat to go on: the scan logs in with it." />
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

function EndpointList({ values }: { values: RankedEndpoints }) {
  return (
    <ItemGroup className="gap-0">
      {values.endpoints.map((endpoint, position) => (
        <Fragment key={`${endpoint.securityMode}/${endpoint.securityPolicy}`}>
          {position > 0 && <ItemSeparator className="my-0" />}
          <Item size="sm">
            <ItemContent>
              <ItemTitle>
                {securityOf({ ...endpoint, user: values.user })}
                {endpoint.recommended && <Badge variant="secondary">Recommended</Badge>}
                {endpoint.weak && <Badge variant="outline">Weak</Badge>}
              </ItemTitle>
            </ItemContent>
          </Item>
        </Fragment>
      ))}
    </ItemGroup>
  )
}

function Endpoints({ values }: { values: RankedEndpoints }) {
  const step = userStep(values)
  if (step === "none") {
    return (
      <Card className="gap-0 py-0">
        <EndpointList values={values} />
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
            {values.user ? `Logs in as ${values.user}: change the user` : "Log in with a user instead"}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <UserForm url={values.url} user={values.user} />
          </CollapsibleContent>
        </Collapsible>
      </CardFooter>
      <EndpointList values={values} />
    </Card>
  )
}

const label = (running: string, done: string, failed: string): ToolLabel => ({ running, done, failed })

export const opcuaTools: ReadonlyArray<ChatTool> = [
  {
    name: "opcua_server_list",
    label: label("Reading the OPC UA servers", "Read the OPC UA servers", "Failed to read the OPC UA servers"),
    draw(content) {
      const values = serverListOf(content)
      return values && <Servers values={values} />
    },
  },
  {
    name: "opcua_machine_list",
    label: label("Looking for the machines of the server", "Looked for the machines of the server", "Failed to look for the machines"),
    draw(content) {
      const values = machineListOf(content)
      return values && <ServedMachines values={values} />
    },
  },
  {
    name: "opcua_mapping_show",
    label: label("Reading the mapping", "Read the mapping", "Failed to read the mapping"),
    draw(content) {
      const values = mappingOf(content)
      return values && <ShownMapping values={values} />
    },
  },
  {
    name: "opcua_registration_propose",
    label: label("Trying the registration on the server", "Tried the registration on the server", "Failed to try the registration"),
    draw(content) {
      const values = proposalOf(content)
      return values && <ShownProposal values={values} />
    },
  },
  {
    name: "opcua_endpoint_rank",
    label: label("Asking the server for its endpoints", "Asked the server for its endpoints", "Failed to reach the server"),
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

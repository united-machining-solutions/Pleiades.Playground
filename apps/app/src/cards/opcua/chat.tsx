import { CircleAlertIcon, CircleCheckIcon, ServerIcon, Trash2Icon } from "lucide-react"
import { Fragment, useState } from "react"

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
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@pleiades/ui/components/item"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"

import { commitProposal, removeMachine } from "@/opcua/adapter.ts"
import type { Outcome } from "@/opcua/adapter.ts"
import { mappingOf, needingALook, proposalOf, rankedEndpointsOf, securityOf, serverListOf, shownValue } from "./results.ts"
import type { MappingRow, MappingState, MappingSummary, Mapping, Proposal, RankedEndpoints, Server, ServerList } from "./results.ts"

// The OPC UA cards in the chat: the added servers, the mapping of one, and a proposal after a scan.
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
              <span className="font-medium">{row.area === "vendor" ? `vendor/${row.path}` : row.path}</span>
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

/** Remove, after the person confirmed it. */
function RemoveServer({ server, onRemoved }: { server: Server; onRemoved: (outcome: Outcome) => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    setBusy(true)
    const outcome = await removeMachine({ data: server.serialNumber })
    setBusy(false)
    setOpen(false)
    onRemoved(outcome)
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
            The adapter closes its session to {server.endpoint.url} and forgets the registration. The values the
            machine sent stay stored. To add it again, scan the server again.
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
          <Badge variant={server.state === "Connected" ? "secondary" : "destructive"}>{server.state}</Badge>
          {server.needsRescan && <Badge variant="destructive">Scan again</Badge>}
        </ItemTitle>
        <ItemDescription>
          <span className="text-foreground">{server.endpoint.url}</span> · {securityOf(server.endpoint)}
          {server.lastError && ` · ${server.lastError}`}
        </ItemDescription>
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
    setBusy(true)
    setOutcome(await commitProposal({ data: values.draftId }))
    setBusy(false)
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
        {values.summary && <Counts summary={values.summary} />}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
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

function Endpoints({ values }: { values: RankedEndpoints }) {
  return (
    <Card className="gap-0 py-0">
      <ItemGroup className="gap-0">
        {values.endpoints.map((endpoint, position) => (
          <Fragment key={`${endpoint.securityMode}/${endpoint.securityPolicy}`}>
            {position > 0 && <ItemSeparator className="my-0" />}
            <Item size="sm">
              <ItemContent>
                <ItemTitle>
                  {securityOf(endpoint)}
                  {endpoint.recommended && <Badge variant="secondary">Recommended</Badge>}
                  {endpoint.weak && <Badge variant="outline">Weak</Badge>}
                </ItemTitle>
              </ItemContent>
            </Item>
          </Fragment>
        ))}
      </ItemGroup>
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

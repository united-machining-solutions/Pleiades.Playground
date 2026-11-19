import { jsonOf } from "../../chat/tool-results.ts"
import { placedInWords } from "../../sites/placements.ts"
import type { AddedOutcome, SitesOutcome } from "../../sites/placing.ts"

// The answers of the OPC UA adapter (source/Pleiades.Playground.OpcUa.Adapter/Api/Views.cs), as a
// chat has them in the result of a tool call. Each is checked before it is drawn: what does not
// have the shape is not drawn, and the model's text stands alone.

export type SecurityMode = "None" | "Sign" | "SignAndEncrypt"

export type Endpoint = {
  url: string
  securityMode: SecurityMode
  securityPolicy: string
  certificateThumbprint?: string
  /** The user the session logs in with; absent for a session without a user. Never a password. */
  user?: string
}

export type MappingSummary = {
  ok: number
  derived: number
  unclear: number
  mismatch: number
  missing: number
  needsAttention: boolean
}

/**
 * Whether a machine delivers a profile of the data model whole (spec v0.17.1). The core is declared whole for
 * every machine: what it lacks is not available. Of another profile only a complete one is published.
 */
export type ProfileCheck = {
  name: string
  mandatory: boolean
  fulfilled: boolean
  /** At least one element of the profile is mapped. */
  offered: boolean
  /** The elements that are not mapped. */
  missing: Array<string>
  /** For a profile with instances (channels, spindles, measuring points): the complete ones. */
  instances: Array<string>
}

export type Server = {
  serialNumber: string
  displayName?: string
  endpoint: Endpoint
  /** As Connection/State on the broker. */
  state: "Initializing" | "Running" | "CommunicationFault" | "Shutdown"
  lastError?: string
  profiles: Array<string>
  /** Each profile, the core first. Absent from an adapter that does not check them. */
  conformance?: Array<ProfileCheck>
  mapping: MappingSummary
  needsRescan: boolean
  scannedAt?: string
  /** The object of the machine on a server of several machines, a gateway. */
  machineNode?: string
  /** The other machines on the same session: behind the same gateway. */
  sessionSharedWith?: Array<string>
}

export type MappingState = "Ok" | "Derived" | "Unclear" | "Mismatch" | "Missing"

export type MappingRow = {
  path: string
  area: string
  state: MappingState
  node?: string
  detail?: string
  value?: unknown
  unit?: string
}

export type ServerList = { servers: Array<Server> }

export type Mapping = { server: Server; rows: Array<MappingRow> }

export type Changes = {
  added: Array<string>
  removed: Array<string>
  changed: Array<string>
  profilesAdded: Array<string>
  profilesRemoved: Array<string>
  endpointChanged: boolean
  any: boolean
}

export type Proposal = {
  accepted: boolean
  draftId?: string
  expiresAt?: string
  serialNumber: string
  displayName?: string
  endpoint: Endpoint
  profiles: Array<string>
  /** Each profile, the core first. Absent from an adapter that does not check them. */
  conformance?: Array<ProfileCheck>
  problems: Array<string>
  summary?: MappingSummary
  rows: Array<MappingRow>
  replaces: boolean
  changes?: Changes
  /** The machine id it would publish under. Absent if not accepted, or from an older adapter. */
  machineId?: string
  /** What the person should know though nothing is wrong. Absent from an older adapter. */
  notices?: Array<string>
}

/** The security of an endpoint: its mode and the short name of its policy. */
export type Security = { securityMode: SecurityMode; securityPolicy: string }

export type RankedEndpoint = Security & {
  /** The one the adapter takes: the strongest, or the one a person chose. */
  recommended: boolean
  /** Without encryption, or with a policy that is no longer considered safe. */
  weak: boolean
  /** A session here logs in with the stored user: the endpoint takes no anonymous session. Absent from an older adapter. */
  withUser?: boolean
}

export type RankedEndpoints = {
  url: string
  certificateThumbprint?: string
  /** Strongest first. */
  endpoints: Array<RankedEndpoint>
  /** The server accepts no session without a user. */
  needsUser?: boolean
  /** The server accepts a user name and a password on an encrypted endpoint. */
  acceptsUser?: boolean
  /** The user a person stored for this server. */
  user?: string
  /** The security a person chose and the adapter keeps, also while the server does not offer it; absent without one. */
  chosen?: Security
  /** The adapter takes the chosen security now; false while the server does not offer it. */
  chosenInEffect?: boolean
}

/** A machine an OPC UA server serves, as `opcua_machine_list` gives it. */
export type ServedMachine = {
  node: string
  path: string
  displayName: string
  serialNumber?: string
  manufacturer?: string
  model?: string
  productInstanceUri?: string
  added: boolean
  addedAt?: string
}

export type MachineList = {
  url: string
  endpoint?: RankedEndpoint
  gateway: boolean
  machines: Array<ServedMachine>
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === "string"
const isStrings = (value: unknown): value is Array<string> => Array.isArray(value) && value.every(isString)
const states: ReadonlyArray<MappingState> = ["Ok", "Derived", "Unclear", "Mismatch", "Missing"]

function isEndpoint(value: unknown): value is Endpoint {
  return isObject(value) && isString(value.url) && isString(value.securityMode) && isString(value.securityPolicy)
}

function isSummary(value: unknown): value is MappingSummary {
  return (
    isObject(value) &&
    ["ok", "derived", "unclear", "mismatch", "missing"].every((key) => typeof value[key] === "number")
  )
}

function isServer(value: unknown): value is Server {
  return (
    isObject(value) &&
    isString(value.serialNumber) &&
    isEndpoint(value.endpoint) &&
    isString(value.state) &&
    isStrings(value.profiles) &&
    isSummary(value.mapping)
  )
}

function isRow(value: unknown): value is MappingRow {
  return isObject(value) && isString(value.path) && states.includes(value.state as MappingState)
}

/** The servers in the result of `opcua_server_list`. */
export function serverListOf(content: unknown): ServerList | null {
  const value = jsonOf(content)
  return isObject(value) && Array.isArray(value.servers) && value.servers.every(isServer)
    ? (value as ServerList)
    : null
}

/** The mapping in the result of `opcua_mapping_show`. */
export function mappingOf(content: unknown): Mapping | null {
  const value = jsonOf(content)
  return isObject(value) && isServer(value.server) && Array.isArray(value.rows) && value.rows.every(isRow)
    ? (value as Mapping)
    : null
}

/** The proposal in the result of `opcua_registration_propose`. */
export function proposalOf(content: unknown): Proposal | null {
  const value = jsonOf(content)
  return isObject(value) &&
    typeof value.accepted === "boolean" &&
    isString(value.serialNumber) &&
    isEndpoint(value.endpoint) &&
    isStrings(value.problems) &&
    Array.isArray(value.rows) &&
    value.rows.every(isRow)
    ? (value as Proposal)
    : null
}

/** The endpoints in the result of `opcua_endpoint_rank`. */
export function rankedEndpointsOf(content: unknown): RankedEndpoints | null {
  const value = jsonOf(content)
  return isObject(value) &&
    isString(value.url) &&
    Array.isArray(value.endpoints) &&
    value.endpoints.every((one) => isObject(one) && isString(one.securityMode) && isString(one.securityPolicy))
    ? (value as RankedEndpoints)
    : null
}

/** The machines in the result of `opcua_machine_list`. */
export function machineListOf(content: unknown): MachineList | null {
  const value = jsonOf(content)
  return isObject(value) &&
    isString(value.url) &&
    typeof value.gateway === "boolean" &&
    Array.isArray(value.machines) &&
    value.machines.every(
      (one) => isObject(one) && isString(one.node) && isString(one.path) && typeof one.added === "boolean",
    )
    ? (value as MachineList)
    : null
}

/** The core and the profiles worth showing: the core, and every profile that maps at least one element. */
export function shownProfiles(checks: ReadonlyArray<ProfileCheck> | undefined): {
  core?: ProfileCheck
  fulfilled: Array<ProfileCheck>
  incomplete: Array<ProfileCheck>
} {
  const all = Array.isArray(checks) ? checks : []
  const others = all.filter((check) => !check.mandatory)
  return {
    core: all.find((check) => check.mandatory),
    fulfilled: others.filter((check) => check.fulfilled),
    incomplete: others.filter((check) => !check.fulfilled && check.offered),
  }
}

/** What a chip of a card chooses: the rows of one state, or the elements a profile lacks. */
export type RowChoice = { state: MappingState } | { profile: string }

/** Whether two choices are the same chip. No choice is the same as no choice. */
export function sameChoice(one: RowChoice | null | undefined, other: RowChoice | null | undefined): boolean {
  if (!one || !other) return !one && !other
  if ("state" in one) return "state" in other && one.state === other.state
  return "profile" in other && one.profile === other.profile
}

/**
 * The rows a chosen chip shows. For a profile, the elements it lacks in the order it names them; one that has no
 * row of its own (the scan did not list it) is shown as missing, without a reason.
 */
export function chosenRows(
  rows: ReadonlyArray<MappingRow>,
  choice: RowChoice,
  checks: ReadonlyArray<ProfileCheck> | undefined,
): Array<MappingRow> {
  if ("state" in choice) return rows.filter((row) => row.state === choice.state)
  const check = checks?.find((one) => one.name === choice.profile)
  if (!check) return []
  return check.missing.map(
    (path) => rows.find((row) => row.area === "umati" && row.path === path) ?? { path, area: "umati", state: "Missing" },
  )
}

/**
 * The rows in doubt: a node that does not fit (mismatch) or a match that is a guess (unclear). The proposal shows
 * them before a chip is pressed, since adding the machine would take them as they are.
 */
export function inDoubt(rows: ReadonlyArray<MappingRow>): Array<MappingRow> {
  return rows.filter((row) => row.state === "Mismatch" || row.state === "Unclear")
}

/** The rows a person has to look at: everything that is not plainly fine. */
export function needingALook(rows: ReadonlyArray<MappingRow>): Array<MappingRow> {
  return rows.filter((row) => row.state !== "Ok")
}

/** A value as the review shows it: a number with its unit, a text as it is. */
export function shownValue(row: MappingRow): string {
  if (row.value === undefined || row.value === null) return "–"
  if (typeof row.value === "number") {
    // Ten significant digits and no exponent: a counter of seconds stays readable as it is.
    const number = String(Number(row.value.toPrecision(10)))
    return row.unit ? `${number} ${row.unit}` : number
  }
  return String(row.value)
}

/** The security of an endpoint in words: "Encrypted, Aes256_Sha256_RsaPss", with the user if there is one. */
export function securityOf(endpoint: Pick<Endpoint, "securityMode" | "securityPolicy" | "user">): string {
  const mode = { SignAndEncrypt: "Encrypted", Sign: "Signed only", None: "No security" }[endpoint.securityMode]
  const security = endpoint.securityMode === "None" ? mode : `${mode}, ${endpoint.securityPolicy}`
  return endpoint.user ? `${security}, user ${endpoint.user}` : security
}

/** The key of a security, `SignAndEncrypt/Aes256_Sha256_RsaPss`: what the choice on the endpoints card names. */
export function securityKey(security: Security): string {
  return `${security.securityMode}/${security.securityPolicy}`
}

/**
 * What the endpoints card shows: the endpoint the adapter takes, the strongest the server offers, whether a person
 * chose the one taken, a choice the adapter keeps but does not take now (the server does not offer it), the others
 * (folded), and whether one of them has no security at all.
 */
export function endpointSummary(values: Pick<RankedEndpoints, "endpoints" | "chosen" | "chosenInEffect">): {
  used?: RankedEndpoint
  strongest?: RankedEndpoint
  chosen: boolean
  dormant?: Security
  others: Array<RankedEndpoint>
  unsecured: boolean
} {
  const used = values.endpoints.find((one) => one.recommended) ?? values.endpoints[0]
  const others = values.endpoints.filter((one) => one !== used)
  const chosen =
    used !== undefined &&
    values.chosen !== undefined &&
    values.chosenInEffect !== false &&
    securityKey(values.chosen) === securityKey(used)
  const dormant = values.chosen !== undefined && !chosen ? values.chosen : undefined
  return { used, strongest: values.endpoints[0], chosen, dormant, others, unsecured: others.some((one) => one.securityMode === "None") }
}

/** What a person is told before and after choosing a security: how bad it is, and why. */
export type SecurityWarning = { severity: "danger" | "caution"; title: string; text: string }

/**
 * The warning a security deserves, or none for an encrypted endpoint with a policy that is still safe. None is
 * the strongest warning: nothing is signed or encrypted, and the adapter cannot tell its machine from another box
 * at the same address.
 */
export function securityWarning(security: Security & { weak?: boolean }): SecurityWarning | undefined {
  if (security.securityMode === "None") {
    return {
      severity: "danger",
      title: "No security",
      text:
        "Nothing between the adapter and the machine is signed or encrypted: anyone on that network can read the values, " +
        "change them on the way or pretend to be the machine. Choose it only on a network you trust, for example to try a " +
        "machine whose server does not trust the adapter yet, and go back to an encrypted endpoint once it does.",
    }
  }
  if (security.securityMode === "Sign") {
    return {
      severity: "caution",
      title: "Signed only",
      text: "The values cannot be changed on the way, but anyone on that network can read them.",
    }
  }
  if (security.weak) {
    return {
      severity: "caution",
      title: "An old policy",
      text: `${security.securityPolicy} is no longer considered safe. Choose a stronger endpoint if the server offers one.`,
    }
  }
  return undefined
}

/** What the endpoints card asks of the person about a user: nothing, to enter one, or that one may be entered. */
export function userStep(values: Pick<RankedEndpoints, "needsUser" | "acceptsUser" | "user">): "none" | "required" | "optional" {
  if (!values.acceptsUser) return "none"
  if (values.needsUser && !values.user) return "required"
  return "optional"
}

/** Where Home shows an added machine, as a person reads it after the click, and what to do where it shows none. */
function whereAdded(sites: SitesOutcome | undefined, placed: AddedOutcome | undefined): string {
  if (placed?.ok) return placed.already ? `It stood on ${placed.siteName} already, and stays there.` : "Its values appear on Home within seconds."
  if (placed) return `It is on no site: ${placed.reason} Put it on one with Add machine on Home.`
  if (sites?.ok) return "There is no site yet: put it on one with Add machine on Home."
  if (sites) return `It is on no site: ${sites.reason}`
  return "Put it on a site with Add machine on Home."
}

/**
 * The toast after a proposal was added: "A1121O0001 added · North plant", as Home says it of a machine it put on
 * a site, or the machine alone and why it is on no site. A registration that replaces one says so.
 */
export function addedInWords(
  proposal: Pick<Proposal, "serialNumber" | "replaces">,
  sites: SitesOutcome | undefined,
  placed: AddedOutcome | undefined,
): { title: string; description: string | undefined } {
  if (proposal.replaces) return { title: `Registration of ${proposal.serialNumber} replaced`, description: undefined }
  const title = placed?.ok ? placedInWords(proposal.serialNumber, placed.siteName, null, false) : `${proposal.serialNumber} added`
  return { title, description: whereAdded(sites, placed) }
}

/** What the card says once the proposal was added: where the machine went, or why it is on no site. */
export function doneInWords(
  proposal: Pick<Proposal, "serialNumber" | "replaces">,
  sites: SitesOutcome | undefined,
  placed: AddedOutcome | undefined,
): string {
  if (proposal.replaces) return `The registration of ${proposal.serialNumber} is replaced.`
  if (placed?.ok && !placed.already) return `${proposal.serialNumber} is added on ${placed.siteName}. Its values appear on Home within seconds.`
  return `${proposal.serialNumber} is added. ${whereAdded(sites, placed)}`
}

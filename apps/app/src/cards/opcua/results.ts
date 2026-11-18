import { jsonOf } from "../../chat/tool-results.ts"

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
}

export type RankedEndpoints = {
  url: string
  certificateThumbprint?: string
  endpoints: Array<{ securityMode: SecurityMode; securityPolicy: string; recommended: boolean; weak: boolean }>
  /** The server accepts no session without a user. */
  needsUser?: boolean
  /** The server accepts a user name and a password on an encrypted endpoint. */
  acceptsUser?: boolean
  /** The user a person stored for this server. */
  user?: string
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
  endpoint?: { securityMode: SecurityMode; securityPolicy: string; recommended: boolean; weak: boolean }
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

/** What the endpoints card asks of the person about a user: nothing, to enter one, or that one may be entered. */
export function userStep(values: Pick<RankedEndpoints, "needsUser" | "acceptsUser" | "user">): "none" | "required" | "optional" {
  if (!values.acceptsUser) return "none"
  if (values.needsUser && !values.user) return "required"
  return "optional"
}

import type { SiteList } from "@pleiades/cards/site/contract.ts"

// The machine id of a machine people name by what it is, by the rule of the binding (ADR-0015,
// MachineBinding.MachineId in .NET): `<manufacturer>_<model>_<serial number>`, each part written so that
// nothing a broker reads otherwise stands in it. A manufacturer whose machines send already keeps the
// spelling of their topics. The one place of the rule in the app: the form of Home, the card of the chat
// and its tool on the server use it. No React here.

/** What a machine is, as the data model names it (identity.manufacturer, model, serialNumber). */
export type Identity = { manufacturer: string; model: string; serialNumber: string }

/** A manufacturer whose machines send: the name it gives itself, and the first part of the ids of its machines. */
export type Maker = { name: string; part: string }

/** The longest part of a machine id, as the binding cuts it (MachineBinding.MachineIdPartLength). */
const ID_PART_LENGTH = 64

/**
 * One part of a machine id, as MachineBinding.MachineIdPart writes it: ä, ö, ü and ß written out, other
 * accents dropped, every character but A-Z, a-z, 0-9 and - a -, several - one, none at either end, at most 64
 * characters. "TruPunch 5000" is TruPunch-5000. Where the binding writes "unknown" for nothing, this gives
 * nothing: a person has not said it yet.
 */
export function machineIdPart(text: string): string {
  const written = text
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
  return written
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, ID_PART_LENGTH)
    .replace(/-$/, "")
}

/** The first part of a machine id of the binding, or nothing for an id of another shape. */
function makerPartOfId(machine: string): string {
  const parts = machine.split("_")
  return parts.length === 3 ? parts[0]! : ""
}

/** The manufacturers of the machines that send and of those on a site, each once, in the order of the list. */
export function makersOf(list: Pick<SiteList, "unplaced" | "sites">): Array<Maker> {
  const machines = [
    ...list.unplaced.map((one) => ({ machine: one.machine, name: one.now.identity.manufacturer })),
    ...list.sites.flatMap((site) =>
      site.halls.flatMap((hall) => hall.machines.map((one) => ({ machine: one.machine, name: one.now?.identity.manufacturer ?? null }))),
    ),
  ]
  const makers = new Map<string, Maker>()
  for (const { machine, name } of machines) {
    const part = makerPartOfId(machine)
    if (part === "") continue
    const known = makers.get(part)
    // The name a manufacturer gives itself wins over the part of its ids, where a machine reports it.
    if (!known || (known.name === part && name)) makers.set(part, { name: name || part, part })
  }
  return [...makers.values()]
}

/**
 * The first part of a machine id from the manufacturer a person typed: the part of a manufacturer that sends,
 * found by its name or its part without regard to case; else from a web address as the binding forms it, its
 * domain without www. and top-level domain, every dot a -; else the name as a part, in lower case as a domain is.
 * "TRUMPF", "Trumpf" and "trumpf" are all trumpf.
 */
export function makerPartOf(typed: string, makers: ReadonlyArray<Maker> = []): string {
  const text = typed.trim()
  const lower = text.toLowerCase()
  const known = makers.find((one) => one.name.toLowerCase() === lower || one.part.toLowerCase() === lower)
  if (known) return known.part
  if (/^([a-z]+:\/\/)?[^\s/]+\.[a-z]{2,}(\/.*)?$/i.test(text)) {
    const host = lower.replace(/^[a-z]+:\/\//, "").split("/")[0]!.replace(/^www\./, "")
    return machineIdPart(host.slice(0, host.lastIndexOf(".")).replace(/\./g, "-"))
  }
  return machineIdPart(text).toLowerCase()
}

/** The machine id of what a person said a machine is, by ADR-0015; undefined while a part is missing. */
export function machineIdOf(identity: Identity, makers: ReadonlyArray<Maker> = []): string | undefined {
  const parts = [makerPartOf(identity.manufacturer, makers), machineIdPart(identity.model.trim()), machineIdPart(identity.serialNumber.trim())]
  return parts.every((one) => one !== "") ? parts.join("_") : undefined
}

/** What a machine id says of a machine, for its fields: the manufacturer by the name it gives itself where it sends. */
export function identityOfId(machine: string, makers: ReadonlyArray<Maker> = []): Identity | undefined {
  const parts = machine.trim().split("_")
  if (parts.length !== 3 || parts.some((one) => one === "")) return undefined
  const [part, model, serialNumber] = parts as [string, string, string]
  return { manufacturer: makers.find((one) => one.part === part)?.name ?? part, model, serialNumber }
}

/** What a machine is, in words: "TRUMPF · TruPunch 5000 · A1234", the parts a person said. */
export function identityInWords(identity: Identity): string {
  return [identity.manufacturer, identity.model, identity.serialNumber]
    .map((one) => one.trim())
    .filter(Boolean)
    .join(" · ")
}

/** What keeps the fields of a machine from giving an id, field by field; nothing where they give one. */
export type IdentityProblems = { manufacturer?: string; model?: string; serialNumber?: string }

/** Why the fields of a machine give no id yet, field by field. */
export function problemsOfIdentity(identity: Identity, makers: ReadonlyArray<Maker> = []): IdentityProblems {
  return {
    ...(makerPartOf(identity.manufacturer, makers) === "" && { manufacturer: "Say who made it." }),
    ...(machineIdPart(identity.model.trim()) === "" && { model: "Say its model." }),
    ...(machineIdPart(identity.serialNumber.trim()) === "" && { serialNumber: "Say its serial number." }),
  }
}

/**
 * The fields of a machine from what a person typed to find it, where that says something: a machine id
 * split into its parts; or words, of which a manufacturer that sends may come first, the last word the serial
 * number and the words before it the model. "TRUMPF TruPunch 5000 A1234" is TRUMPF, TruPunch 5000, A1234;
 * "MFP 7" is model MFP, serial number 7.
 */
export function identityFromTyped(typed: string, makers: ReadonlyArray<Maker> = []): Identity {
  const text = typed.trim()
  const fromId = text.includes("_") ? identityOfId(text, makers) : undefined
  if (fromId) return fromId
  let words = text.split(/\s+/).filter(Boolean)
  let manufacturer = ""
  // The longest name of a manufacturer that sends, at the start of the words.
  for (const maker of [...makers].sort((a, b) => b.name.length - a.name.length)) {
    for (const name of [maker.name, maker.part]) {
      const named = name.split(/\s+/)
      if (named.length <= words.length && named.every((word, at) => word.toLowerCase() === words[at]!.toLowerCase())) {
        manufacturer = maker.name
        words = words.slice(named.length)
        break
      }
    }
    if (manufacturer) break
  }
  if (words.length === 0) return { manufacturer, model: "", serialNumber: "" }
  if (words.length === 1) return { manufacturer, model: words[0]!, serialNumber: "" }
  return { manufacturer, model: words.slice(0, -1).join(" "), serialNumber: words.at(-1)! }
}

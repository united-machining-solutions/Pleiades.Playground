// The people who were enrolled, with the descriptors of their faces, in the IndexedDB of this browser.
//
// Face data is biometric. It stays here, in this browser on this computer: nothing in this module
// sends it anywhere, not to the server of the app and not to the hub, and it is never committed.
// Deleting a person deletes their descriptors; the photos they came from are never kept.

import type { Descriptor, Person } from "./match.ts"

const DATABASE = "pleiades-titan-faces"
const PEOPLE = "people"

/** A person has at most this many descriptors; enrolling again replaces the oldest ones. */
export const MAX_DESCRIPTORS = 30

export type EnrolledPerson = Person & { enrolledAt: string }

/** Tells whoever listens that the list of people changed, in this tab and in the others. */
const changes = new EventTarget()
// Only in the browser: on the server, where the page is rendered too, a channel would keep Node.js awake.
const channel = typeof window === "undefined" ? undefined : new BroadcastChannel(DATABASE)
channel?.addEventListener("message", () => changes.dispatchEvent(new Event("change")))

function changed() {
  changes.dispatchEvent(new Event("change"))
  channel?.postMessage("change")
}

/** Calls `listener` whenever a person is added or deleted. Returns the way to stop listening. */
export function onPeopleChange(listener: () => void): () => void {
  changes.addEventListener("change", listener)
  return () => changes.removeEventListener("change", listener)
}

let database: Promise<IDBDatabase> | undefined

function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(PEOPLE, { keyPath: "name" })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      database = undefined
      reject(request.error ?? new Error("IndexedDB could not be opened"))
    }
  })
  return database
}

async function transact<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | undefined,
): Promise<T | undefined> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PEOPLE, mode)
    const request = work(transaction.objectStore(PEOPLE))
    transaction.oncomplete = () => resolve(request?.result)
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB failed"))
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB aborted"))
  })
}

/** Everyone enrolled, by name. */
export async function listPeople(): Promise<Array<EnrolledPerson>> {
  const all = (await transact("readonly", (store) => store.getAll() as IDBRequest<Array<EnrolledPerson>>)) ?? []
  return all.sort((a, b) => a.name.localeCompare(b.name, "de"))
}

/**
 * Enrols a person from the descriptors of several pictures. A name that is there already gets the new
 * descriptors as well, so a second round in other light makes the person easier to recognise.
 */
export async function addPerson(name: string, descriptors: ReadonlyArray<Descriptor>): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("A person needs a name")
  if (descriptors.length === 0) throw new Error("A person needs at least one descriptor")
  const before = await transact("readonly", (store) => store.get(trimmed) as IDBRequest<EnrolledPerson | undefined>)
  const person: EnrolledPerson = {
    name: trimmed,
    descriptors: [...(before?.descriptors ?? []), ...descriptors.map((one) => [...one])].slice(-MAX_DESCRIPTORS),
    enrolledAt: new Date().toISOString(),
  }
  await transact("readwrite", (store) => store.put(person))
  changed()
}

/** Deletes one person and their descriptors. */
export async function deletePerson(name: string): Promise<void> {
  await transact("readwrite", (store) => store.delete(name))
  changed()
}

/** Deletes everyone. */
export async function deleteAllPeople(): Promise<void> {
  await transact("readwrite", (store) => store.clear())
  changed()
}

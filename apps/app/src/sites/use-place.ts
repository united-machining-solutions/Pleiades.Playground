import { toast } from "@pleiades/ui/components/toast"
import { useRouter } from "@tanstack/react-router"
import { useEffect, useRef } from "react"

import { addedInWords, madeInWords } from "./choosing.ts"
import { followingRequest } from "./placing.ts"
import type { MakeHallRequest, MakeOutcome, MakeSiteRequest, PlaceOutcome, PlaceRequest, UndoRequest } from "./placing.ts"
import { makeHall, makeSite, placeMachine, undoChange, undoMade } from "./sites-api.ts"
import { namesInWords } from "./unplaced.ts"

// Placing machines from the app, and making a site or hall alone: the requests to the server of the app,
// the list read again afterwards, and the toast that says what happened, with its undo. The form of
// "Add a new machine" sends through here, wherever it stands; the menu of a row takes off through the same toast.

/** A machine to place, with what it is, for the words of the toast. */
export type ToPlace = { request: PlaceRequest; what: string }

/** The time the docs of the Toast of Base UI give a toast with an undo, as the parts of a kept page have it. */
const UNDO_MS = 10_000

/** Reads the list of the page again, as after every change. */
export function useReread() {
  const router = useRouter()
  return () => router.invalidate()
}

/** The toast of a change that did not go through, and why. */
export function failed(title: string, reason: string) {
  toast.add({ type: "error", title, description: reason, priority: "high" })
}

/**
 * The toast after a change, with its undo. `name` is what the machine is called in it, or the machines of
 * one add. The undo puts each machine back where the Sites API had it before the change, the last placed
 * first, and only while nothing changed it since; what the change made goes again while nothing stands on it.
 */
export function told(name: string, title: string, description: string | undefined, undone: ReadonlyArray<UndoRequest>, reread: () => Promise<void>) {
  const shown = toast.add({
    title,
    description,
    timeout: UNDO_MS,
    actionProps: {
      children: "Undo",
      onClick() {
        toast.close(shown)
        void (async () => {
          let reason: string | undefined
          for (const one of [...undone].reverse()) {
            // A server of the app that does not answer is a reason too, not an error of the page.
            reason = await undoChange({ data: one })
              .then((outcome) => (outcome.ok ? undefined : outcome.reason))
              .catch((error: unknown) => (error instanceof Error ? error.message : String(error)))
            if (reason) break
          }
          await reread()
          if (reason) failed(`${name} ${undone.length === 1 ? "was" : "were"} not put back`, reason)
        })()
      },
    },
  })
}

/** Why a request did not go through: what the Sites API said, or why the server of the app did not answer. */
function refusedOf(error: unknown): Extract<PlaceOutcome, { ok: false }> {
  return { ok: false, reason: error instanceof Error ? error.message : String(error), stale: false }
}

/**
 * Sends the placements one after the other, the further machines of one add to the site the first went to,
 * reads the list again, and says where the machines went. Where one is refused, those before it stay
 * placed, and the form says which went and why the next did not. A refusal that came from a change
 * meanwhile leaves the list as it is while the form says why: read again at once, the row of the
 * machine, and the form with it, could go. It is read again when the form goes away.
 */
export function usePlace() {
  const router = useRouter()
  const reread = () => router.invalidate()
  const stale = useRef(false)
  const onPlace = async (machines: ReadonlyArray<ToPlace>): Promise<PlaceOutcome> => {
    const placed: Array<{ name: string; request: PlaceRequest; outcome: Extract<PlaceOutcome, { ok: true }> }> = []
    let refused: Extract<PlaceOutcome, { ok: false }> | undefined
    let refusedName = ""
    for (const { request, what } of machines) {
      const first = placed[0]
      const sent = first ? followingRequest(request, first.outcome.siteId) : request
      const name = sent.displayName?.trim() || what
      const outcome = await placeMachine({ data: sent }).catch(refusedOf)
      if (!outcome.ok) {
        refused = outcome
        refusedName = name
        break
      }
      placed.push({ name, request: sent, outcome })
    }
    const [first] = placed
    if (first) {
      await reread()
      const undone = placed.map(({ request, outcome }) => ({
        machine: request.machine,
        now: { siteId: outcome.siteId, hall: outcome.hall },
        back: outcome.before,
        made: outcome.made,
      }))
      const added = placed.filter((one) => one.request.from === null).map((one) => one.name)
      const moved = placed.filter((one) => one.request.from !== null).map((one) => one.name)
      const { title, description } = addedInWords(added, moved, first.outcome.siteName, first.outcome.hall)
      told(placed.length === 1 ? first.name : `${placed.length} machines`, title, description, undone, reread)
    }
    if (!refused) return first ? first.outcome : { ok: false, reason: "Choose at least one machine.", stale: false }
    if (refused.stale) stale.current = true
    const went = first ? `${namesInWords(placed.map((one) => one.name))} ${placed.length === 1 ? "was" : "were"} placed; ${refusedName} was not. ` : ""
    return { ...refused, reason: `${went}${refused.reason}${refused.stale ? " Cancel shows Home as it is now." : ""}` }
  }
  // Read again when the form goes away, where a refusal left the list out of date.
  useEffect(
    () => () => {
      if (stale.current) void router.invalidate()
    },
    [router],
  )
  return onPlace
}

/** What the form asks to be made alone: a new site with a first hall or none, or a hall of a site that is there. */
export type ToMake = { site: MakeSiteRequest } | { hall: MakeHallRequest }

/**
 * Makes a site or a hall alone, without a machine, reads the list again and says what was made, with an
 * undo that takes it away again while nothing stands on it. A refusal comes back for the form to show;
 * where it came from a change meanwhile, the list is read again when the form goes away.
 */
export function useMake() {
  const router = useRouter()
  const reread = () => router.invalidate()
  const stale = useRef(false)
  const onMake = async (asked: ToMake): Promise<MakeOutcome> => {
    const outcome = await ("site" in asked ? makeSite({ data: asked.site }) : makeHall({ data: asked.hall })).catch(
      (error: unknown): MakeOutcome => ({ ok: false, reason: error instanceof Error ? error.message : String(error), stale: false }),
    )
    if (!outcome.ok) {
      if (outcome.stale) stale.current = true
      return outcome
    }
    await reread()
    const title = madeInWords(outcome.siteName, outcome.hall, "site" in asked)
    const shown = toast.add({
      title,
      timeout: UNDO_MS,
      actionProps: {
        children: "Undo",
        onClick() {
          toast.close(shown)
          void undoMade({ data: outcome.made })
            .then((undone) => (undone.ok ? undefined : undone.reason))
            .catch((error: unknown) => (error instanceof Error ? error.message : String(error)))
            .then(async (reason) => {
              await reread()
              if (reason) failed(`${"site" in asked ? outcome.siteName : outcome.hall} was not taken away`, reason)
            })
        },
      },
    })
    return outcome
  }
  useEffect(
    () => () => {
      if (stale.current) void router.invalidate()
    },
    [router],
  )
  return onMake
}

import { Link, useNavigate } from "@tanstack/react-router"
import { CircleCheckIcon, FileIcon } from "lucide-react"
import { useState } from "react"

import { MAX_PARTS } from "@/pages/recipe.ts"
import type { Recipe } from "@/pages/recipe.ts"
import { savePage, usePages } from "@/pages/store.ts"
import { Button, buttonVariants } from "@pleiades/ui/components/button"
import { MessageFooter } from "@pleiades/ui/components/message"

/**
 * The page each answer was saved as, by the chat and the message of the answer. It holds as long as
 * the app runs in this tab, so a chat that is closed and opened again still says that its answer is
 * saved, and where. A reload forgets it: the page is in the browser, the answer's link to it is not.
 */
const saved = new Map<string, string>()

/**
 * The action under an answer of the chat that has ended: "Save as page". The docs of Message give
 * the footer of a message to its actions and its status. The app keeps the recipe of the answer, all
 * its cards in their order, titled with the question, and opens the page beside the chat, which stays
 * open (`search` keeps the chat). Then the row says so and leads to the page. A page deleted since
 * then is no longer said to be there. The page is not pinned: pinning is on the page.
 *
 * `left` is how many cards of the answer did not fit on a page; the row says so, before and after.
 */
export function SaveAsPage({ answer, recipe, left }: { answer: string; recipe: Recipe; left: number }) {
  const navigate = useNavigate()
  const pages = usePages()
  const [id, setId] = useState(() => saved.get(answer))
  const [refused, setRefused] = useState(false)
  const save = () => {
    const page = savePage(recipe)
    if (page === null) {
      setRefused(true)
      return
    }
    setRefused(false)
    saved.set(answer, page)
    setId(page)
    void navigate({ to: "/pages/$page", params: { page }, search: true })
  }
  const note =
    left > 0 ? (
      <span>
        {id !== undefined ? "The first" : "Keeps the first"} {recipe.parts.length} of {MAX_PARTS + left} cards.
      </span>
    ) : null
  return (
    // The row stays in place while its content changes, so a screen reader says what the press did.
    <MessageFooter role="status" className="min-h-8 flex-wrap gap-x-2 gap-y-1 px-0">
      {id !== undefined && pages.some((page) => page.id === id) ? (
        <>
          <CircleCheckIcon aria-hidden className="size-4" />
          <span>Saved as page</span>
          {/* A link that looks like a link-button, as in the rest of the app. `render` on a Button would
              give the anchor the role "button", and this leads somewhere. The chat stays open. */}
          <Link
            to="/pages/$page"
            params={{ page: id }}
            search
            className={buttonVariants({ variant: "link", size: "xs" })}
          >
            Open
          </Link>
          {note}
        </>
      ) : (
        <>
          <Button variant="outline" size="sm" onClick={save}>
            <FileIcon data-icon="inline-start" />
            Save as page
          </Button>
          {refused ? (
            <span className="text-destructive">This browser did not keep the page: it blocks its storage, or the storage is full.</span>
          ) : (
            note
          )}
        </>
      )}
    </MessageFooter>
  )
}

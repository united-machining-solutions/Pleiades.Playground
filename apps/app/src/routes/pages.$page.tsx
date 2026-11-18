import { clock } from "@pleiades/cards/machine/format.ts"
import { Button, buttonVariants } from "@pleiades/ui/components/button"
import { Toggle } from "@pleiades/ui/components/toggle"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { toast } from "@pleiades/ui/components/toast"
import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { CheckIcon, EllipsisIcon, PencilIcon, PinIcon, SearchXIcon, SquarePenIcon, Trash2Icon } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

import { useRetry } from "@/hooks/use-live.ts"
import { AddCard } from "@/pages/add-card.tsx"
import { cannotAdd } from "@/pages/add-part.ts"
import { Column, PartsLoading } from "@/pages/column.tsx"
import { DrawnPart, askParts, useAnswers, waitsForBackend } from "@/pages/drawn-part.tsx"
import { OnlyPart, PartControls, controlId } from "@/pages/part-controls.tsx"
import { MAX_TITLE_LENGTH } from "@/pages/recipe.ts"
import type { RecipePart, StoredPage } from "@/pages/recipe.ts"
import { SharePage } from "@/pages/share-page.tsx"
import { shownParts } from "@/pages/shown-parts.ts"
import {
  addPart,
  deletePage,
  getPage,
  movePart,
  pinPage,
  putPartBack,
  removePart,
  renamePage,
  unpinPage,
  usePage,
} from "@/pages/store.ts"
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
} from "@pleiades/ui/components/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pleiades/ui/components/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { Field, FieldLabel } from "@pleiades/ui/components/field"
import { Input } from "@pleiades/ui/components/input"

/**
 * A page kept from the chat. One route draws every page: it reads the recipe from this browser,
 * calls the tool of each part again and draws each result with the card the chat draws for that
 * tool, in one column, in the order of the recipe. No language model, no chat, no key: the values
 * are those of when the page was opened, read once (ADR-0014). A part without an answer stays where
 * it is and says what is missing; the rest of the page is whole. Only while a part waits for the
 * backend is the page read again (`useRetry`).
 */
export const Route = createFileRoute("/pages/$page")({
  // No entry of its own in the sidebar: a pinned page has one, read from this browser
  // (app-sidebar.tsx), and one that is not pinned is a row of the group "Pages" (page-group.tsx).
  // In the breadcrumb the page stands behind "Pages" and is called by its title.
  staticData: { crumb: (params) => getPage(params.page ?? "")?.recipe.title ?? "" },
  // The recipe is in the browser, and so is this loader (the app renders in the browser).
  loader: async ({ params }) => {
    const page = getPage(params.page)
    if (!page) throw notFound()
    return { parts: askParts(page.recipe.parts), readAt: new Date().toISOString() }
  },
  component: KeptPage,
  pendingComponent: Loading,
  notFoundComponent: NoPage,
})

function KeptPage() {
  const { page: id } = Route.useParams()
  const page = usePage(id)
  // Deleted in another tab while it was open.
  if (!page) return <NoPage />
  // One for each page: editing a page does not go on in the next one opened.
  return <ShownPage key={page.id} page={page} />
}

/**
 * A kept page: its head, and its parts as the recipe has them now. Each part keeps the answer the
 * loader gave it (`shownParts`), so a part that is removed or moved asks no other part again. A part
 * the loader did not answer, one added or put back after the page was read, is asked alone, and the
 * others keep what they have.
 *
 * "Edit" in the head shows the controls above each part: move it up or down, remove it; and at the
 * end of the page "Add a card". A change is kept at once, as a new title is. A removed part is
 * nowhere else, so a toast offers to put it back. An added part needs no undo: it stands where the
 * person pressed, with "Remove" above it, and nothing was lost.
 */
function ShownPage({ page }: { page: StoredPage }) {
  const { parts, readAt } = Route.useLoaderData()
  // The answers come part by part: those of the loader, and of each part asked alone after it. An
  // answer stands until the newer one of its part comes, also while the page is read again.
  const { answers, ask } = useAnswers(parts)
  const shown = shownParts(page.recipe.parts, answers)
  useRetry(shown.some(({ answered }) => answered !== undefined && waitsForBackend(answered)))
  // A part the loader did not ask, one added or put back after the page was read, is asked alone.
  const askedByLoader = new Set(shownParts(page.recipe.parts, parts).flatMap(({ key, answered }) => (answered ? [key] : [])))
  const asking = useRef(new Set<string>())
  useEffect(() => {
    for (const { key, part, answered } of shown) {
      if (answered !== undefined || askedByLoader.has(key) || asking.current.has(key)) continue
      asking.current.add(key)
      ask(part)
    }
  })

  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const prefix = useId()
  // After a change the focus goes to a control of the part it was about, once the page shows the change.
  const focusNext = useRef<string | null>(null)
  useEffect(() => {
    if (focusNext.current === null) return
    document.getElementById(focusNext.current)?.focus()
    focusNext.current = null
  })

  function move(from: number, to: number) {
    // The focus stays with the part, on the same arrow; at the top or the bottom that one is off, so on the other.
    const control = to === 0 ? "down" : to === shown.length - 1 ? "up" : to < from ? "up" : "down"
    focusNext.current = controlId(prefix, to, control)
    if (!movePart(page.id, from, to)) {
      focusNext.current = null
      notKept()
    }
  }

  function remove(at: number) {
    const part = page.recipe.parts[at]
    const left = shown.length - 1
    // The focus goes to "Remove" of the part that takes its place, or of the one before it; with one
    // part left, to "Delete page" in the notice that says why it stays.
    focusNext.current =
      left === 1 ? controlId(prefix, 0, "delete") : controlId(prefix, Math.min(at, left - 1), "remove")
    if (!removePart(page.id, at)) {
      focusNext.current = null
      notKept()
      return
    }
    const removed = toast.add({
      title: `Part ${at + 1} removed`,
      description: `From "${page.recipe.title}".`,
      // The time the docs of the Toast of Base UI give a toast with an undo.
      timeout: 10_000,
      actionProps: {
        children: "Undo",
        onClick() {
          toast.close(removed)
          if (putPartBack(page.id, at, part)) return
          // "Add a card" may have filled the page, or put the same card on it, while this toast
          // stood: then the page says that, as "Add a card" does; else the storage said no.
          notKept(cannotAdd(getPage(page.id)?.recipe.parts ?? [], part) ?? NOT_KEPT)
        },
      },
    })
  }

  /** Puts a card a person chose at the end of the page. Null if it is there, or why not. */
  function add(part: RecipePart): string | null {
    if (addPart(page.id, part)) return null
    // Another tab may have changed the page since the dialog checked it; else the storage said no.
    return cannotAdd(getPage(page.id)?.recipe.parts ?? [], part) ?? NOT_KEPT
  }

  return (
    <Column
      head={
        <Head
          page={page}
          line={`as of ${clock(readAt)}`}
          editing={editing}
          onEditingChange={setEditing}
          deleting={deleting}
          onDeletingChange={setDeleting}
        />
      }
    >
      {shown.map(({ key, answered }, at) => (
        // The key stays with the part when it moves, so its card is not drawn anew.
        <div key={key} className="flex flex-col gap-2">
          {editing &&
            (shown.length === 1 ? (
              <OnlyPart prefix={prefix} onDeletePage={() => setDeleting(true)} />
            ) : (
              <PartControls prefix={prefix} at={at} count={shown.length} onMove={move} onRemove={remove} />
            ))}
          {answered ? <DrawnPart part={answered} /> : <Skeleton className="h-40 w-full" />}
        </div>
      ))}
      {editing && (
        <AddCard
          parts={page.recipe.parts}
          onAdd={add}
          // The new part is the last, and on a page of two parts or more every part has "Remove" above it.
          added={() => document.getElementById(controlId(prefix, (getPage(page.id)?.recipe.parts.length ?? 0) - 1, "remove"))}
        />
      )}
    </Column>
  )
}

/** Why a change of the parts was not kept, when the storage did not take it. */
const NOT_KEPT = "This browser did not keep the change: it blocks its storage, or the storage is full."

/**
 * A change of the parts that did not happen: the page is as it was, and says why. Without a reason
 * of its own, the storage did not take the change.
 */
function notKept(why: string = NOT_KEPT) {
  toast.add({
    type: "error",
    title: "The page was not changed",
    description: why,
    priority: "high",
  })
}

/**
 * The head of a page, laid out like the heads of the other pages: the title, which can be renamed
 * in place, and the line under it; beside them "Edit", the pin, "Share" and a menu with what else
 * there is to do.
 */
function Head({
  page,
  line,
  editing,
  onEditingChange,
  deleting,
  onDeletingChange: setDeleting,
}: {
  page: StoredPage
  line: string
  editing: boolean
  onEditingChange: (editing: boolean) => void
  deleting: boolean
  onDeletingChange: (deleting: boolean) => void
}) {
  const navigate = useNavigate()
  return (
    // Where the title and the buttons do not fit side by side, the buttons go under the title.
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-72">
        <Title page={page} />
        <p className="text-sm text-muted-foreground">{line}</p>
      </div>
      <div className="flex items-center gap-2">
        {/* The controls of the parts come with "Edit" and go with "Done": a page is read far more often than changed. */}
        <Button variant={editing ? "default" : "outline"} onClick={() => onEditingChange(!editing)}>
          {editing ? <CheckIcon data-icon="inline-start" /> : <SquarePenIcon data-icon="inline-start" />}
          {editing ? "Done" : "Edit"}
        </Button>
        {/* A pinned page stands in the sidebar, on the top level like Home. */}
        <Toggle
          variant="outline"
          pressed={page.pinned}
          onPressedChange={(pressed) => (pressed ? pinPage(page.id) : unpinPage(page.id))}
        >
          <PinIcon />
          {page.pinned ? "Pinned" : "Pin"}
        </Toggle>
        {/* A link that carries the recipe of this page: the stack keeps no page and nobody signs in. */}
        <SharePage recipe={page.recipe} />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More for this page" />}>
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
                <Trash2Icon />
                Delete page
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Nothing else keeps the page, so deleting it is asked once more. */}
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete this page?</AlertDialogTitle>
            <AlertDialogDescription>
              "{page.recipe.title}" is kept in this browser only. A deleted page cannot be brought back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                setDeleting(false)
                // To the list first, so that this page is gone before its recipe is. The chat stays open.
                await navigate({ to: "/pages", search: (before) => before })
                deletePage(page.id)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * The title of a page, renamed in place: the pencil turns it into a field. Enter or leaving the
 * field keeps the new title, Escape the old one; an empty title keeps the old one too.
 */
function Title({ page }: { page: StoredPage }) {
  const [editing, setEditing] = useState(false)
  const field = useId()
  const pencil = useRef<HTMLButtonElement>(null)
  // One edit ends once: the field goes away when it ends, and that can make it lose the focus again.
  const ended = useRef(false)
  const focusBack = useRef(false)
  useEffect(() => {
    if (editing || !focusBack.current) return
    focusBack.current = false
    pencil.current?.focus()
  }, [editing])

  function end(title: string | undefined, { refocus }: { refocus: boolean }) {
    if (ended.current) return
    ended.current = true
    if (title !== undefined) renamePage(page.id, title)
    focusBack.current = refocus
    setEditing(false)
  }

  if (editing) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          end(String(new FormData(event.currentTarget).get("title") ?? ""), { refocus: true })
        }}
      >
        <Field>
          <FieldLabel htmlFor={field} className="sr-only">
            Title of the page
          </FieldLabel>
          <Input
            id={field}
            name="title"
            defaultValue={page.recipe.title}
            maxLength={MAX_TITLE_LENGTH}
            autoComplete="off"
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onBlur={(event) => end(event.currentTarget.value, { refocus: false })}
            onKeyDown={(event) => {
              if (event.key === "Escape") end(undefined, { refocus: true })
            }}
          />
        </Field>
      </form>
    )
  }
  return (
    <div className="flex items-start gap-1">
      <h1 className="min-w-0 text-2xl font-semibold wrap-break-word">{page.recipe.title}</h1>
      <Button
        ref={pencil}
        variant="ghost"
        size="icon-sm"
        aria-label="Rename this page"
        onClick={() => {
          ended.current = false
          setEditing(true)
        }}
      >
        <PencilIcon />
      </Button>
    </div>
  )
}

/**
 * A page this browser does not keep: deleted, or opened in another browser than the one it was
 * saved in. The page says so once and does not ask again. It has no title: a title would name a
 * page that is not there.
 */
function NoPage() {
  return (
    <Column>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>No page here</EmptyTitle>
          <EmptyDescription>
            This browser keeps no page at this address. A page is kept in the browser it was saved in.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/* A link that looks like a button, as on the page of a machine. The chat stays open. */}
          <Link to="/pages" search className={buttonVariants()}>
            All pages
          </Link>
        </EmptyContent>
      </Empty>
    </Column>
  )
}

/** While the parts are asked: the title, and a placeholder for each part. */
function Loading() {
  const { page: id } = Route.useParams()
  const page = getPage(id)
  return <PartsLoading title={page?.recipe.title} parts={page?.recipe.parts.length ?? 1} />
}

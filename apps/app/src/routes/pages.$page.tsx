import { clock } from "@pleiades/cards/machine/format.ts"
import { Button, buttonVariants } from "@pleiades/ui/components/button"
import { Toggle } from "@pleiades/ui/components/toggle"
import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { EllipsisIcon, PencilIcon, PinIcon, SearchXIcon, Trash2Icon } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

import { useRetry } from "@/hooks/use-live.ts"
import { Column, PartsLoading } from "@/pages/column.tsx"
import { DrawnPart, answerParts, waitsForBackend } from "@/pages/drawn-part.tsx"
import { MAX_TITLE_LENGTH } from "@/pages/recipe.ts"
import type { StoredPage } from "@/pages/recipe.ts"
import { SharePage } from "@/pages/share-page.tsx"
import { deletePage, getPage, pinPage, renamePage, unpinPage, usePage } from "@/pages/store.ts"
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
    return { parts: await answerParts(page.recipe.parts), readAt: new Date().toISOString() }
  },
  component: KeptPage,
  pendingComponent: Loading,
  notFoundComponent: NoPage,
})

function KeptPage() {
  const { page: id } = Route.useParams()
  const page = usePage(id)
  const { parts, readAt } = Route.useLoaderData()
  useRetry(parts.some(waitsForBackend))
  // Deleted in another tab while it was open.
  if (!page) return <NoPage />
  return (
    <Column head={<Head page={page} line={`as of ${clock(readAt)}`} />}>
      {parts.map((part, index) => (
        // The parts of a page keep their order, so the place is the key.
        <DrawnPart key={index} part={part} />
      ))}
    </Column>
  )
}

/**
 * The head of a page, laid out like the heads of the other pages: the title, which can be renamed
 * in place, and the line under it; beside them the pin, "Share" and a menu with what else there is
 * to do.
 */
function Head({ page, line }: { page: StoredPage; line: string }) {
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  return (
    // Where the title and the buttons do not fit side by side, the buttons go under the title.
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-72">
        <Title page={page} />
        <p className="text-sm text-muted-foreground">{line}</p>
      </div>
      <div className="flex items-center gap-2">
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

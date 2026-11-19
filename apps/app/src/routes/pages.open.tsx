import { clock } from "@pleiades/cards/machine/format.ts"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Button, buttonVariants } from "@pleiades/ui/components/button"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { Link, createFileRoute, retainSearchParams, useNavigate } from "@tanstack/react-router"
import { LinkIcon, SearchXIcon } from "lucide-react"
import { useState } from "react"

import { useRetry } from "@/hooks/use-live.ts"
import { Column, PartsLoading } from "@/pages/column.tsx"
import { DrawnPart, askParts, useAnswers, waitsForBackend } from "@/pages/drawn-part.tsx"
import { RECIPE_PARAM, decodeRecipe } from "@/pages/link.ts"
import type { Recipe } from "@/pages/recipe.ts"
import { shownParts } from "@/pages/shown-parts.ts"
import { savePage } from "@/pages/store.ts"

/**
 * A page opened from a link: the recipe is in the address (`pages/link.ts`), not in this browser. It
 * is drawn exactly as a kept page is, in the same column and with the same parts, read once when it
 * is opened, with no language model and no chat: the values are those of then, whoever made the
 * link. Above it a notice says that this browser does not keep it yet, and "Save to my pages" keeps
 * it. There is no rename, pin or delete here: those come once the page is kept.
 *
 * The recipe is input from outside. Nothing but `decodeRecipe` lets it in, which holds it to
 * `recipeOf`; the server of the app calls only the tools the chat draws (`pages/call-part.ts`); the
 * title is drawn as text; and nothing in the link says where the app goes next.
 *
 * `/pages/open` is a route of its own, so it never meets `/pages/$page`: the ids of the pages kept
 * in a browser are twelve hex digits, and "open" is not.
 */
export const Route = createFileRoute("/pages/open")({
  // No entry of its own in the sidebar: it stands under "Pages", and in the breadcrumb the page is
  // called by the title in the link. A link without a recipe has no title: the breadcrumb says
  // "Pages" alone, as for a page that this browser does not keep.
  staticData: { crumb: (_params, search) => decodeRecipe(search[RECIPE_PARAM])?.title ?? "" },
  // The recipe is the one parameter; a value that is not a string is no recipe, and is left out.
  validateSearch: (search): { r?: string } => (typeof search[RECIPE_PARAM] === "string" ? { r: search[RECIPE_PARAM] } : {}),
  // The chat panel opens and closes by a search of its own, which would take the recipe out of the
  // address and the page with it. This page keeps its recipe when it is the page that is shown. A
  // link to any other page leaves it behind (`search.strict` in router.tsx).
  search: { middlewares: [retainSearchParams<{ r?: string; chat?: string }>([RECIPE_PARAM])] },
  loaderDeps: ({ search }) => ({ recipe: search.r }),
  // The recipe is in the address, and so is this loader (the app renders in the browser).
  loader: async ({ deps }) => {
    const recipe = decodeRecipe(deps.recipe)
    if (recipe === null) return { opened: null }
    return { opened: { recipe, parts: askParts(recipe.parts), readAt: new Date().toISOString() } }
  },
  component: OpenedPage,
  pendingComponent: Loading,
})

/** No parts: one array, so that the answers are not asked for again on every draw. */
const NO_PARTS: ReadonlyArray<never> = []

function OpenedPage() {
  const { opened } = Route.useLoaderData()
  // An answer stands until the newer one of its part comes, also while the page is read again.
  const { answers } = useAnswers(opened?.parts ?? NO_PARTS)
  const shown = shownParts(opened?.recipe.parts ?? NO_PARTS, answers)
  useRetry(shown.some(({ answered }) => answered !== undefined && waitsForBackend(answered)))
  if (!opened) return <NoRecipe />
  return (
    <Column>
      <Notice recipe={opened.recipe} />
      <Head title={opened.recipe.title} line={`as of ${clock(opened.readAt)} · from a link`} />
      {shown.map(({ key, answered }) =>
        answered ? <DrawnPart key={key} part={answered} /> : <Skeleton key={key} className="h-40 w-full" />,
      )}
    </Column>
  )
}

/** The head of the page: its title, and the line under it. Nothing to rename, pin or delete yet. */
function Head({ title, line }: { title: string; line: string }) {
  return (
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold wrap-break-word">{title}</h1>
      <p className="text-sm text-muted-foreground">{line}</p>
    </div>
  )
}

/**
 * What this page is, in words, and the one thing to do: keep it. The page is kept as it is in the
 * link, and the person goes to it; the chat stays as it is, and the link stays behind. If the
 * browser does not keep it, the notice says so, and the page stays open here.
 */
function Notice({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate()
  const [kept, setKept] = useState(false)
  const [refused, setRefused] = useState(false)
  function keep() {
    const page = savePage(recipe)
    if (page === null) {
      setRefused(true)
      return
    }
    setRefused(false)
    // Once: the way to the new page takes a moment, and a second press would keep it twice.
    setKept(true)
    // `replace`: the link is not a step back to a page that was meant to be kept once.
    void navigate({
      to: "/pages/$page",
      params: { page },
      search: (before) => (before.chat ? { chat: before.chat } : {}),
      replace: true,
    })
  }
  return (
    // The action stands at the right end and takes its width from the room the notice leaves it.
    <Alert variant={refused ? "destructive" : "default"} className="has-data-[slot=alert-action]:pr-44">
      <LinkIcon />
      <AlertTitle>Opened from a link.</AlertTitle>
      <AlertDescription>
        {refused
          ? "This browser did not keep the page: it blocks its storage, or the storage is full."
          : "This page is not in your pages yet."}
      </AlertDescription>
      <AlertAction>
        <Button size="sm" disabled={kept} onClick={keep}>
          Save to my pages
        </Button>
      </AlertAction>
    </Alert>
  )
}

/**
 * A link that holds no recipe: cut off where it was copied, written by hand, or from an app that
 * keeps its pages otherwise. It has no title: a title would name a page that is not there.
 */
function NoRecipe() {
  return (
    <Column>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>No page in this link</EmptyTitle>
          <EmptyDescription>
            This link holds no page. It may have been cut off when it was copied. Ask whoever sent it for the link again.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/* A link that looks like a button, as on the page of a machine. The chat stays open. */}
          <Link to="/pages" search={(before) => (before.chat ? { chat: before.chat } : {})} className={buttonVariants()}>
            All pages
          </Link>
        </EmptyContent>
      </Empty>
    </Column>
  )
}

/** While the parts are asked: the title in the link, and a placeholder for each part. */
function Loading() {
  const recipe = decodeRecipe(Route.useSearch().r)
  return <PartsLoading title={recipe?.title} parts={recipe?.parts.length ?? 1} />
}

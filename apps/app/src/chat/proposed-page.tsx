import { Link, useNavigate } from "@tanstack/react-router"
import { CircleCheckIcon } from "lucide-react"
import { useState } from "react"

import { keepProposal, keptPageOf } from "@/pages/kept-proposals.ts"
import { encodeRecipe } from "@/pages/link.ts"
import { PROPOSE_PAGE_TOOL, partInWords, proposedRecipe } from "@/pages/proposal.ts"
import type { Recipe } from "@/pages/recipe.ts"
import { savePage, usePages } from "@/pages/store.ts"
import { Button, buttonVariants } from "@pleiades/ui/components/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@pleiades/ui/components/item"

import type { ChatTool } from "./tool-results.ts"

/**
 * The entry of the chat's list for the proposal of a page (pages/proposal.ts): what a call is called,
 * and what the chat draws for its result. Only the chat calls the tool; a page never holds it.
 * `tools` is the chat's list, asked for when the proposal is drawn: the list holds this entry too.
 */
export function proposalTool(tools: () => ReadonlyArray<ChatTool>): ChatTool {
  return {
    name: PROPOSE_PAGE_TOOL,
    label: {
      running: "Proposing a page",
      done: "Proposed a page",
      failed: "Failed to propose a page",
    },
    saveAsPage: false,
    draw(content, call) {
      const recipe = proposedRecipe(content)
      return recipe && <ProposedPage recipe={recipe} call={call?.id} tools={tools()} />
    },
  }
}

/**
 * A page the chat proposes: its title, its parts in words, and two things to do. "Preview" opens it
 * where a page from a link opens (`/pages/open`), drawn with the values of now. "Save to my pages"
 * keeps it, as "Save as page" does, and goes to it beside the chat. Then the card says so and leads
 * to the page; a page deleted since then is no longer said to be there.
 *
 * Which page the proposal was kept as is noted by the id of its tool call (`call`, pages/kept-proposals.ts),
 * so it holds after a reload and after the page was renamed or its parts changed: the proposal does not
 * offer to keep a second page. A page kept otherwise, from "Preview", is found while its recipe is still
 * exactly the proposed one.
 */
function ProposedPage({ recipe, call, tools }: { recipe: Recipe; call?: string; tools: ReadonlyArray<ChatTool> }) {
  const navigate = useNavigate()
  const pages = usePages()
  const [id, setId] = useState(() => (call === undefined ? undefined : keptPageOf(call)))
  const [refused, setRefused] = useState(false)
  const key = JSON.stringify(recipe)
  const kept = pages.find((page) => page.id === id) ?? pages.find((page) => JSON.stringify(page.recipe) === key)
  // A page too long for an address has no preview; it can still be kept.
  const link = encodeRecipe(recipe)
  const save = () => {
    const page = savePage(recipe)
    if (page === null) {
      setRefused(true)
      return
    }
    setRefused(false)
    if (call !== undefined) keepProposal(call, page)
    setId(page)
    void navigate({ to: "/pages/$page", params: { page }, search: true })
  }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="wrap-break-word">{recipe.title}</CardTitle>
        <CardDescription>Proposed page</CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-0">
          {recipe.parts.map((part, index) => {
            const { shows, given } = partInWords(part, tools)
            return (
              // The parts keep their order, so the place is the key.
              <Item key={index} role="listitem" size="xs" className="px-0">
                <ItemContent className="min-w-0">
                  <ItemTitle>{shows}</ItemTitle>
                  {given !== "" && <ItemDescription className="wrap-anywhere">{given}</ItemDescription>}
                </ItemContent>
              </Item>
            )
          })}
        </ItemGroup>
      </CardContent>
      {/* The row stays in place while its content changes, so a screen reader says what the press did. */}
      <CardFooter role="status" className="flex-wrap gap-2">
        {kept !== undefined ? (
          <>
            <CircleCheckIcon aria-hidden className="size-4" />
            <span>Saved as page</span>
            <Link
              to="/pages/$page"
              params={{ page: kept.id }}
              search
              className={buttonVariants({ variant: "link", size: "xs" })}
            >
              Open
            </Link>
          </>
        ) : (
          <>
            <Button size="sm" onClick={save}>
              Save to my pages
            </Button>
            {link !== null && (
              // A link that looks like a button, as on the page of a machine. The chat stays open.
              <Link
                to="/pages/open"
                search={(before) => ({ ...(before.chat ? { chat: before.chat } : {}), r: link })}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Preview
              </Link>
            )}
            {refused && (
              <span className="text-destructive">This browser did not keep the page: it blocks its storage, or the storage is full.</span>
            )}
          </>
        )}
      </CardFooter>
    </Card>
  )
}

---
name: create-page
description: Adds a page to the example app (apps/app) - a screen people open, made of answers the generative UI backend already gives. Use for a new route, overview, list or dashboard page in the example app, or when build-your-own found that an answer exists and no place shows it.
---

# Create a page

A page is a screen people open in the example app. It shows answers that exist: it calls tools of the
generative UI backend and draws what they return. If the answer does not exist yet, this is the wrong recipe:
take `create-card` first.

The example: the open warnings of all machines, in a file `apps/app/src/routes/warnings.tsx`. The generative
UI backend knows them already: `genui_machine_list` returns every machine with its `notifications`, and
`getMachines()` in `apps/app/src/machines/get-machines.ts` calls it. So the page only asks and draws.

Which tool has an answer, and what its values are:

```bash
node .claude/skills/build-your-own/look.mjs                              # the tools, under "Answers"
node .claude/skills/build-your-own/look.mjs call <tool> <key>=<value>    # one answer as it is
```

The shape of the values is the contract of the card: `packages/cards/src/<card>/contract.ts`.

## Before you write code

Read, in this order:

1. [`apps/app`: What is where](../../../apps/app/README.md#what-is-where).
2. The skills of the libraries, in the versions this repository pins:

   ```bash
   pnpm exec intent load @tanstack/router-core#router-core
   pnpm exec intent load @tanstack/react-router#react-router
   pnpm exec intent load @tanstack/start-client-core#start-core/server-functions
   ```

   `router-core` names its sub-skills. Take `data-loading` for the loader, `search-params` if the page keeps
   what it shows in the address, `not-found-and-errors` if a thing can be missing. A sub-skill loads the
   same way, with its name after a slash: `pnpm exec intent load @tanstack/router-core#router-core/data-loading`.
   Load no more than the page needs.
3. The skill `shadcn` (`.claude/skills/shadcn/`), and the docs of every component before you use it:
   `pnpm --filter @pleiades/app exec shadcn docs <name>`. The command names the page of the docs: read that
   page. With `.md` at the end of its address it comes whole, with its examples. Use the CLI this workspace
   pins, as here, also where the skill of shadcn/ui writes `shadcn@latest`.

## You touch

- `apps/app/src/routes/<name>.tsx`: new, the page. It names its own entry in the sidebar, see step 6. No
  list of pages is shared, so two new pages never meet in one file.
- `apps/app/src/machines/get-machines.ts`, only if no server function calls the tool you need: one more, like
  the ones there.

`apps/app/src/routeTree.gen.ts` is not yours to touch and not in the repository: it is written from the
route files, by `pnpm install`, the typecheck, the development server and the build. Never edit it, and
never commit it.

Nothing else: no change to the backend, to a card or to a shared component. If the page needs one, stop and
say so.

Two things a new page does not get, and you leave them as they are. The breadcrumb in the header:
`src/components/page-breadcrumb.tsx` holds it for Home and for the page of a machine only. And a place in
`docs/tour.md` and in the README of the app: `AGENTS.md` asks for the tour when the demo shows something
new. For a page of your own, say in your hand-over that the tour does not show it yet; whoever merges the
page decides whether it joins the tour.

## Steps

1. Add the route file. The file is the route: write `createFileRoute("/<name>")` with the path the name of
   the file gives. Until it is written into `src/routeTree.gen.ts`, the types do
   not know the page: `pnpm --filter @pleiades/app typecheck` writes it, and so does the development server
   while it runs.
2. Read the values in the loader of the route, with a server function. The browser never talks to the
   backend itself.
3. Draw with what is there, in this order: a card of `@pleiades/cards`; the rows of
   `src/machines/machine-item.tsx`, where a row is a machine; a shadcn/ui component of `packages/ui`,
   imported as `@pleiades/ui/components/<name>`, for anything else, a row for each warning for example. The
   signs of the states come from `@pleiades/cards` too (`StateSymbol`). Add a missing component with
   `pnpm --filter @pleiades/app exec shadcn add <name>`, which writes it into `packages/ui`, and build no
   element of your own. An empty result gets the `Empty` component; a failure gets `NoAnswer`
   (`src/components/no-answer.tsx`), which says what failed.

   Take the parts of a component, their order and their properties from its docs, whole. Take the
   arrangement from the pages that are there: a list is laid out as Home lays out its lists, and the title
   is the block at the top of `src/routes/index.tsx`, which is not shared: copy it. So two pages look alike.
   Only where a page that is there breaks what the docs of a component say do the docs win: say so in your
   hand-over.
4. Compute nothing in the page but wording. Choosing among the values a tool returned and writing them out
   is wording: a filter, a time, the duration between two instants, with the helpers of `@pleiades/cards`.
   Counting the rows you draw is wording too, as Home counts its machines. Adding up values, comparing
   machines or putting things in a new order is not: that answer is missing, so stop and take
   `create-card`. Keep the order the tool returned.
5. If the values change, read them again the way Home does, with `useLive()`.
6. Give the page its entry in the sidebar, in the route itself:
   `staticData: { nav: { title: "Warnings", icon: TriangleAlertIcon } }`, with an icon of `lucide-react`,
   as `src/routes/index.tsx` does for Home. The sidebar reads its entries from the routes and marks the
   page a person is on. Entries stand by their title; an `order` below 100 moves one up. A page that names
   no entry stands in no list: right for a page that is reached from another one, like the page of a
   machine.

The page looks like the pages that are there: the same title, the same spacing, the light theme.

## Done when

Run the checks. Do not assume them.

- `pnpm typecheck && pnpm test && pnpm build` pass.
- The page shows real values of the running stack. While you work, use the development server:
  `pnpm --filter @pleiades/app dev`, <http://localhost:3000/>. At the end stop it and put the page into the
  stack: `docker compose up -d --build --wait --no-deps app`, then open `http://localhost:5600/<name>`.
- You have looked at the page: its values are those of `look.mjs call <tool>`, nothing runs over, and an
  empty list says that it is empty. The stack is rarely empty when you need it to be: draw the page once
  with an empty list in the development server, look at it, and take that line out again. Without a browser,
  say that nobody has looked at the page.
- The diff holds only the files under "You touch".

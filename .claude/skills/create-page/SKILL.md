---
name: create-page
description: Adds a page to the example app (apps/app) - a screen people open, made of answers the generative UI backend already gives. Use for a new route, overview, list or dashboard page in the example app, or when build-your-own found that an answer exists and no place shows it.
---

# Create a page

A page is a screen people open in the example app. It shows answers that exist: it calls tools of the
generative UI backend and draws what they return. If the answer does not exist yet, this is the wrong recipe:
take `create-card` first.

The example: the open warnings of all machines. The generative UI backend knows them already, so the page only
asks and draws.

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
   what it shows in the address, `not-found-and-errors` if a thing can be missing. Load no more than the page
   needs.
3. The skill `shadcn` (`.claude/skills/shadcn/`), and the docs of every component before you use it:
   `pnpm --filter @pleiades/app exec shadcn docs <name>`. The command names the page of the docs: read that
   page. Use the CLI this workspace pins, as here, also where the skill of shadcn/ui writes `shadcn@latest`.

## You touch

- `apps/app/src/routes/<name>.tsx`: new, the page.
- `apps/app/src/components/app-sidebar.tsx`: one entry. The sidebar marks the page a person is on: let the
  mark follow the route, for the entries that are there too.
- `apps/app/src/routeTree.gen.ts`: written by the build. Commit it, never edit it.
- `apps/app/src/machines/get-machines.ts`, only if no server function calls the tool you need: one more, like
  the ones there.

Nothing else: no change to the backend, to a card or to a shared component. If the page needs one, stop and
say so.

## Steps

1. Add the route file. The file is the route. The build writes it into `src/routeTree.gen.ts`, and until it
   has, the types do not know the page: run `pnpm --filter @pleiades/app build` once.
2. Read the values in the loader of the route, with a server function. The browser never talks to the
   backend itself.
3. Draw with what is there, in this order: a card of `@pleiades/cards`, the rows of
   `src/machines/machine-item.tsx`, a shadcn/ui component under `src/components/ui/`. Add a missing component
   with `shadcn add`. Use the composition of its docs whole, and build no element of your own. An empty
   result gets the `Empty` component; a failure says what failed. Where a page that is there and the docs of
   a component disagree, the docs win: say so in your hand-over.
4. Compute nothing in the page but wording. Choosing among the values a tool returned and writing them out
   is wording: a filter, a time, the duration between two instants, with the helpers of `@pleiades/cards`.
   Adding up, comparing machines or putting things in a new order is not: that answer is missing, so stop
   and take `create-card`.
5. If the values change, read them again the way Home does, with `useLive()`.
6. Add the page to the sidebar.

The page looks like the pages that are there: the same header, the same spacing, the light theme.

## Done when

Run the checks. Do not assume them.

- `pnpm typecheck && pnpm test && pnpm build` pass.
- The page shows real values of the running stack. While you work, use the development server:
  `pnpm --filter @pleiades/app dev`, <http://localhost:3000/>. At the end stop it and put the page into the
  stack: `docker compose up -d --build --wait --no-deps app`, then open `http://localhost:5600/<name>`.
- You have looked at the page: the values are the ones Home or the chat show, nothing runs over, an empty
  list says that it is empty. Without a browser, fetch the page and say that nobody has looked at it.
- The diff holds only the files under "You touch".

# playground-app

The example application: a single-page app on [TanStack Start](https://tanstack.com/start). The browser renders
the app. The server delivers the document, the server routes and the server functions, and will run the agent
harness.

Home asks "what needs you?": it lists the machines of the demo stack, first those in alarm, stopped or without
data, then those in setup, then the running ones, and reads them again every ten seconds. The values come from
[`genui-mcp`](../genui-mcp/README.md); the app draws them itself. Cards and chat follow.

| | |
|---|---|
| In the demo stack | <http://localhost:5600/>, port from `APP_PORT` |
| Liveness | `GET /health` |
| Image | `pleiades.playground.app` |
| Settings | `GENUI_MCP_URL`, the MCP endpoint of the generative UI backend |

## Develop

```bash
pnpm install
pnpm --filter @pleiades/playground-app dev
pnpm --filter @pleiades/playground-app test
```

The development server listens on <http://localhost:3000/> and reads from <http://localhost:5520/mcp>, where
the backend of the running demo stack answers.

## What is where

- `src/routes/`: one file per route. `__root.tsx` is the document and the layout, `index.tsx` is Home,
  `health.ts` is a server route.
- `src/routeTree.gen.ts`: written by the build. Commit it, never edit it.
- `src/machines/`: Home. `get-machines.ts` is the server function that calls the backend as a typed MCP client,
  `state.ts` decides which value of the binding is which state on the screen, `state-symbol.tsx` draws the
  signs.
- `src/components/ui/`: [shadcn/ui](https://ui.shadcn.com) components, added with `shadcn add` and kept as
  generated. `components.json` holds the settings of the preset `b5JNecjwG`.
- `src/styles.css`: the theme of the preset, light only. `src/dataviz.css`: chart and state colours.

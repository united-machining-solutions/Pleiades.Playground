# playground-app

The example application: a single-page app on [TanStack Start](https://tanstack.com/start). The browser renders
the app. The server delivers the document and the server routes, and will run the agent harness.

For now it is an empty shell; cards and chat follow.

| | |
|---|---|
| In the demo stack | <http://localhost:5600/>, port from `APP_PORT` |
| Liveness | `GET /health` |
| Image | `pleiades.playground.app` |

## Develop

```bash
pnpm install
pnpm --filter @pleiades/playground-app dev
```

The development server listens on <http://localhost:3000/>.

## What is where

- `src/routes/`: one file per route. `__root.tsx` is the document and the layout, `health.ts` is a server route.
- `src/routeTree.gen.ts`: written by the build. Commit it, never edit it.
- `src/styles.css`: the theme of the [shadcn/ui](https://ui.shadcn.com) preset `b5JNecjwG`, light only.
  `components.json` holds the settings of the preset for `shadcn add`.
- `src/dataviz.css`: chart and state colours.

## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## How it was verified

- [ ] `dotnet build` and `dotnet test --solution source/Pleiades.Playground.slnx`
- [ ] `pnpm typecheck`, `pnpm test` and `pnpm build` (if `apps/` or `packages/` are affected)
- [ ] `docker compose up -d --build`, all containers healthy (if the stack is affected)
- [ ] Not verified: <!-- say what and why -->

## Checklist

- [ ] One topic, English only
- [ ] Commits are signed off (`git commit -s`)
- [ ] A contract under `contracts/` changed: the affected maintainers are asked for review
- [ ] The user interface changed: every element is a shadcn/ui component in its documented composition, or the
      exception is named above
- [ ] No secret value, no internal host name, no customer data
- [ ] `CHANGELOG.md` updated for a notable change

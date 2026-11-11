# Entry point for coding agents

Read [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md) and the decisions under
[docs/adr](docs/adr/README.md) before changing anything.

- English only, in code, comments, documentation and commits.
- Names: `Pleiades.Playground.<Area>.<Part>` (.NET), `pleiades.playground.<area>.<part>` (images).
- .NET lives flat under `source/` in one solution with central package versions; add a `<PackageVersion>` to
  `source/Directory.Packages.props`, never a version in a project file. nuget.org is the only feed.
- TypeScript lives under `apps/` and `packages/` in one pnpm workspace with central versions; add a version to
  the `catalog` in `pnpm-workspace.yaml`, never a version in a `package.json`. npmjs.org is the only registry.
- A service reads and writes data only through a contract under `contracts/`. Change the contract first.
- SI units only; energy in joule, fractions in `one`. Never invent or convert units on the wire.
- Never commit a secret value. Names go to `.env.example`.
- Verify before you claim: `dotnet build` and `dotnet test --solution source/Pleiades.Playground.slnx`; for
  TypeScript `pnpm typecheck`, `pnpm test` and `pnpm build`; for the stack
  `docker compose up -d --build` and healthy containers. Say what you could not verify.
- Do not commit, push or publish unless asked.

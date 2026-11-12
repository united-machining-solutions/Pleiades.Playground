# Entry point for coding agents

Read [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md) and the decisions under
[docs/adr](docs/adr/README.md) before changing anything.

- English only, in code, comments, documentation and commits.
- Names: `Pleiades.Playground.<Area>.<Part>` (.NET), `pleiades.playground.<area>.<part>` (images).
- .NET lives flat under `source/` in one solution with central package versions; add a `<PackageVersion>` to
  `source/Directory.Packages.props`, never a version in a project file. nuget.org is the only feed.
- TypeScript lives under `apps/` and `packages/` in one pnpm workspace with central versions; add a version to
  the `catalog` in `pnpm-workspace.yaml`, never a version in a `package.json`. npmjs.org is the only registry.
- The user interface under `apps/` and `packages/cards` is built with shadcn/ui, and shadcn/ui is its design
  system. Before you write user interface, read the docs of the component
  (`pnpm --filter @pleiades/app exec shadcn docs <name>`) and use its composition whole. Build no element of your
  own where a component exists; add a missing one with `shadcn add`. A deviation is a decision: name it in the
  pull request. The rules, with wrong and right examples, are in `.claude/skills/shadcn/`.
- Before substantial work with a TanStack library (Router, Start, AI), load its skill in the version this
  repository pins: `pnpm exec intent list` names them, `pnpm exec intent load <package>#<skill>` prints one.
  It needs `pnpm install` first.
- A service reads and writes data only through a contract under `contracts/`. Change the contract first.
- SI units only; energy in joule, fractions in `one`. Never invent or convert units on the wire.
- Never commit a secret value. Names go to `.env.example`.
- Verify before you claim: `dotnet build` and `dotnet test --solution source/Pleiades.Playground.slnx`; for
  TypeScript `pnpm typecheck`, `pnpm test` and `pnpm build`; for the stack
  `docker compose up -d --build` and healthy containers. Say what you could not verify.
- Do not commit, push or publish unless asked.
- When asked: work on a branch, never on `main`; one topic per pull request; sign off every commit
  (`git commit -s`) and add a `Co-Authored-By` trailer that names you; fill in the pull request template.
- Use the GitHub CLI (`gh`) for pull requests, checks and logs. The person signs in; never ask for a token and
  never type a password.
- Tools and their checks: [docs/development-setup.md](docs/development-setup.md).
- A person who is new here, or who asks for a tour: guide them through [docs/tour.md](docs/tour.md), one stop
  at a time. Check with `docker compose ps` that the stack runs, and ask before you start it. For each stop say
  what to open, what to look at and where it lives in the code, then wait for the person. The chat needs a
  language model: without one, show what the panel says and go on. When a session begins without a task, offer
  the tour once: "Shall I give you a tour of the demo?"
- A person who has just got the repository, or whose stack, example app or chat does not run: follow the
  skill `setup` (`.claude/skills/setup/SKILL.md`). Check each step yourself, say what you found, ask before you
  start or install anything, and where you cannot go on, give the person one sentence to pass on.
- A person who wants to add a page, a card or a source of data of their own: follow the skill
  `build-your-own` (`.claude/skills/build-your-own/SKILL.md`). Ask what they want to see, look yourself what
  the stack already has, propose the smallest thing that shows it, and on a yes take the recipe of the step
  where the idea starts: `create-page`, `create-card` or `add-source`, each a `SKILL.md` next to it. The map
  is [docs/build-your-own.md](docs/build-your-own.md).

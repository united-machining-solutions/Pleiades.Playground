# Contributing

Thank you for helping. This is a playground: small, reviewable changes beat large ones.

## How to contribute

1. Open an issue first if the change touches a contract under `contracts/` or adds a service.
2. Work on a branch and open a pull request against `main`. `main` is protected, nobody pushes to it directly.
3. Keep one topic per pull request and describe what you verified.
4. A maintainer of the affected area reviews (see [MAINTAINERS.md](MAINTAINERS.md) and `.github/CODEOWNERS`).

## Sign your work (DCO)

Every commit carries a `Signed-off-by` line. By adding it you certify the
[Developer Certificate of Origin 1.1](https://developercertificate.org/): you wrote the change or have the right
to submit it under the licence of this repository.

```bash
git commit -s -m "feat(events-api): pairs with duration"
```

There is no contributor licence agreement.

## Conventions

- **Language:** English only, in code, comments, documentation and commit messages.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), for example
  `fix(timeseries-persistence): reject numbers without unit`.
- **Names:** `Pleiades.Playground.<Area>.<Part>` for .NET projects, `pleiades.playground.<area>.<part>` for images,
  kebab-case for folders outside `source/`.
- **Units:** SI only, see [ADR-0002](docs/adr/0002-si-units-joule-and-one.md).
- **Secrets:** never commit a value. Add the name to `.env.example` and document it.
- **Licence headers:** new files may carry `SPDX-License-Identifier: Apache-2.0`; documentation is CC BY 4.0.
- **Decisions:** a choice that shapes the repository gets a short record under `docs/adr/`.

## Checks before a pull request

```bash
cd source
dotnet build Pleiades.Playground.slnx -c Release
dotnet test --solution Pleiades.Playground.slnx -c Release
```

For changes to the stack: `docker compose up -d --build` and check that every container reports healthy.
The same checks run in CI on every pull request.

## Adding a service

A service is a folder with a `Dockerfile` and a short README. It reads and writes data only through a contract
under `contracts/`, exposes a liveness endpoint and is added to `compose.yaml`. The language is up to you.

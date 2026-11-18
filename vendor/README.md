# Vendored packages

Packages that are not on npmjs.org and are therefore checked in as tarballs. The catalog in
`pnpm-workspace.yaml` refers to a tarball with `file:`, so `pnpm install --frozen-lockfile` needs neither a
registry nor a neighbouring folder for it, also in CI and in the image builds. The decision is
[ADR-0021](../docs/adr/0021-hub-registration.md).

| File | Package | Version | Origin |
| --- | --- | --- | --- |
| `pleiades-hub-sdk-0.1.2.tgz` | `@pleiades/hub-sdk` | 0.1.2 | `packages/sdk` of `umati/pleiades-hub`, packed there with `pnpm sdk:pack` on 2026-11-18 from its commit `75e8162` on the branch `feat/register-hub-app-skill` |

SHA-256 of `pleiades-hub-sdk-0.1.2.tgz`:
`a3f288963a21c9b1790b566276809816332111882beffe12533aa26bd3c1c43f`

## Refreshing a tarball

1. In `pleiades-hub`: raise the version in `packages/sdk/package.json` and run `pnpm sdk:pack`. The tarball is
   written to `artifacts/`.
2. Copy it here, remove the old one, and change the file name in the catalog of `pnpm-workspace.yaml`.
3. Run `pnpm install`, so the lockfile takes the new file and its checksum.
4. Change the table and the checksum above.
5. For the SDK of the hub: copy `.claude/skills/register-hub-app/SKILL.md` from `pleiades-hub` over the copy
   here and change its `SOURCE.md`. The skill and the guide inside the tarball belong together.

Do not edit a tarball, and do not replace one under the same name: the lockfile records its checksum. A change
to the SDK gets a new version.

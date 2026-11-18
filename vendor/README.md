# Vendored packages

Packages that are not on npmjs.org and are therefore checked in as tarballs. The catalog in
`pnpm-workspace.yaml` refers to a tarball with `file:`, so `pnpm install --frozen-lockfile` needs neither a
registry nor a neighbouring folder for it, also in CI and in the image builds. The decision is
[ADR-0020](../docs/adr/0020-hub-registration.md).

| File | Package | Version | Origin |
| --- | --- | --- | --- |
| `pleiades-hub-sdk-0.1.1.tgz` | `@pleiades/hub-sdk` | 0.1.1 | `packages/sdk` of `umati/pleiades-hub`, packed there with `pnpm sdk:pack` on 2026-11-18 from its commit `1f823ff` on the branch `feat/register-hub-app-skill` |

SHA-256 of `pleiades-hub-sdk-0.1.1.tgz`:
`9272585826f2115b109d03a16bde9b91327710eb5b0ff84590389bfc8e46f110`

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

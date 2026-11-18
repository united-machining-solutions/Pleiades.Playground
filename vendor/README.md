# Vendored packages

Packages that are not on npmjs.org and are therefore checked in as tarballs. The catalog in
`pnpm-workspace.yaml` refers to a tarball with `file:`, so `pnpm install --frozen-lockfile` needs neither a
registry nor a neighbouring folder for it, also in CI and in the image builds. The decision is
[ADR-0020](../docs/adr/0020-hub-registration.md).

| File | Package | Version | Origin |
| --- | --- | --- | --- |
| `pleiades-hub-sdk-0.1.0.tgz` | `@pleiades/hub-sdk` | 0.1.0 | `packages/sdk` of `umati/pleiades-hub`, packed there with `pnpm sdk:pack` on 2026-11-18 from the working tree: the hub had no commit yet |

SHA-256 of `pleiades-hub-sdk-0.1.0.tgz`:
`f147f3f5811fafd6ba1d633cc9a407a4a39779cbe6fdd52679fb4e191db8d53d`

## Refreshing a tarball

1. In `pleiades-hub`: raise the version in `packages/sdk/package.json` and run `pnpm sdk:pack`. The tarball is
   written to `artifacts/`.
2. Copy it here, remove the old one, and change the file name in the catalog of `pnpm-workspace.yaml`.
3. Run `pnpm install`, so the lockfile takes the new file and its checksum.
4. Change the table and the checksum above.

Do not edit a tarball, and do not replace one under the same name: the lockfile records its checksum. A change
to the SDK gets a new version.

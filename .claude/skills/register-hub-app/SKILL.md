---
name: register-hub-app
description: Registers an app at the Pleiades Hub with the SDK @pleiades/hub-sdk, so it appears in the launcher of the hub, or repairs a registration that does not work. Use when a person says "register this app at the hub", "add the app to the launcher", "integrate the hub SDK", when a second app of the same backend should appear in the hub, when the SDK tarball under vendor/ gets a new version, or when an app is missing in the hub, shows initials instead of its icon or stays empty in the iframe.
---

# Register an app at the Pleiades Hub

This skill holds no steps of its own. The steps are in one guide, `register-an-app.md`, which belongs to the
SDK and has its version. Read it completely before you change anything, then follow it.

## Where the guide is

Take the first that exists:

1. **In the installed SDK:** `node_modules/@pleiades/hub-sdk/register-an-app.md`, in the package whose
   backend depends on the SDK (for example `apps/api/node_modules/...`). It is there from version 0.1.1 on.
2. **In the hub's repository** (`umati/pleiades-hub`), if you have a checkout:
   `packages/sdk/register-an-app.md`.

If neither exists, the repository does not have the SDK yet and you cannot get it by yourself: it is not on
an npm registry. Ask the person for the tarball `pleiades-hub-sdk-<version>.tgz`. It is written by
`pnpm sdk:pack` in the hub's repository, and every app that is registered already has it under `vendor/`.
Do not write an MQTT client by hand instead, and do not install a package of a similar name from a registry.

Links in the guide that leave its folder point into the hub's repository. The `README.md` next to the guide
is the reference of the SDK.

## Before you start

- Read `AGENTS.md` of the repository you are in. Its rules on dependencies, the catalog, ADRs and commits
  come before the guide: the guide says what the registration needs, the repository says how it is done
  there.
- Find out whether the app is registered already: search the backend for `createHubClient`. A second app of
  the same process is one more entry in `apps`, not a second client.

## Done means

Do not report the registration as working before you have seen all of this, and say which of it you could
not check:

- `GET http://localhost:3300/api/apps` answers with `"broker": "connected"` and lists the app with its
  `id`, `label`, `url` and `icon`.
- The icon link, resolved against `url`, answers with an SVG.
- After the app is stopped, the hub no longer lists it, within a second.
- Without `HUB_MQTT_URL`, the app starts and opens no connection to a broker.
- The checks the repository demands (types, tests, build) pass.

When the app is not listed, the guide has a table of the likely causes: section "Check that it works".

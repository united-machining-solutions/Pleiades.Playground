# Margo app

The demo stack as a [Margo](https://margo.sh) application, so that an orchestrator installs it on an edge device
the way it installs any other app. The folder is a project of `bart`, the FLECS tool that validates a
Margo app, packages it and pushes it to a registry; `bart init` scaffolded it.

```text
margo/
├── app/                      The catalog entry
│   ├── margo.yaml            ApplicationDescription: id, metadata, deployment profile, parameters, settings
│   ├── description.md        Shown in the catalog
│   ├── release-notes.md
│   ├── license.txt           Copy of LICENSE
│   └── icon.svg
└── compose/                  The component: everything here goes into the package
    ├── compose.yaml          The demo stack, with Traefik in front of the example app
    ├── broker/mosquitto.conf Copy of stacks/broker/mosquitto.conf
    └── traefik/dynamic.yaml  The route of Traefik to the example app
```

## How it differs from `compose.yaml`

`compose/compose.yaml` runs the same eleven containers as [`compose.yaml`](../compose.yaml) at the root, written so
that bart accepts it, and one more, Traefik:

- **No `build:`.** The services take the images that the workflow "Images" publishes to
  `ghcr.io/united-machining-solutions`, for `linux/amd64` and `linux/arm64`. `bart build` does not fit here: it
  builds `src/<service>/Dockerfile` with that folder as the context, and every image of this repository needs
  `source/` or the root as its context.
- **Literal image references.** bart mirrors each `image:` as it stands and does not interpolate it, so there is
  no `${PLEIADES_VERSION}` and no `${MONGODB_VERSION}`. The images of this repository are on `main`; see
  [Release](#release).
- **No YAML anchors.** bart's compose parser does not resolve merge keys (`<<: *service`), so every service
  says everything itself.
- **The broker configuration is a `configs:` entry** from `compose/broker/`, because a bind mount may not leave
  `compose/`. The file is a copy; keep it the same as `stacks/broker/mosquitto.conf`:

  ```bash
  diff <(tail -n +3 margo/compose/broker/mosquitto.conf) stacks/broker/mosquitto.conf
  ```

- **Traefik in front of the example app.** It serves the app on the HTTP port (setting *HTTP port of Traefik*,
  80) under two host names: *Host name of the app*, `pleiades-margo.hub000.ums.internal`, a CNAME of the device,
  and *Host name of the device*, `srv03.hub000.ums.internal`, its A record. Traefik reads its route from
  `compose/traefik/dynamic.yaml`, a `configs:` entry, and not from Docker labels: those need the Docker socket,
  a bind mount out of `compose/`. The file is a Go template that takes the host names from the environment.
  Plain HTTP only; there is no certificate.
- **Settings, not `.env`.** Every `${VAR}` of the compose file is a parameter in `app/margo.yaml`, and each one
  is a setting the person who installs the app can change: the ports, the address of the example app, the
  retention and the language models. The default after `:-` in the compose file is the same as the value of the
  parameter.

A change to the stack in `compose.yaml` belongs here as well, in the same pull request.

## Check

```bash
bart validate --dir margo
bart package --dir margo --version 0.1.0 --out /tmp/margo-dist
```

`package` writes the catalog, the components tarball (the compose file with every image rewritten to the staging
registry, and the broker configuration) and `images/manifest.yaml`. It reads no registry and needs no
credentials. `dist/` is ignored by git.

## Release

A version tag releases the app. bart takes the version from `--version`, so the working tree need not be clean.

1. Add the release to `app/release-notes.md`, on `main`.
2. Tag the commit `v1.2.3` and push the tag.
3. The workflow "Images" publishes the images of this repository as `1.2.3`. When all of them are there, it calls
   the workflow [`margo-push.yml`](../.github/workflows/margo-push.yml), which:
   - pins the images of this repository in `compose/compose.yaml` from `:main` to `:1.2.3`, in that run only,
     so that the app is exactly that build;
   - runs `bart validate` and `bart push --version 1.2.3` from the image `cr.flecs.tech/flecs/bart`.

   `push` copies every image to `<registry>/staging-<app id>/<service>:1.2.3` on the staging registry
   (`apps.flecs.tech`), so the staged app no longer depends on ghcr.io. The images on ghcr.io are public and need
   no `--pull-auth`.
4. `bart release` promotes the staged version to production and `bart sign` signs it; both are for whoever runs
   the registry.

The workflow needs the repository secrets `BART_REGISTRY_USER` and `BART_REGISTRY_TOKEN`, the credentials of the
staging registry. "Margo push" can also be started by hand, under Actions, for a version whose images are already
on ghcr.io; its input `bart-version` picks another tag of the bart image than `latest`.

By hand, the same as the workflow does:

```bash
sed -Ei 's|(pleiades\.playground\.[a-z.]+):main$|\1:1.2.3|' margo/compose/compose.yaml
BART_REGISTRY_USER=... BART_REGISTRY_TOKEN=... bart push --dir margo --version 1.2.3
git checkout margo/compose/compose.yaml
```

Every pull request that changes `margo/` runs `bart validate` in the workflow "CI".

The three simulators share one image. bart rewrites them all to the copy of one of them; that is the same image
and changes nothing.

## Security

The app keeps the demo's settings: the MQTT broker accepts anonymous clients, the APIs have authorization
switched off, and the chat has no sign-in. Its own port answers on `127.0.0.1` of the device unless the setting
*Address of the example app* opens it, but Traefik serves the app to the whole network on the HTTP port, without
sign-in, and with a key set the chat spends that key. Install it only on a device in a network you control.

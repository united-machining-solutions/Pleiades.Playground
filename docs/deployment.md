# Deployment

How the demo stack runs on one computer and follows `main`. The repository builds nothing there: the workflow
[`deploy.yml`](../.github/workflows/deploy.yml) starts the stack with `docker compose` from the images that
[`images.yml`](../.github/workflows/images.yml) publishes.

The deployment is optional and off by default. Whoever only wants to see the demo needs none of this, see
[Start](../README.md#start).

## How it goes

1. A pull request is merged into `main`.
2. "Images" builds the seven images and tags them `main` and `sha-<commit>`.
3. "Deploy" runs after it on a runner of your own, on the computer that runs the stack. It checks out the
   commit, pulls the images tagged `sha-<commit>` and runs `docker compose up -d --no-build --wait`.

The stack keeps its data: the project name is fixed, so its volumes stay from one deployment to the next.

## What the computer needs

- Docker with Compose v2, and a way out to `ghcr.io` and `github.com` on port 443. Nothing has to reach the
  computer from outside.
- A [self-hosted runner](https://docs.github.com/actions/hosting-your-own-runners) of this repository with the
  label `pleiades-deploy`, run by a user who may use Docker.
- A folder for the settings that belong to the computer and not to the repository:

  | File | What it holds |
  |---|---|
  | `.env` | The settings of [`.env.example`](../.env.example): ports, `APP_BIND`, the address and the key of the LiteLLM gateway. It is never part of a commit. |
  | `compose.override.yaml` | Optional. What only this computer needs, for example the network of a reverse proxy. |

## What the repository needs

| Setting | Value |
|---|---|
| Variable `DEPLOY_ENABLED` | `true`. Any other value, or none, and "Deploy" does not run. |
| Variable `DEPLOY_DIR` | The folder above, as a path on the runner. |
| Environment `demo` | Deployment branches: `main` only. |

## Before you add a runner to a public repository

A runner of your own runs what a workflow tells it, with the rights of its user, and a user who may use Docker
may do anything on that computer. A pull request from a fork brings its own workflow files and can name the
runner in them. The protection of `main` does not help against that: nothing is merged.

- Set **Settings → Actions → General → Approval for running fork pull request workflows** to "Require
  approval for all external contributors". Then no workflow from outside runs before a maintainer has read it.
- Read the workflow files of a pull request from outside before you approve its run.
- Give the runner a computer that holds nothing else of value, or accept what shares it.

"Deploy" itself always runs the workflow file of `main`: it starts from the workflow "Images", not from a
pull request.

## By hand

The same as the workflow does, in the folder of a checkout:

```bash
PLEIADES_VERSION=main docker compose --env-file /path/to/.env up -d --no-build --wait
```

"Deploy" can also be started by hand, under Actions, for the newest commit of `main`.

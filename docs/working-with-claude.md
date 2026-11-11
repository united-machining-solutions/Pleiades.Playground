# Working with Claude

How to work on this repository with Claude Code. Most of it holds for any coding agent: the rules live in
[`AGENTS.md`](../AGENTS.md), and [`CLAUDE.md`](../CLAUDE.md) only imports them.

## Before you start

1. Install the tools from the [development setup](development-setup.md). The agent uses the same commands as
   you: `git`, `dotnet`, `docker compose` and `gh`.
2. Sign in to GitHub yourself: `gh auth login`. An agent does not type passwords or tokens, and you do not give
   it any.
3. Start Claude Code in the root of the repository, so that it reads `CLAUDE.md`:

   ```bash
   claude
   ```

## Give the agent the running stack

The two APIs and the generative UI backend offer their data as MCP tools. With the stack running, connect them
once:

```bash
claude mcp add --transport http pleiades-timeseries http://localhost:5500/mcp
claude mcp add --transport http pleiades-events http://localhost:5510/mcp
claude mcp add --transport http pleiades-genui http://localhost:5520/mcp
```

The agent can then answer questions from the data, for example "which notifications did machine P-04 raise in
the last hour, and what did the spindle do at that time?". The tools are listed in
[`contracts/mcp`](../contracts/mcp/README.md).

## How a change goes

1. **Say what you want and what done looks like.** Name the area (`source/…`, `apps/…`, a contract) and the check
   that proves it.
2. **Ask for a plan first** when the change touches a contract under `contracts/`, adds a service or spans
   several projects. Contracts change before code.
3. **One topic per branch and pull request.** The agent works on a branch, never on `main`.
4. **The agent verifies and says what it could not verify.** Build and tests for .NET, healthy containers for
   the stack. A claim without a check is a guess.
5. **You review and merge.** Read the diff, not only the summary. Pull requests are squashed.

## Commits and pull requests

- Every commit is signed off (`git commit -s`). The sign-off is yours: you certify the
  [DCO](../CONTRIBUTING.md#sign-your-work-dco) for the change, also when an agent wrote it.
- A commit an agent wrote carries a `Co-Authored-By` trailer that names the agent.
- The agent opens the pull request with `gh pr create` and fills in the template, including the line
  "Not verified".
- Commit, push and pull request happen only when you ask for them.

## Useful requests

| You want | Ask for |
|---|---|
| To see the demo | "Start the stack and show me what the simulator publishes for one machine." |
| A new value | "Add the topic `…` to the simulator and to the MQTT binding, with its SI unit." |
| To know why a check is red | "Why is pull request 12 red?" The agent reads `gh pr checks` and `gh run view --log-failed`. |
| A review before you ask a person | "Review the diff of this branch against `main` for correctness." |
| A decision recorded | "Write an ADR for this decision." |

## What stays with you

- Secrets. The demo needs none. The chat in the example app needs the key of a language model (`LLM_API_KEY` in
  `.env`): you set it yourself, and its value stays out of prompts, commits and logs.
- Publishing: merging, releasing, changing repository settings.
- The judgement whether a change is right. The agent is fast, and it can be wrong with confidence.

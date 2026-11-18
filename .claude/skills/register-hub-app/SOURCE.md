# Source of this skill

A copy of `.claude/skills/register-hub-app/SKILL.md` of the repository of the Pleiades Hub
(`umati/pleiades-hub`), unchanged. It was taken on 2026-11-18 together with version 0.1.2 of the SDK
`@pleiades/hub-sdk`, from the hub's commit `75e8162` on the branch
`feat/register-hub-app-skill`. Do not edit it here: a rule that is specific to this repository belongs in
[AGENTS.md](../../../AGENTS.md).

The skill holds no steps of its own. It leads to the guide that comes with the SDK,
`apps/app/node_modules/@pleiades/hub-sdk/register-an-app.md`, which is there after `pnpm install`. How the
tarball of the SDK got here is in [vendor/README.md](../../../vendor/README.md); the decision is
[ADR-0021](../../../docs/adr/0021-hub-registration.md).

Refresh the skill with every new tarball of the SDK, and change the version and the commit above.

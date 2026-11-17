---
name: add-brand
description: Gives the user interface a look of your own - colours, corners, font and logo - as a brand of the switch in packages/ui/brands. Use when a person wants their own design, styling, theme, brand colours or logo in the example app, or brings a DESIGN.md.
---

# Add a brand

A brand is a look for the whole user interface, put on by the switch at the top of the sidebar. It is one
folder: a `DESIGN.md` that says what the brand is, and a block of theme tokens written from it. No component
changes. What a brand may set, and how one is added:
[`packages/ui/brands/README.md`](../../../packages/ui/brands/README.md). Read it first; `example/` next to it
is the folder to copy.

If the person wants more than colours, corners, a font and a logo (other buttons, another height of the
fields, a dark theme), this is the wrong recipe. That is a design system of their own, in their own copy of
the repository, and the skill `shadcn` has the steps: `.claude/skills/shadcn/design-system.md`. Say so before
you build.

## Ask

If the person has a `DESIGN.md`, take it as it is. If not, ask once:

> What does your brand look like? Its main colour, its font, how round its corners are, and a logo if you
> have one.

Then stop asking. Choose the rest (the surfaces, the lines, the quiet text) to go with the main colour, and
write what you chose into the `DESIGN.md`, so that the person can correct it.

## You touch

- `packages/ui/brands/<id>/`: new. `DESIGN.md`, `theme.css`, and `logo.svg` if there is a logo.
- `packages/ui/brands/brands.css` and `packages/ui/brands/brands.ts`: one line each.
- `pnpm-workspace.yaml` and `packages/ui/package.json`, only for a font the browser does not have.

Nothing else: no file under `packages/ui/src/`, and no stylesheet of an application.

## Steps

Follow "A new brand" in the README. Three things are easy to get wrong:

1. The one rule of `theme.css` is `:root[data-brand="<id>"]`, with the name of the folder as the id.
2. A brand sets no colour that carries a meaning: not the colour of an error, of a chart or of a state of a
   machine. A main colour that is a green, a red or a yellow will stand next to the state colours. Say so,
   and keep it on the actions.
3. Text needs a contrast of 4.5:1 on its surface. If white text does not hold on the main colour, darken the
   colour until it does, and say that you did.

## Check

```bash
pnpm --filter @pleiades/ui test              # the brand is one rule, in both lists, and sets only what it may
pnpm typecheck
pnpm --filter @pleiades/design-system dev    # http://localhost:3100/: choose the brand at the top
```

On the design system page, "Color roles" shows every pair of text and surface with the contrast it measures
under the brand. Then go down the page once: every component, in every state. In the example app the switch
at the top of the sidebar shows the logo.

## Hand over

Say which values came from the person and which you chose, name every pair under 4.5:1, and name what the
brand asked for that a brand cannot do. Do not put a name into the repository that is not the person's to
publish.

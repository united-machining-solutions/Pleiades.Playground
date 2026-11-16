# The brands

A brand is a look for the whole user interface: its colours, its corners, its font, its logo. The
[theme](../src/styles/globals.css) stays one theme. A brand is a block of its tokens that holds while
`<html>` carries `data-brand="<id>"`, and the switch sets that one attribute and nothing else. Why it is
built this way: [ADR-0011](../../../docs/adr/0011-a-brand-is-a-block-of-theme-tokens.md).

The example application has the switch at the top of its sidebar, and the
[design system](../../../apps/design-system/README.md) has the same choice at the top of its page. The choice is
remembered in the browser. With no brand in this folder there is nothing to choose, and neither shows a switch.

## What is where

- `<id>/DESIGN.md`: the brand in words and values, for people and for coding agents. It is the source: the
  two files next to it are written from it.
- `<id>/theme.css`: one rule, `:root[data-brand="<id>"]`, that sets tokens of the theme.
- `<id>/logo.svg`: the logo, drawn 32 pixels high at the top of the sidebar. Optional: without one the switch
  shows the name.
- `brands.css`: imports the `theme.css` of every brand. A page that offers the switch imports it after the
  theme: `@import "@pleiades/ui/brands.css"`.
- `brands.ts`: the list of the brands, and the three functions of the switch, `useBrand`, `setBrand` and
  `currentBrand`. A page the server sends puts `brandScript` into its head, so that the brand of the last
  visit is on from the first frame (the app does, in `routes/__root.tsx`). Import it as `@pleiades/ui/brands`.
- `example/`: a brand that is not a company. It shows what a brand is, and it is the folder to copy.

## What a brand may set

| A brand sets | Tokens |
|---|---|
| The page and the text on it | `--background`, `--foreground` |
| Cards, menus and dialogs | `--card`, `--popover`, each with its `-foreground` |
| The actions | `--primary`, `--secondary`, each with its `-foreground` |
| Quiet surfaces and the highlight in a menu | `--muted`, `--accent`, each with its `-foreground` |
| Lines and the focus ring | `--border`, `--input`, `--ring` |
| The sidebar | `--sidebar`, `--sidebar-primary`, `--sidebar-accent`, each with its `-foreground`, `--sidebar-border`, `--sidebar-ring` |
| The corners | `--radius` |
| The font | `--font-sans` |

A brand sets nothing else, and `src/brands.test.ts` fails if one does:

- **No colour that carries a meaning.** The colour of an error (`--destructive`), of a chart and of a state of
  a machine say the same in every brand. A brand whose colour is close to a state colour keeps it away from
  the states: an orange button next to a yellow warning is a thing to look at on the design system page.
- **No dark theme.** The user interface is light only.
- **No shadows.** Tailwind writes the shadow into the class, so no token reaches it.
- **Nothing in a component.** A brand never edits a file under `src/components/`. A brand that needs another
  height of the buttons or another shape of a card is no longer a brand of this switch: it is a copy of the
  repository with a design system of its own, and the shadcn skill has the steps for that
  ([`design-system.md`](../../../.claude/skills/shadcn/design-system.md)).

A card that `genui-mcp` serves to another host wears no brand: its file is built once, and the host has no
switch. In the example application the same card is drawn by the page and wears the brand of the page.

## A new brand

A coding agent takes the skill `add-brand` (`.claude/skills/add-brand/SKILL.md`), which leads here.

1. Copy `example/` to a folder with the id of the brand: lower case, digits and hyphens.
2. Write its `DESIGN.md`: the colours with their values, the font, the radius, and the rules that are easy to
   break. If the brand has one already, put it there as it is.
3. Write `theme.css` from it. Its one rule is `:root[data-brand="<id>"]`. The table "Role mapping" of the
   shadcn skill says which colour of a DESIGN.md is which token
   ([`design-system.md`](../../../.claude/skills/shadcn/design-system.md), steps 3 and 4; step 5 edits
   components and is not for a brand). Keep the values as the DESIGN.md gives them.
4. A font the browser does not have comes from a package of [Fontsource](https://fontsource.org): add it to
   the `catalog`, and import it in the first line of `theme.css`. Most brand fonts are licensed, so take the
   substitute the DESIGN.md names.
5. Add the line for it to `brands.css` and to the list in `brands.ts`.
6. Look at it: `pnpm --filter @pleiades/design-system dev`, <http://localhost:3100/>, and choose the brand at
   the top. "Color roles" shows every pair of text and surface with the contrast it measures under the brand:
   text of body size needs 4.5:1. Then go down the page: every component, in every state.

```bash
pnpm --filter @pleiades/ui test    # the brand is one rule, in both lists, and sets only what it may
```

Do not put a name into this repository that is not yours to publish. The brand of a company lives in that
company's copy of the repository.

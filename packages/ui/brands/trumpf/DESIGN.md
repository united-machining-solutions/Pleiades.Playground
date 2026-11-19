---
name: TRUMPF
description: The TRUMPF UX UI Community design system (UIC), as far as a brand of the switch reaches. Taken from the skill "responsive-styleguide-design", version 5.
colors:
  content-background: "#fafafa"
  text-primary: "#000000"
  surface: "#ffffff"
  blue4: "#285172"
  on-blue4: "#ffffff"
  grey1: "#e7ecf0"
  surface-raised: "#f3f6f8"
  text-secondary: "#5e5e5e"
  active-tint: "#f3fafd"
  border-subtle: "#d5dde3"
  grey2: "#a1a1a1"
  blue2: "#51a7eb"
typography:
  body:
    fontFamily: '"Open Sans", sans-serif'
rounded:
  base: 0
---

# TRUMPF

## Overview

The software of TRUMPF follows the UX UI Community design system (UIC). Its rules for a brand: dark
machine blue for the one action, square corners on every surface, Open Sans, and a dark navy main
navigation. The values come from the UIC tokens (`references/tokens.css`, `components.md`) of the skill
"responsive-styleguide-design", version 5.

## Colors

- **Content background** `#fafafa` (`fill-content-background`): the page. **Surface** `#ffffff`: cards,
  menus and dialogs.
- **Text primary** `#000000` (`text-primary`): all text. **Text secondary** `#5e5e5e`: descriptions and
  captions.
- **Blue4** `#285172` (`tr-blue4`, `fill-primary`), with white text: the primary content button, the one
  action of a view.
- **Grey1** `#e7ecf0` (`tr-grey1`), with blue4 text: every other filled button, the tag, and the item
  under the pointer or the keyboard in a menu.
- **Surface raised** `#f3f6f8` (`fill-highlighted-neutral-opaque`): quiet surfaces, a skeleton, the track of
  a tab list.
- **Active tint** `#f3fafd`: in the UIC the highlight under the pointer in a menu (General States,
  active). This brand does not use it, see below.
- **Border subtle** `#d5dde3`: lines and dividers. **Grey2** `#a1a1a1` (`border-default`): the outline of a
  field.
- **Blue2** `#51a7eb` (`tr-blue2`): the focus ring. The UIC uses it for hover, focus and selected borders,
  never as a fill.
- **The sidebars** are white, as the sub navigation and the content area of the UIC: text primary on
  surface, the active page in grey1 with blue4 text, blue4 for what is primary in them, border subtle as
  their line.

Pairs of text on their surface: white on blue4 8.4:1, blue4 on grey1 7.0:1, text secondary on surface
raised 6.0:1. All reach 4.5:1. The
outline of a field, grey2 on white, reaches 2.6:1, under the 3:1 a line that marks a control should have:
it is the value of the UIC, kept as it is.

What was chosen here and is not a UIC value: the accent, the mark of the item under the pointer or the
keyboard in a menu, a select or a combobox, is grey1, not the active tint. The active tint on the white of a
menu is 1.06:1, and the marked item could not be told from the others. The UIC states the hover text of a
General State as `tr-blue3` `#177ac9`; on grey1 it reaches only 3.8:1, so the accent text is blue4.

## Typography

Open Sans only, Regular 400, Semibold 600 and Bold 700. The brand brings it as the variable font of
Fontsource.

## Shapes

`border-radius: 0` on every surface: buttons, fields, cards, dialogs, tags. The UIC rounds only the thumb of
a switch and an avatar.

## Do's and Don'ts

- Do keep blue4 for the one primary button of a view.
- Don't use blue2 as a fill. It is the colour of a border in hover and of the focus ring.
- Don't change the colours of the states of a machine. The UIC has its own status colours (green1
  `#348e30`, light orange `#f27b26`, red1 `#ff1e00`); in this repository the states keep the colours of the
  card catalogue in every brand.

## Known Gaps

What the UIC asks for and a brand of the switch cannot do:

- The heights of the controls: `--uic-dim-height` 48 / 40 / 30 px by breakpoint, and the touch areas of
  13 × 13 mm. The components keep their own heights.
- The shadows of the UIC (`--uic-button-shadow`, `--uic-tile-box-shadow`, ...): a brand sets no shadow.
- The status colours of the UIC for running, warning and alarm, and the status tags.
- A secondary button that is white with a grey2 border: the buttons keep their variants.
- The main navigation in blue5 `#142939` with white text. It was tried on the sidebar and taken back: the
  chat panel is a sidebar too, and it and the build badge at the foot of the sidebar draw text in the
  colours of the page, which a dark sidebar makes unreadable.
- The App Header in blue5 (68 px) and the footer in blue4 (64 px): the layout is the app's.
- A logo: there is none here.

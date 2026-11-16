---
name: Example
description: A made-up machine builder. It is here to show what a brand is and how one is added.
colors:
  canvas: "#faf8f5"
  ink: "#1c1917"
  surface: "#ffffff"
  primary: "#b3410e"
  on-primary: "#ffffff"
  secondary: "#efebe4"
  soft-band: "#f2efe9"
  ink-muted: "#5c5651"
  wash: "#f2e6dc"
  on-wash: "#6b2607"
  hairline: "#e0dbd3"
  rail: "#f2efe9"
  rail-highlight: "#e6e0d6"
typography:
  body:
    fontFamily: system-ui, "Segoe UI", sans-serif
rounded:
  base: 2px
---

# Example

## Overview

Example is not a company. It is the brand this repository ships to show the switch: warm paper, one rust
orange, square corners, the font of the operating system. Copy the folder to start a brand of your own.

## Colors

- **Canvas** `#faf8f5`: the page. **Surface** `#ffffff`: cards, menus and dialogs lie on it, one step lighter.
- **Ink** `#1c1917`: all text. **Ink muted** `#5c5651`: descriptions and captions.
- **Primary** `#b3410e`, with **on primary** `#ffffff`: the one action of a view, and the focus ring.
- **Secondary** `#efebe4`: every other button.
- **Soft band** `#f2efe9`: quiet surfaces, such as a skeleton or the track of a tab list.
- **Wash** `#f2e6dc`, with **on wash** `#6b2607`: the highlight under the pointer in a menu.
- **Hairline** `#e0dbd3`: every border, and the outline of a field.
- **Rail** `#f2efe9`: the sidebar. **Rail highlight** `#e6e0d6`: its active page.

Every pair of text on its surface reaches 4.5:1. The lowest is the muted ink on the rail highlight, at 5.5:1.

## Typography

One family, the font of the operating system, in every size. The brand ships no font file.

## Shapes

One radius, 2px, on everything: square, with the edge just broken.

## Do's and Don'ts

- Do keep the orange for the one action of a view. Two primary buttons side by side are one too many.
- Don't use the orange for a state of a machine. Running, stopped, warning and alarm have colours of their
  own, the same in every brand, and no brand changes them.
- Don't round a corner more than the radius. A pill is not part of this brand.

## Known Gaps

- No dark surfaces: the user interface is light only.
- No shadows of its own. It keeps the ones of the components.
- No logo beyond the wordmark in `logo.svg`.

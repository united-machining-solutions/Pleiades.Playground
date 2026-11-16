---
title: "A brand is a block of theme tokens, switched by one attribute"
status: proposed
date: 2026-11-16
---

# ADR-0011: A brand is a block of theme tokens, switched by one attribute

## Context

Everyone who shows the example application wants it in the look of their own company. shadcn/ui, the design
system of this repository ([ADR-0009](0009-shadcn-components-in-one-package.md)), has an answer for one look
in one build: a preset (`shadcn apply`), a theme in a registry, or the steps of its skill that restyle a
project from a `DESIGN.md`. Those steps end in the source of the components: the variants of a button, the
height of a field. Its docs know one switch while the page runs, between a light and a dark theme.

A demo needs several looks in one running application, and a person who can change between them.

## Decision

- A brand is a folder under `packages/ui/brands/`: a `DESIGN.md` that says what the brand is, and a
  `theme.css` written from it, one rule under `:root[data-brand="<id>"]` that sets tokens of the theme.
- The switch sets the attribute `data-brand` on `<html>`, and nothing else. The example application has it
  at the top of its sidebar, the design system at the top of its page.
- A brand sets the colour roles, the radius and the font. It does not set a colour that carries a meaning
  (an error, a chart, a state of a machine), and it does not edit a component. A test holds a brand to this.
- The repository ships the switch and one brand that is not a company, `example`.

## Consequences

- A brand costs one folder and two lines, and no component changes with it.
- What a token cannot reach, a brand cannot change: the height of a control, the shape of a card, a shadow.
  A brand that needs those is a copy of the repository with a design system of its own.
- A card that `genui-mcp` serves to another host wears no brand: the file is built once. The same card in
  the example application wears the brand of the page.
- The font of a page is no longer written into the class (`@theme` instead of `@theme inline` in the
  stylesheets of the two applications), so that a brand can set it.
- The design system page is where a brand is checked: it measures the contrast of every colour role under
  the brand that is on.

## Alternatives considered

- **A build for each brand, with `shadcn apply` or the steps of the skill.** The whole range of a design
  system, but nothing to switch in a running demo, and every brand is a branch that drifts from the others.
- **A free choice of an accent and a surface colour.** A person can mix a look that no company has and that
  nobody checked for contrast. A brand is a closed list of values.
- **A class for each brand, as for the dark theme (`.dark`).** Works the same. An attribute holds one value,
  so two brands can never be on at once.

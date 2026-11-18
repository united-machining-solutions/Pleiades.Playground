# Architecture Decision Records

Short records of decisions that shape the repository, in abbreviated MADR form
(Context, Decision, Consequences, Alternatives considered).

- Numbering starts at `0001`, increases monotonically and is never reused. Files are `NNNN-kebab-title.md`.
- Write one at a design fork: layout, contracts, tooling, licence. Not for day-to-day edits.
- A proposal stays `proposed` until the maintainers accept it.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-monorepo-layout.md) | Monorepo layout: `source/`, `apps/`, `packages/`, `contracts/` | accepted |
| [0002](0002-si-units-joule-and-one.md) | SI units on the wire: energy in joule, fractions in `one` | accepted, amended by 0017 |
| [0003](0003-naming.md) | Names: `Pleiades.Playground.<Area>.<Part>` | accepted |
| [0004](0004-licence-and-contributions.md) | Apache-2.0, CC BY 4.0 and DCO | accepted |
| [0005](0005-data-model-as-submodule.md) | The data model is a submodule, the binding is ours | superseded by 0006 |
| [0006](0006-data-model-by-reference.md) | The data model is referenced by a pinned commit, not a submodule | accepted |
| [0007](0007-generative-ui-in-typescript.md) | Generative UI in TypeScript: a backend for displays, a card catalogue and the harness in the example app | proposed |
| [0008](0008-route-tree-is-written-not-committed.md) | The route tree of the example app is written, not committed | proposed |
| [0009](0009-shadcn-components-in-one-package.md) | The shadcn/ui components live in one package, `packages/ui` | proposed |
| [0010](0010-language-models-through-one-gateway.md) | The chat takes its language models from a LiteLLM gateway | proposed |
| [0011](0011-a-brand-is-a-block-of-theme-tokens.md) | A brand is a block of theme tokens, switched by one attribute | proposed |
| [0012](0012-headless-ultimaker-tool-service.md) | Headless Ultimaker 3 slicing and explicit print operations | proposed |
| [0013](0013-live-values-from-the-broker.md) | Live values reach the browser from the broker | proposed |
| [0014](0014-a-page-from-the-chat-is-a-recipe-kept-in-the-browser.md) | A page from the chat is a recipe, kept in the browser | proposed |
| [0015](0015-the-binding-of-machines-follows-the-data-model.md) | The tree of machines on the broker follows the data model exactly | proposed |
| [0016](0016-blazor-for-the-page-of-a-dotnet-service.md) | A .NET service draws its own page with Blazor (an exception for the cutting simulator only) | rejected |
| [0017](0017-the-words-of-a-tool-result-are-a-display.md) | The words of a tool result may name the unit people use | proposed |
| [0018](0018-a-showcase-is-built-in-on-request-and-only-adds.md) | A showcase is built in on request and only adds | proposed |
| [0019](0019-documentation-sources-in-chat.md) | Documentation sources and original PDFs in chat through MCP | proposed |
| [0020](0020-the-language-model-composes-a-page-and-nothing-else.md) | The language model composes a page, and nothing else | proposed |

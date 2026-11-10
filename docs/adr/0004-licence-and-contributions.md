---
title: "Apache-2.0, CC BY 4.0 and DCO"
status: accepted
date: 2026-11-10
---

# ADR-0004: Licence and contributions

## Decision

- Code, configuration and contracts: Apache License 2.0.
- Documentation and demo content: Creative Commons Attribution 4.0.
- Contributions: Developer Certificate of Origin 1.1, a `Signed-off-by` line per commit. No contributor
  licence agreement.

## Why

Apache-2.0 carries an explicit patent licence that ends for anyone who sues over the work, which protects every
contributing company in the same way. It is compatible with MIT-licensed dependencies. A sign-off needs no legal
paperwork and can be explained in a minute.

## Alternatives considered

MIT (shorter, no patent clause), EPL-2.0 (weak copyleft, natural for Eclipse projects), MPL-2.0 (file-level
copyleft).

# Security

This is a playground and not meant for production. We still want to know about vulnerabilities.

## Reporting

Please do not open a public issue. Use **Security → Report a vulnerability** on the GitHub page of this
repository (private vulnerability reporting). Include the affected service, the version or commit and steps to
reproduce. You will get an answer from a maintainer.

## Scope

- Services, libraries and configuration in this repository.
- Not in scope: third-party images referenced by `compose.yaml`; report those upstream.

## Demo defaults

The demo stack favours a quick start: the broker accepts anonymous clients and the APIs run with authorization
switched off. Do not expose it to a network you do not control. Authorization (JWT and internal API key) is
implemented in the services and can be enabled by configuration.

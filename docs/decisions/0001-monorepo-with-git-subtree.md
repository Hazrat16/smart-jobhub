# 1. Monorepo built with git subtree

- **Status:** accepted
- **Date:** 2026-09

## Context

The API and the web app lived in two repos with their own history, CI and deploy scripts. Infrastructure
had to be added and shared by both.

## Decision

One repo: `apps/api`, `apps/web`, `infra/`. Both apps were imported with `git subtree`, so their full
history is kept. There are no npm workspaces; each app keeps its own `package-lock.json`, and CI jobs run
inside the app folder. Path filtering happens inside each workflow (`dorny/paths-filter`), and each
workflow ends with a gate job (`api-ci`, `web-ci`, `infra-ci`) that always reports.

## Consequences

- One PR can change the API, the web app and the infra together.
- Required checks never hang on "pending" for PRs that don't touch an app.
- No shared `node_modules`: installs stay simple, but shared code would need a package later.

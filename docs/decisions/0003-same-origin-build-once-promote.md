# 3. Same origin; build once, promote the same image

- **Status:** accepted
- **Date:** 2026-09

## Context

The web app used to bake `NEXT_PUBLIC_API_URL` (and before that, `VITE_*` values) into the build, so each
environment needed its own image, and the image tested on staging wasn't the one shipped to prod.

## Decision

The browser only calls same-origin `/api` and `/socket.io`, and the ALB routes them. The web image
contains nothing environment-specific: environment config lives in the ECS task definition. Images are
built once, tagged with the version (`api-v12`), and the same tag is promoted to prod.

## Consequences

- Staging tests the exact bytes prod runs.
- No CORS between web and api in deployed environments.
- Local dev keeps a Next.js rewrite to `127.0.0.1:5000` (dev only).

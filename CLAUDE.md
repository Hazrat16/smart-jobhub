# Job Platform monorepo

- `apps/api` — Express 5 + Socket.IO + BullMQ backend (TypeScript, MongoDB, Redis). Imported with git subtree.
- `apps/web` — Next.js 15 frontend. Imported with git subtree.
- `infra/` — Terraform for AWS (ap-south-1). Not built yet.

**Read [PLAN.md](PLAN.md) before starting work.** It holds the agreed architecture, the decisions already made,
the known issues and the rollout checklist. Tick checklist items in PLAN.md as they are completed.

Each app keeps its own `package-lock.json`. There are no npm workspaces, so run npm commands inside the app folder.

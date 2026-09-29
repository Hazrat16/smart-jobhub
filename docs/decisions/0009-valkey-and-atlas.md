# 9. ElastiCache Valkey; Atlas set up by hand

- **Status:** accepted
- **Date:** 2026-09

## Context

Redis backs the Socket.IO adapter, rate limits, cache and the BullMQ email queue. MongoDB holds all
real data.

## Decision

- **Redis:** ElastiCache Valkey `cache.t4g.micro`, one per environment, inside the VPC, with TLS and a
  generated AUTH token, `maxmemory-policy noeviction` (BullMQ requires it). Terraform writes `REDIS_URL`
  to its own secret. Upstash was rejected because per-command pricing is a poor fit for BullMQ's polling.
- **MongoDB:** Atlas in AWS Mumbai, one project per environment (M0 staging, Flex prod with daily
  snapshots). Set up by hand from `infra/DATA.md`: the Atlas Terraform provider would need a
  long-lived Atlas API key in CI for resources created once.

## Consequences

- Everything in Valkey can be rebuilt; losing the node loses only queued emails.
- A Valkey memory alarm at 80%, because at 100% `noeviction` makes writes fail.
- Restores are tested quarterly (`docs/restore-drill.md`).

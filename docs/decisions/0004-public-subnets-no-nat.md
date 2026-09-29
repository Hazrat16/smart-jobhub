# 4. Public subnets, no NAT gateway

- **Status:** accepted
- **Date:** 2026-09

## Context

Tasks need outbound internet (Atlas, ECR, Secrets Manager, Resend, Cloudinary, SSLCommerz). A NAT gateway
costs about $35/month per AZ plus data processing. That's more than the rest of staging combined.

## Decision

Tasks run in public subnets with a public IP. Their security groups allow ingress **only** from the ALB's
security group; Valkey allows only the api tasks' security group.

## Consequences

- Saves about $35–70/month per environment.
- There's no stable egress IP, so the Atlas IP access list is `0.0.0.0/0`. That's mitigated by TLS-only,
  per-environment users and long passwords. The upgrade path is M10+ with PrivateLink, or a NAT with an
  Elastic IP.
- Each task's public IPv4 costs about $3.60/month.

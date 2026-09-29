# 2. ECS Fargate behind one ALB

- **Status:** accepted
- **Date:** 2026-09

## Context

Two small Node services (Express + Socket.IO API, Next.js web) need HTTPS, WebSockets, zero-downtime
deploys and rollback, on a budget of about $70–110/month for two environments. Region: ap-south-1, the
closest to Bangladesh.

## Decision

ECS on Fargate with one ALB per environment and path rules: `/api/*` and `/socket.io/*` go to the api,
everything else to web. The api target group has sticky sessions for Socket.IO's polling transport;
the Redis adapter delivers events across tasks. Services use the deployment circuit breaker with rollback.

Rejected: **EKS** (the control plane alone costs about $73/month, and running Kubernetes is too much for two
services); **App Runner** (weaker WebSocket and VPC story, less control); **EC2 + Docker Compose**
(patching, and no rolling deploys).

## Consequences

- No servers to patch; deploys are task definition revisions.
- The ALB is the largest fixed cost (about $18/month per environment).
- Staging runs on FARGATE_SPOT; prod on-demand with CPU autoscaling.

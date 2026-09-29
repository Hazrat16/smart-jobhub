# 8. Remove RabbitMQ from chat

- **Status:** accepted
- **Date:** 2026-09

## Context

Chat published every event to RabbitMQ, but messages and read state were already saved directly to
MongoDB, and the consumers only logged or repeated those writes. Without a broker, every typing event
tried to reconnect, flooding logs and Sentry. Amazon MQ or CloudAMQP would have cost about $20–30/month.

## Decision

Delete the broker. Chat writes to MongoDB, then delivers live over Socket.IO: `sendToUser` emits to
the `user:<id>` room through the Redis adapter, and presence uses `fetchSockets()` across tasks.

## Consequences

- One less service to run, pay for and secure.
- Fixed a real bug: live delivery and online-users only saw sockets on the same task.
  `tests/chatRealtime.test.ts` runs two Socket.IO servers on one Redis to prove it.

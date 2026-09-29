# Chat service

Real-time one-to-one chat on Socket.IO, stored in MongoDB. Every write (send, mark read, edit, delete)
goes to MongoDB first. Live delivery over Socket.IO happens after that write and is best-effort: a
client that was offline gets the message from the REST history.

## How it fits together

```
browser ──HTTPS──► ALB ──/api/*──────► api task(s) ──► MongoDB (messages, conversations)
        ──WSS────►     ──/socket.io/*─►      │
                                             └──► Redis (Socket.IO adapter: fan-out between tasks)
```

- **One code path for sends.** The REST `POST /api/chat/send` and the `send_message` socket event both
  call `chatService.sendMessage`, which saves the message, updates the conversation's unread count,
  then emits `new_message` to the receiver.
- **Delivery works across tasks.** Each socket joins a personal room `user:<id>`. `sendToUser` emits to
  that room, and with `REDIS_URL` set the Redis adapter delivers it on whichever API task the receiver
  is connected to, for every tab they have open.
- **Presence.** `GET /api/chat/online-users` uses `io.fetchSockets()`, which asks every task through
  the adapter.
- **Without Redis** (local dev), everything runs in one process with the default in-memory adapter.
- There's no message broker. An earlier version published every event to RabbitMQ, but its consumers
  only logged or repeated writes already made here, so it was removed.

## Files

```
src/chat/chatController.ts     REST handlers (thin; logic lives in services/chatService.ts)
src/chat/websocketService.ts   Socket.IO server: JWT auth, rooms, events, Redis adapter
src/chat/websocketRegistry.ts  Holds the single WebSocketService instance
src/chat/testClient.html       Manual test page
src/services/chatService.ts    Send, read, edit, delete, search, presence
src/models/chatModel.ts        ChatMessage schema
src/models/conversationModel.ts Conversation schema (participants, lastMessage, unread counts)
```

## REST endpoints (`/api/chat`, JWT required)

| Method | Path | What it does |
|---|---|---|
| POST | `/send` | Send a message `{ receiverId, message, messageType?, attachments?, replyTo? }` |
| GET | `/conversations` | The caller's conversations |
| GET | `/conversation/:userId` | Conversation with a user (created if missing) and its messages |
| GET | `/conversation/:conversationId/messages` | Paginated history |
| GET | `/search?query=` | Search the caller's messages (matched literally, not as a regex) |
| POST | `/mark-read` | `{ senderId, conversationId? }` marks that sender's messages as read |
| PUT | `/message/:messageId` | Edit your own message |
| DELETE | `/message/:messageId` | Delete your own message |
| GET | `/online-users` | User IDs with an open socket on any task |

## Socket.IO

Connect with the JWT as `auth: { token }` (or an `Authorization: Bearer` header).

**Client → server:** `send_message`, `typing_start` / `typing_stop` (`{ conversationId }`),
`mark_read` (`{ senderId, conversationId? }`), `join_conversation` / `leave_conversation`
(`{ conversationId }`).

**Server → client:** `new_message`, `message_sent` (ack to the sender), `user_typing`, `messages_read`,
`conversations_loaded` (on connect), `user_status_change`, `error`.

## Config

| Variable | Needed | Notes |
|---|---|---|
| `MONGODB_URI` | yes | |
| `JWT_SECRET` | yes | Same secret as the REST API |
| `REDIS_URL` | for more than one task | Enables the Socket.IO Redis adapter |
| `CORS_ALLOWED_ORIGINS` | in prod | Same allowlist as Express |

Behind the ALB the target group uses sticky sessions, so Socket.IO's long-polling fallback keeps
hitting the same task.

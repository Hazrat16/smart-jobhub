import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";
import request from "supertest";
import { setupTestApp, teardownTestApp } from "./helpers/testApp.js";

/**
 * Two WebSocketService instances sharing one Redis adapter stand in for two
 * API tasks behind the ALB. Needs a disposable Redis at TEST_REDIS_URL, e.g.
 *   docker run -d -p 6399:6379 redis:7-alpine
 * and is skipped without it.
 */
const TEST_REDIS_URL = process.env["TEST_REDIS_URL"];
const skip = TEST_REDIS_URL ? false : "TEST_REDIS_URL not set";

let app: Awaited<ReturnType<typeof setupTestApp>>["app"];
let mongoose: Awaited<ReturnType<typeof setupTestApp>>["mongoose"];
let stopBackgroundJobs: () => void;

type WsService = import("../src/chat/websocketService.js").WebSocketService;
const servers: { http: Server; ws: WsService }[] = [];
const clients: ClientSocket[] = [];

let tokenA: string;
let tokenB: string;
let userAId: string;
let userBId: string;

async function startTask(): Promise<{ http: Server; ws: WsService; url: string }> {
  const { WebSocketService } = await import("../src/chat/websocketService.js");
  const http = createServer();
  // The adapter reads REDIS_URL at construction. It is set only for this call,
  // so the rest of the app (cache, rate limiter) keeps its in-process fallback.
  process.env["REDIS_URL"] = TEST_REDIS_URL;
  const ws = new WebSocketService(http);
  delete process.env["REDIS_URL"];
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  servers.push({ http, ws });
  return { http, ws, url: `http://127.0.0.1:${(http.address() as AddressInfo).port}` };
}

function connect(url: string, token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = connectClient(url, { auth: { token }, transports: ["websocket"], reconnection: false });
    clients.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function nextEvent<T>(socket: ClientSocket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

before(async () => {
  if (skip) return;
  ({ app, mongoose, stopBackgroundJobs } = await setupTestApp("job-platform-test-chat-realtime"));

  const User = (await import("../src/models/userModel.js")).default;
  const passwordHash = await bcrypt.hash("password123", 12);
  const userA = await User.create({
    name: "Realtime Alice",
    email: "rt-alice@test.local",
    password: passwordHash,
    role: "jobseeker",
    isVerified: true,
  });
  const userB = await User.create({
    name: "Realtime Bob",
    email: "rt-bob@test.local",
    password: passwordHash,
    role: "employer",
    isVerified: true,
  });
  userAId = String(userA._id);
  userBId = String(userB._id);

  const loginAs = async (email: string) => {
    const res = await request(app).post("/api/auth/login").send({ email, password: "password123" });
    assert.equal(res.status, 200, `login failed for ${email}`);
    return res.body.data.token as string;
  };
  tokenA = await loginAs("rt-alice@test.local");
  tokenB = await loginAs("rt-bob@test.local");
});

after(async () => {
  if (skip) return;
  for (const c of clients) c.disconnect();
  const { clearWebSocketService } = await import("../src/chat/websocketRegistry.js");
  clearWebSocketService();
  for (const { ws } of servers) await ws.close();
  await teardownTestApp(mongoose, stopBackgroundJobs);
});

test("a message sent through task 1 reaches the receiver connected to task 2", { skip }, async () => {
  const { setWebSocketService } = await import("../src/chat/websocketRegistry.js");
  const task1 = await startTask();
  const task2 = await startTask();
  // The REST app delivers through the registered instance, i.e. "task 1".
  setWebSocketService(task1.ws);

  const bob = await connect(task2.url, tokenB);
  // Let the adapter's subscriptions settle before publishing.
  await new Promise((r) => setTimeout(r, 300));

  const received = nextEvent<{ senderId: string; message: string }>(bob, "new_message");
  const res = await request(app)
    .post("/api/chat/send")
    .set("Authorization", `Bearer ${tokenA}`)
    .send({ receiverId: userBId, message: "hello across tasks" });
  assert.equal(res.status, 200);

  const msg = await received;
  assert.equal(msg.senderId, userAId);
  assert.equal(msg.message, "hello across tasks");
});

test("online-users on task 1 sees a user connected only to task 2", { skip }, async () => {
  const res = await request(app).get("/api/chat/online-users").set("Authorization", `Bearer ${tokenA}`);
  assert.equal(res.status, 200);
  assert.ok(
    (res.body.data.onlineUsers as string[]).includes(userBId),
    `expected ${userBId} in ${JSON.stringify(res.body.data.onlineUsers)}`,
  );
});

import { getAuthToken } from "@/utils/api";
import { io, Socket } from "socket.io-client";

/**
 * The REST API can go through Next's /api rewrite proxy (same-origin), but a
 * WebSocket connection can't — it needs the backend's real origin directly.
 * In dev it falls back to the local backend port. In deployed environments the
 * ALB routes /socket.io/* to the API on the same origin, so it uses the page's
 * own origin. Set NEXT_PUBLIC_SOCKET_URL only when frontend and backend are on
 * different origins.
 */
function resolveSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL;
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/?$/, "");
  }
  if (process.env.NODE_ENV === "development") {
    return "http://127.0.0.1:5000";
  }
  return window.location.origin;
}

let socket: Socket | null = null;

/** Lazily creates (or reuses) the single shared Socket.IO connection for this tab. */
export function getSocket(): Socket | null {
  const token = getAuthToken();
  if (!token) return null;

  if (socket && socket.connected) return socket;

  if (!socket) {
    socket = io(resolveSocketUrl(), {
      auth: { token },
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
    });
  } else if (!socket.connected) {
    socket.auth = { token };
    socket.connect();
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

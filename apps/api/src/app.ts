import express from "express";
import cors from "cors";
import helmet from "helmet";
import { getAllowedOrigins } from "./config/corsOrigins.js";
import applicationRoutes from "./routes/applicationRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import savedJobRoutes from "./routes/savedJobRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import resumeFitRoutes from "./routes/resumeFitRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import companyRoutes from "./routes/companyRoutes.js";
import uploadRoute from "./routes/uploadRoute.js";
import adminRoutes from "./routes/adminRoutes.js";
import externalJobRoutes from "./routes/externalJobRoutes.js";
import remoteJobRoutes from "./routes/remoteJobRoutes.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import { requestContext } from "./middlewares/requestContext.js";
import { sanitizeInput } from "./middlewares/sanitizeInput.js";
import {
  queueJobClosingSoonNotifications,
  startNotificationWorker,
  stopNotificationWorker,
} from "./services/notificationService.js";
import mongoose from "mongoose";
import { logError, logInfo } from "./utils/logger.js";
import { HttpError } from "./utils/http.js";
import { snapshotMetrics, trackHttp } from "./utils/metrics.js";
import { pingRedis } from "./config/redis.js";
logInfo("app.ts loaded");

const allowedOrigins = getAllowedOrigins();

const app = express();
// Number of reverse proxies in front of the app (1 behind the AWS ALB). Without it,
// req.ip is the proxy's address and every client shares one rate-limit bucket.
app.set("trust proxy", Number(process.env["TRUST_PROXY_HOPS"] ?? 0));
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin/non-browser requests (no Origin header) and configured origins only.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      logError("cors_origin_rejected", { origin, allowedOrigins });
      // A 403 the error handler understands, not a generic 500.
      callback(new HttpError(403, "FORBIDDEN", `Origin not allowed: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);
app.use(requestContext);
startNotificationWorker();

function runJobClosingSoonNotifications(): void {
  queueJobClosingSoonNotifications().catch((err) => {
    logError("job_closing_soon_notifications_failed", { error: String(err) });
  });
}

runJobClosingSoonNotifications();
const jobClosingSoonInterval = setInterval(
  runJobClosingSoonNotifications,
  6 * 60 * 60 * 1000,
);

/** Stops app-level background timers (for graceful shutdown). */
export function stopBackgroundJobs(): void {
  clearInterval(jobClosingSoonInterval);
  stopNotificationWorker();
}

app.use((req, res, next) => {
  const startedAt = Date.now();
  const originalEnd = res.end.bind(res);
  res.end = ((...args: Parameters<typeof res.end>) => {
    const latencyMs = Date.now() - startedAt;
    if (!res.headersSent) {
      res.setHeader("Server-Timing", `app;dur=${latencyMs}`);
      res.setHeader("X-Response-Time", `${latencyMs}ms`);
    }
    return originalEnd(...args);
  }) as typeof res.end;
  res.on("finish", () => {
    const latencyMs = Date.now() - startedAt;
    trackHttp(res.statusCode, latencyMs);
    logInfo("http_request", {
      requestId: res.locals["requestId"] as string | undefined,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      latencyMs,
    });
  });

  next();
});

app.use(express.json());
app.use(sanitizeInput);
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/upload", uploadRoute);
app.use("/api/chat", chatRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/saved-jobs", savedJobRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/resume-fit", resumeFitRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/external-jobs", externalJobRoutes);
app.use("/api/remote-jobs", remoteJobRoutes);

app.get("/api/test", (req, res) => {
  res.json({
    message: " Test route is working!...... 🚀",
  });
});

// Released version (e.g. api-v12), set by the deploy workflow. The deploy's
// smoke test checks it to confirm the new version is the one serving.
const APP_VERSION = process.env["APP_VERSION"] || "dev";

app.get("/api/health", async (_req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  const redisConnected = await pingRedis();
  const status = dbConnected ? "ok" : "degraded";
  res.status(dbConnected ? 200 : 503).json({
    success: dbConnected,
    status,
    version: APP_VERSION,
    services: {
      api: "up",
      db: dbConnected ? "up" : "down",
      redis: redisConnected ? "up" : "down",
    },
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health/ready", async (_req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  if (!dbConnected) {
    return res.status(503).json({
      success: false,
      status: "not_ready",
      version: APP_VERSION,
      reason: "Database not connected",
    });
  }
  const redisConnected = await pingRedis();
  return res.json({
    success: true,
    status: "ready",
    version: APP_VERSION,
    services: {
      db: "up",
      redis: redisConnected ? "up" : "down",
    },
  });
});

app.get("/api/metrics", (_req, res) => {
  try {
    return res.json({
      success: true,
      message: "Metrics snapshot",
      data: snapshotMetrics(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError("metrics_snapshot_failed", { error });
    return res.status(500).json({
      success: false,
      message: "Could not collect metrics",
    });
  }
});
app.use(notFoundHandler);
app.use(errorHandler);

export default app;

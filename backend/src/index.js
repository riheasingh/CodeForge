import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import problemRoutes from "./routes/problem.routes.js";
import executionRoute from "./routes/executeCode.routes.js";
import submissionRoutes from "./routes/submission.routes.js";
import playlistRoutes from "./routes/playlist.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import analyzeCodeRoutes from "./routes/analyzeCode.routes.js";
import { db } from "./libs/db.js";

const app = express();
const PORT = process.env.PORT || 8081;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(
    cors({
      origin: CORS_ORIGIN,
      credentials: true,
    })
  );
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.send("Hello Guys welcome to leetlab🔥");
});

app.get("/health", async (req, res) => {
  let dbConnected = false;
  let dbError = null;

  try {
    // Simple connectivity check. Will throw if DB is unreachable/invalid.
    await db.$queryRaw`SELECT 1 as ok`;
    dbConnected = true;
  } catch (err) {
    dbConnected = false;
    dbError = err?.message || "Unknown DB error";
  }

  res.status(dbConnected ? 200 : 503).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: {
      connected: dbConnected,
      error: dbConnected ? undefined : dbError,
    },
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/problems", problemRoutes);
app.use("/api/v1/execute-code", executionRoute);
app.use("/api/v1/submission", submissionRoutes);

app.use("/api/v1/playlist", playlistRoutes);
app.use("/api/v1/ai", aiRoutes);
app.use("/api/v1/analyze-code", analyzeCodeRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

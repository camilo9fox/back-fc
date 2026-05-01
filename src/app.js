require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const Container = require("./container");
const config = require("./shared/config/config");
const logger = require("./shared/config/logger");
const {
  apiLimiter,
  aiGenerationLimiter,
} = require("./shared/middleware/rateLimiter");
const requestTimeout = require("./shared/middleware/requestTimeout");
const sanitizeBody = require("./shared/middleware/sanitize");
const { AppError } = require("./shared/errors/AppError");

/**
 * Builds and configures the Express application.
 * Centralizes dependency injection and route wiring.
 */
function createApp() {
  const app = express();
  const container = Container.create(config);

  const flashCardRoutes = container.get("flashCardRoutes");
  const authRoutes = container.get("authRoutes");
  const categoryRoutes = container.get("categoryRoutes");
  const quizRoutes = container.get("quizRoutes");
  const trueFalseRoutes = container.get("trueFalseRoutes");
  const studyGuideRoutes = container.get("studyGuideRoutes");
  const statsRoutes = container.get("statsRoutes");
  const attemptRoutes = container.get("attemptRoutes");
  const libraryRoutes = container.get("libraryRoutes");
  const createGamesRouter = require("./modules/games/gamesRoutes");
  const gamesRouter = createGamesRouter();

  // Security headers
  app.use(helmet());

  app.use(cors(config.corsOptions));
  app.use(cookieParser());
  app.use(express.json({ limit: "10mb" }));

  // Apply 30-second request timeout to all routes
  app.use(requestTimeout(30_000));

  // Sanitize string fields in request bodies (strips control chars / NUL bytes)
  app.use(sanitizeBody);

  // Health check (skip rate limiter)
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // General API rate limiter
  app.use("/api", apiLimiter);

  // AI generation rate limiter on expensive endpoints
  app.use("/api/flashcards/generate", aiGenerationLimiter);
  app.use("/api/study-guides/generate-async", aiGenerationLimiter);
  app.use("/api/quizzes/generate", aiGenerationLimiter);
  app.use("/api/true-false/generate", aiGenerationLimiter);

  app.use("/api/auth", authRoutes.getRouter());
  app.use("/api/flashcards", flashCardRoutes);
  app.use("/api/categories", categoryRoutes);
  app.use("/api/quizzes", quizRoutes);
  app.use("/api/true-false", trueFalseRoutes);
  app.use("/api/study-guides", studyGuideRoutes);
  app.use("/api/stats", statsRoutes);
  app.use("/api/attempts", attemptRoutes);
  app.use("/api/library", libraryRoutes);
  app.use("/api/games", gamesRouter);

  app.use((error, req, res, next) => {
    if (error && error.code === "LIMIT_FILE_SIZE") {
      const maxMb = Math.round(config.limits.fileSizeLimit / (1024 * 1024));
      return res.status(413).json({
        error: `Archivo demasiado grande. Máximo permitido: ${maxMb}MB.`,
      });
    }

    // Known domain errors — safe to surface the message
    if (error instanceof AppError) {
      logger.warn(`${error.name}: ${error.message}`);
      return res.status(error.statusCode).json({ error: error.message });
    }

    // Unknown errors — log full stack, return generic message to avoid info leakage
    logger.error(error.stack || error);
    const isDev = process.env.NODE_ENV !== "production";
    res.status(500).json({
      error: isDev ? error.message : "Internal server error",
    });
  });

  app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  return app;
}

module.exports = createApp;

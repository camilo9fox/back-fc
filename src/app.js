require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Container = require("./container");
const config = require("./shared/config/config");

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

  app.use(cors(config.corsOptions));
  app.use(express.json({ limit: "10mb" }));

  app.use("/api/auth", authRoutes.getRouter());
  app.use("/api/flashcards", flashCardRoutes);
  app.use("/api/categories", categoryRoutes);
  app.use("/api/quizzes", quizRoutes);
  app.use("/api/true-false", trueFalseRoutes);

  app.use((error, req, res, next) => {
    if (error && error.code === "LIMIT_FILE_SIZE") {
      const maxMb = Math.round(config.limits.fileSizeLimit / (1024 * 1024));
      return res.status(413).json({
        error: `Archivo demasiado grande. Máximo permitido: ${maxMb}MB.`,
      });
    }

    console.error(error.stack);
    res.status(500).json({ error: error.message || "Internal server error" });
  });

  app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  return app;
}

module.exports = createApp;

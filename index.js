const createApp = require("./src/app");
const config = require("./src/shared/config/config");
const logger = require("./src/shared/config/logger");

const app = createApp();

// ── Global unhandled error guards ─────────────────────────────────────────────
// These prevent the process from crashing silently on unexpected errors.
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception — shutting down:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection — shutting down:", reason);
  process.exit(1);
});

// ── Start server ──────────────────────────────────────────────────────────────
const server = app.listen(config.port, () => {
  logger.info(`Servidor corriendo en http://localhost:${config.port}`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// On SIGTERM / SIGINT: stop accepting new connections, wait for in-flight
// requests to finish (up to 10 s), then exit cleanly.
const shutdown = (signal) => {
  logger.info(`${signal} received — cerrando servidor...`);

  server.close(() => {
    logger.info("Servidor cerrado. Proceso terminado.");
    process.exit(0);
  });

  // Force-exit after 10 s if requests are still pending
  setTimeout(() => {
    logger.error("Forzando cierre tras 10 s de espera.");
    process.exit(1);
  }, 10_000).unref(); // .unref() avoids keeping the event loop alive
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

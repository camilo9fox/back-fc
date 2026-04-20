const logger = require("../config/logger");

/**
 * Request timeout middleware.
 * Sends a 503 response if a request takes longer than `ms` milliseconds.
 * Uses res.headersSent to avoid double-responding if the route already finished.
 *
 * @param {number} ms - Timeout in milliseconds (default: 30 000)
 */
function requestTimeout(ms = 30_000) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn(`Request timeout: ${req.method} ${req.originalUrl}`);
        res.status(503).json({
          error: "La solicitud tardó demasiado. Por favor inténtalo de nuevo.",
        });
      }
    }, ms);

    // Clear the timer as soon as the response is sent or the connection closes
    res.on("finish", () => clearTimeout(timer));
    res.on("close", () => clearTimeout(timer));

    next();
  };
}

module.exports = requestTimeout;

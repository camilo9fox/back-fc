const express = require("express");
const { authMiddleware } = require("../../../shared/middleware/auth");
const { perUserApiLimiter } = require("../../../shared/middleware/rateLimiter");

function createStatsRouter(statsController) {
  const router = express.Router();

  router.use(authMiddleware);
  router.use(perUserApiLimiter);

  router.get("/", (req, res) => statsController.getStats(req, res));
  router.get("/ai-usage", (req, res) => statsController.getAiUsage(req, res));

  return router;
}

module.exports = createStatsRouter;

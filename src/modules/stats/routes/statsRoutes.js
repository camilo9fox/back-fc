const express = require("express");
const { authMiddleware } = require("../../../shared/middleware/auth");

function createStatsRouter(statsController) {
  const router = express.Router();

  router.use(authMiddleware);

  router.get("/", (req, res) => statsController.getStats(req, res));
  router.get("/ai-usage", (req, res) => statsController.getAiUsage(req, res));

  return router;
}

module.exports = createStatsRouter;

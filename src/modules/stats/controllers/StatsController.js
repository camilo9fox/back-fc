const { AppError } = require("../../../shared/errors/AppError");

/**
 * HTTP handler for statistics endpoints.
 * Single Responsibility: translates HTTP ↔ service calls only.
 */
class StatsController {
  constructor(statsService, aiUsageService) {
    this.statsService = statsService;
    this.aiUsageService = aiUsageService;
  }

  async getStats(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const stats = await this.statsService.getStats(userId);
      res.json(stats);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async getAiUsage(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const usage = await this.aiUsageService.getStatus(userId);
      res.json(usage);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  _handleError(error, res) {
    console.error("StatsController error:", error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: "Error interno del servidor" });
  }
}

module.exports = StatsController;

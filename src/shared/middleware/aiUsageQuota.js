const { AppError, TooManyRequestsError } = require("../errors/AppError");

function createAiUsageQuotaMiddleware(aiUsageService, action) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const usage = await aiUsageService.consumeCredits({ userId, action });

      if (usage?.allowed && Number.isFinite(usage.creditsRemaining)) {
        res.setHeader("X-AI-Credits-Remaining", String(usage.creditsRemaining));
      }

      if (usage?.allowed && Number.isFinite(usage.dailyLimit)) {
        res.setHeader("X-AI-Daily-Limit", String(usage.dailyLimit));
      }

      return next();
    } catch (error) {
      if (error instanceof TooManyRequestsError) {
        const retryAfter = error.details?.retryAfterSeconds;
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          res.setHeader("Retry-After", String(Math.ceil(retryAfter)));
        }

        return res.status(error.statusCode).json({
          error: error.message,
          code: error.details?.reason || "quota_exceeded",
          details: error.details,
        });
      }

      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }

      return next(error);
    }
  };
}

module.exports = { createAiUsageQuotaMiddleware };

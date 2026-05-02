const config = require("../config/config");
const { TooManyRequestsError, ValidationError } = require("../errors/AppError");

class AiUsageService {
  constructor(aiUsageRepository) {
    this.aiUsageRepository = aiUsageRepository;
    this.policy = config.aiUsage;
  }

  _getCost(action) {
    const cost = this.policy.costs[action];
    if (!Number.isFinite(cost) || cost <= 0) {
      throw new ValidationError(
        `Costo de créditos inválido para la acción: ${action}`,
      );
    }
    return cost;
  }

  async consumeCredits({ userId, action }) {
    if (!this.policy.enabled) {
      return { allowed: true, skipped: true };
    }

    if (!userId) {
      throw new ValidationError("userId requerido para consumir créditos");
    }

    const cost = this._getCost(action);

    const result = await this.aiUsageRepository.consumeCredits({
      userId,
      credits: cost,
      dailyLimit: this.policy.dailyCredits,
      burstWindowSeconds: this.policy.burstWindowSeconds,
      burstLimit: this.policy.burstLimit,
    });

    if (!result.allowed) {
      const error = new TooManyRequestsError(
        result.reason === "daily_limit"
          ? "Límite diario de créditos agotado"
          : "Has alcanzado el límite temporal de solicitudes",
      );

      error.details = {
        reason: result.reason,
        dailyLimit: Number(result.daily_limit || this.policy.dailyCredits),
        creditsUsed: Number(result.credits_used || 0),
        creditsRemaining: Number(result.credits_remaining || 0),
        periodStart: result.period_start,
        periodEnd: result.period_end,
        burstLimit: Number(result.burst_limit || this.policy.burstLimit),
        burstUsed: Number(result.burst_used || 0),
        burstWindowResetAt: result.burst_window_reset_at,
        retryAfterSeconds: Number(result.retry_after_seconds || 0),
      };

      throw error;
    }

    return {
      allowed: true,
      cost,
      creditsRemaining: Number(result.credits_remaining || 0),
      creditsUsed: Number(result.credits_used || 0),
      dailyLimit: Number(result.daily_limit || this.policy.dailyCredits),
      burstUsed: Number(result.burst_used || 0),
      burstLimit: Number(result.burst_limit || this.policy.burstLimit),
      burstWindowResetAt: result.burst_window_reset_at,
      periodStart: result.period_start,
      periodEnd: result.period_end,
    };
  }

  async getStatus(userId) {
    if (!userId) {
      throw new ValidationError("userId requerido");
    }

    const status = await this.aiUsageRepository.getStatus({
      userId,
      dailyLimit: this.policy.dailyCredits,
      burstWindowSeconds: this.policy.burstWindowSeconds,
      burstLimit: this.policy.burstLimit,
    });

    return {
      ...status,
      enabled: this.policy.enabled,
      costs: this.policy.costs,
    };
  }
}

module.exports = AiUsageService;

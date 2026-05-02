const { createClient } = require("@supabase/supabase-js");
const config = require("../../config/config");

class SupabaseAiUsageRepository {
  constructor() {
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
    );
    this.table = "ai_user_quotas";
    this.consumeRpc = "consume_ai_credits";
  }

  async consumeCredits({
    userId,
    credits,
    dailyLimit,
    burstWindowSeconds,
    burstLimit,
  }) {
    const { data, error } = await this.supabase.rpc(this.consumeRpc, {
      p_user_id: userId,
      p_credits: credits,
      p_daily_limit: dailyLimit,
      p_burst_window_seconds: burstWindowSeconds,
      p_burst_limit: burstLimit,
    });

    if (error) {
      throw new Error(`AiUsageRepo.consumeCredits: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error("AiUsageRepo.consumeCredits: respuesta vacía del RPC");
    }

    return data[0];
  }

  async getStatus({ userId, dailyLimit, burstWindowSeconds, burstLimit }) {
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);

    const insertPayload = {
      user_id: userId,
      period_start: today,
      credits_used: 0,
      credits_limit: dailyLimit,
      burst_window_start: nowIso,
      burst_used: 0,
      burst_limit: burstLimit,
      updated_at: nowIso,
    };

    // Ensure row exists without mutating existing counters.
    const { error: insertError } = await this.supabase
      .from(this.table)
      .insert(insertPayload);

    if (insertError && insertError.code !== "23505") {
      throw new Error(`AiUsageRepo.getStatus.insert: ${insertError.message}`);
    }

    const { data: initialData, error } = await this.supabase
      .from(this.table)
      .select(
        "user_id, period_start, credits_used, credits_limit, burst_window_start, burst_used, burst_limit, last_request_at, updated_at",
      )
      .eq("user_id", userId)
      .single();

    if (error) {
      throw new Error(`AiUsageRepo.getStatus.select: ${error.message}`);
    }

    let data = initialData;

    const requiresPeriodReset = data.period_start !== today;
    const requiresPolicySync =
      Number(data.credits_limit) !== Number(dailyLimit) ||
      Number(data.burst_limit) !== Number(burstLimit);

    if (requiresPeriodReset || requiresPolicySync) {
      const updatePayload = {
        updated_at: nowIso,
      };

      if (requiresPeriodReset) {
        updatePayload.period_start = today;
        updatePayload.credits_used = 0;
        updatePayload.burst_window_start = nowIso;
        updatePayload.burst_used = 0;
      }

      if (requiresPolicySync) {
        updatePayload.credits_limit = dailyLimit;
        updatePayload.burst_limit = burstLimit;
      }

      const { data: updatedData, error: updateError } = await this.supabase
        .from(this.table)
        .update(updatePayload)
        .eq("user_id", userId)
        .select(
          "user_id, period_start, credits_used, credits_limit, burst_window_start, burst_used, burst_limit, last_request_at, updated_at",
        )
        .single();

      if (updateError) {
        throw new Error(`AiUsageRepo.getStatus.update: ${updateError.message}`);
      }

      data = updatedData;
    }

    const periodStart = new Date(`${data.period_start}T00:00:00.000Z`);
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);

    const windowStart = data.burst_window_start
      ? new Date(data.burst_window_start)
      : new Date();
    const windowReset = new Date(
      windowStart.getTime() + burstWindowSeconds * 1000,
    );

    return {
      userId: data.user_id,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      creditsUsed: Number(data.credits_used || 0),
      creditsLimit: Number(data.credits_limit || dailyLimit),
      creditsRemaining: Math.max(
        0,
        Number(data.credits_limit || dailyLimit) -
          Number(data.credits_used || 0),
      ),
      burstUsed: Number(data.burst_used || 0),
      burstLimit: Number(data.burst_limit || burstLimit),
      burstWindowSeconds,
      burstWindowResetAt: windowReset.toISOString(),
      lastRequestAt: data.last_request_at || null,
      updatedAt: data.updated_at || null,
    };
  }
}

module.exports = SupabaseAiUsageRepository;

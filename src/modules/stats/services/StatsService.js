/**
 * Business logic for user statistics.
 * Single Responsibility: aggregates repository data and derives insights.
 * Dependency Inversion: depends on IStatsRepository and AttemptService abstractions.
 */
class StatsService {
  constructor(statsRepository, attemptService) {
    this.statsRepository = statsRepository;
    this.attemptService = attemptService;
  }

  /**
   * Returns full stats snapshot for a user.
   * Fetches totals, category breakdown, and attempt stats in parallel.
   * @param {string} userId
   * @returns {Promise<{totals, categoryBreakdown, mostActive, attemptStats}>}
   */
  async getStats(userId) {
    const [totals, categoryBreakdown, attemptStats] = await Promise.all([
      this.statsRepository.getUserStats(userId),
      this.statsRepository.getCategoryBreakdown(userId),
      this.attemptService.getAttemptStats(userId),
    ]);

    const mostActive = this._findMostActive(categoryBreakdown);

    // Merge avg score per category into the breakdown rows
    const { avgScoreByCategory = {} } = attemptStats;
    const enrichedBreakdown = categoryBreakdown.map((row) => ({
      ...row,
      avgScore: avgScoreByCategory[row.id] ?? null,
    }));

    return {
      totals,
      categoryBreakdown: enrichedBreakdown,
      mostActive,
      attemptStats,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  _findMostActive(breakdown) {
    if (breakdown.length === 0) return null;
    const top = breakdown.reduce((a, b) => (a.total >= b.total ? a : b));
    return top.total > 0 ? { id: top.id, title: top.title } : null;
  }
}

module.exports = StatsService;

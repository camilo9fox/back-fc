/**
 * Unit tests — StatsService
 */

const StatsService = require("../../../src/modules/stats/services/StatsService");
const { VALID_USER_ID } = require("../../__mocks__/fixtures");

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService(repoOverrides = {}, attemptOverrides = {}) {
  const statsRepository = {
    getUserStats: jest
      .fn()
      .mockResolvedValue({ totalCards: 10, totalQuizzes: 3 }),
    getCategoryBreakdown: jest.fn().mockResolvedValue([
      { id: "cat-1", title: "Biología", total: 8 },
      { id: "cat-2", title: "Historia", total: 2 },
    ]),
    ...repoOverrides,
  };
  const attemptService = {
    getAttemptStats: jest.fn().mockResolvedValue({
      totalAttempts: 5,
      avgScoreByCategory: { "cat-1": 85, "cat-2": 70 },
    }),
    ...attemptOverrides,
  };
  return {
    service: new StatsService(statsRepository, attemptService),
    statsRepository,
    attemptService,
  };
}

// ── getStats ──────────────────────────────────────────────────────────────────

describe("StatsService.getStats()", () => {
  it("returns totals, categoryBreakdown, mostActive and attemptStats", async () => {
    const { service } = buildService();
    const result = await service.getStats(VALID_USER_ID);
    expect(result.totals).toBeDefined();
    expect(result.categoryBreakdown).toBeDefined();
    expect(result.mostActive).toBeDefined();
    expect(result.attemptStats).toBeDefined();
  });

  it("fetches all three data sources in parallel", async () => {
    const { service, statsRepository, attemptService } = buildService();
    await service.getStats(VALID_USER_ID);
    expect(statsRepository.getUserStats).toHaveBeenCalledWith(VALID_USER_ID);
    expect(statsRepository.getCategoryBreakdown).toHaveBeenCalledWith(
      VALID_USER_ID,
    );
    expect(attemptService.getAttemptStats).toHaveBeenCalledWith(VALID_USER_ID);
  });

  it("enriches breakdown rows with avgScore per category", async () => {
    const { service } = buildService();
    const result = await service.getStats(VALID_USER_ID);
    const cat1Row = result.categoryBreakdown.find((r) => r.id === "cat-1");
    expect(cat1Row.avgScore).toBe(85);
  });

  it("sets avgScore to null when category has no score data", async () => {
    const { service } = buildService(
      {},
      {
        getAttemptStats: jest.fn().mockResolvedValue({
          avgScoreByCategory: {}, // no data
        }),
      },
    );
    const result = await service.getStats(VALID_USER_ID);
    expect(result.categoryBreakdown[0].avgScore).toBeNull();
  });

  it("defaults avgScoreByCategory to {} when attemptStats omits the key", async () => {
    const { service } = buildService(
      {},
      {
        getAttemptStats: jest.fn().mockResolvedValue({ totalAttempts: 3 }),
      },
    );
    const result = await service.getStats(VALID_USER_ID);
    // enriched rows should have avgScore null (no data in default obj)
    expect(result.categoryBreakdown[0].avgScore).toBeNull();
  });

  it("returns the most active category (highest total)", async () => {
    const { service } = buildService();
    const result = await service.getStats(VALID_USER_ID);
    expect(result.mostActive).toEqual({ id: "cat-1", title: "Biología" });
  });

  it("returns null for mostActive when all categories have total=0", async () => {
    const { service } = buildService({
      getCategoryBreakdown: jest
        .fn()
        .mockResolvedValue([{ id: "cat-1", title: "Biología", total: 0 }]),
    });
    const result = await service.getStats(VALID_USER_ID);
    expect(result.mostActive).toBeNull();
  });

  it("returns null for mostActive when breakdown is empty", async () => {
    const { service } = buildService({
      getCategoryBreakdown: jest.fn().mockResolvedValue([]),
    });
    const result = await service.getStats(VALID_USER_ID);
    expect(result.mostActive).toBeNull();
  });
});

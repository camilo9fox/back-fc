jest.mock("../../../src/shared/config/config", () => ({
  aiUsage: {
    enabled: true,
    weeklyCredits: 30,
    burstWindowSeconds: 300,
    burstLimit: 3,
    costs: {
      flashcards: 1,
      quizzes: 1,
      truefalse: 1,
      studyguides: 2,
      examsimulation: 2,
    },
  },
}));

const AiUsageService = require("../../../src/shared/services/AiUsageService");
const {
  ValidationError,
  TooManyRequestsError,
} = require("../../../src/shared/errors/AppError");

const VALID_USER_ID = "user-123";

function buildRepo(overrides = {}) {
  return {
    consumeCredits: jest.fn().mockResolvedValue({
      allowed: true,
      credits_remaining: 25,
      credits_used: 5,
      daily_limit: 30,
      burst_used: 1,
      burst_limit: 3,
      burst_window_reset_at: null,
      period_start: null,
      period_end: null,
    }),
    getStatus: jest.fn().mockResolvedValue({ someStatus: "ok" }),
    ...overrides,
  };
}

function buildService(repoOverrides = {}) {
  const repo = buildRepo(repoOverrides);
  const service = new AiUsageService(repo);
  return { service, repo };
}

describe("AiUsageService._getCost()", () => {
  it("returns cost for known action", () => {
    const { service } = buildService();
    expect(service._getCost("flashcards")).toBe(1);
    expect(service._getCost("studyguides")).toBe(2);
  });

  it("throws ValidationError for unknown action", () => {
    const { service } = buildService();
    expect(() => service._getCost("unknown_action")).toThrow(ValidationError);
  });
});

describe("AiUsageService.consumeCredits()", () => {
  it("returns skipped:true when disabled", async () => {
    const service = new AiUsageService(buildRepo());
    // Override policy to disabled
    service.policy = { ...service.policy, enabled: false };
    const result = await service.consumeCredits({
      userId: VALID_USER_ID,
      action: "flashcards",
    });
    expect(result).toEqual({ allowed: true, skipped: true });
  });

  it("throws ValidationError when userId missing", async () => {
    const { service } = buildService();
    await expect(
      service.consumeCredits({ userId: null, action: "flashcards" }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for unknown action", async () => {
    const { service } = buildService();
    await expect(
      service.consumeCredits({ userId: VALID_USER_ID, action: "unknown" }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws TooManyRequestsError when daily_limit exceeded", async () => {
    const { service } = buildService({
      consumeCredits: jest.fn().mockResolvedValue({
        allowed: false,
        reason: "daily_limit",
        daily_limit: 30,
        credits_used: 30,
        credits_remaining: 0,
        period_start: null,
        period_end: null,
      }),
    });
    await expect(
      service.consumeCredits({ userId: VALID_USER_ID, action: "flashcards" }),
    ).rejects.toThrow(TooManyRequestsError);
  });

  it("throws TooManyRequestsError when burst limit exceeded", async () => {
    const { service } = buildService({
      consumeCredits: jest.fn().mockResolvedValue({
        allowed: false,
        reason: "burst_limit",
        burst_limit: 3,
        burst_used: 3,
        retry_after_seconds: 60,
      }),
    });
    await expect(
      service.consumeCredits({ userId: VALID_USER_ID, action: "flashcards" }),
    ).rejects.toThrow(TooManyRequestsError);
  });

  it("returns allowed result on success", async () => {
    const { service } = buildService();
    const result = await service.consumeCredits({
      userId: VALID_USER_ID,
      action: "flashcards",
    });
    expect(result.allowed).toBe(true);
    expect(result.cost).toBe(1);
    expect(result.creditsRemaining).toBe(25);
  });
});

describe("AiUsageService.getStatus()", () => {
  it("throws ValidationError when userId missing", async () => {
    const { service } = buildService();
    await expect(service.getStatus(null)).rejects.toThrow(ValidationError);
  });

  it("returns status with enabled and costs added", async () => {
    const { service } = buildService({
      getStatus: jest.fn().mockResolvedValue({ credits_used: 5 }),
    });
    const result = await service.getStatus(VALID_USER_ID);
    expect(result.enabled).toBe(true);
    expect(result.costs).toBeDefined();
    expect(result.credits_used).toBe(5);
  });
});

/**
 * Unit tests — AttemptService
 */

const AttemptService = require("../../../src/modules/attempts/services/AttemptService");
const { AppError } = require("../../../src/shared/errors/AppError");
const {
  VALID_USER_ID,
  VALID_CATEGORY_ID,
} = require("../../__mocks__/fixtures");

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_QUIZ_ID = "quiz-001";
const VALID_SET_ID = "set-001";

function buildService(repoOverrides = {}) {
  const attemptRepository = {
    createQuizAttempt: jest.fn().mockResolvedValue({ id: "attempt-001" }),
    createTrueFalseAttempt: jest.fn().mockResolvedValue({ id: "attempt-002" }),
    createFlashcardSession: jest.fn().mockResolvedValue({ id: "attempt-003" }),
    getAttemptStats: jest.fn().mockResolvedValue({ totalAttempts: 5 }),
    getChartData: jest.fn().mockResolvedValue([]),
    getHistory: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    createGameScore: jest.fn().mockResolvedValue({ id: "gs-001" }),
    getGameBest: jest.fn().mockResolvedValue({ score: 100 }),
    ...repoOverrides,
  };
  return { service: new AttemptService(attemptRepository), attemptRepository };
}

// ── recordQuizAttempt ─────────────────────────────────────────────────────────

describe("AttemptService.recordQuizAttempt()", () => {
  it("records a valid quiz attempt and returns the record", async () => {
    const { service, attemptRepository } = buildService();
    const result = await service.recordQuizAttempt(VALID_USER_ID, {
      quizId: VALID_QUIZ_ID,
      categoryId: VALID_CATEGORY_ID,
      score: 7,
      totalQuestions: 10,
    });
    expect(result).toBeDefined();
    expect(attemptRepository.createQuizAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: VALID_USER_ID,
        score: 7,
        totalQuestions: 10,
      }),
    );
  });

  it("allows null quizId and categoryId", async () => {
    const { service, attemptRepository } = buildService();
    await service.recordQuizAttempt(VALID_USER_ID, {
      score: 5,
      totalQuestions: 10,
    });
    expect(attemptRepository.createQuizAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ quizId: null, categoryId: null }),
    );
  });

  it("throws AppError when score > totalQuestions", async () => {
    const { service } = buildService();
    await expect(
      service.recordQuizAttempt(VALID_USER_ID, {
        score: 11,
        totalQuestions: 10,
      }),
    ).rejects.toThrow(AppError);
  });

  it("throws AppError when score is negative", async () => {
    const { service } = buildService();
    await expect(
      service.recordQuizAttempt(VALID_USER_ID, {
        score: -1,
        totalQuestions: 10,
      }),
    ).rejects.toThrow(AppError);
  });

  it("throws AppError when totalQuestions is 0", async () => {
    const { service } = buildService();
    await expect(
      service.recordQuizAttempt(VALID_USER_ID, { score: 0, totalQuestions: 0 }),
    ).rejects.toThrow(AppError);
  });

  it("throws AppError when score is not an integer", async () => {
    const { service } = buildService();
    await expect(
      service.recordQuizAttempt(VALID_USER_ID, {
        score: 5.5,
        totalQuestions: 10,
      }),
    ).rejects.toThrow(AppError);
  });
});

// ── recordTrueFalseAttempt ────────────────────────────────────────────────────

describe("AttemptService.recordTrueFalseAttempt()", () => {
  it("records a valid TF attempt", async () => {
    const { service, attemptRepository } = buildService();
    await service.recordTrueFalseAttempt(VALID_USER_ID, {
      setId: VALID_SET_ID,
      score: 8,
      totalQuestions: 10,
    });
    expect(attemptRepository.createTrueFalseAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ setId: VALID_SET_ID, score: 8 }),
    );
  });

  it("throws AppError for invalid score", async () => {
    const { service } = buildService();
    await expect(
      service.recordTrueFalseAttempt(VALID_USER_ID, {
        score: 15,
        totalQuestions: 10,
      }),
    ).rejects.toThrow(AppError);
  });

  it("passes categoryId when provided", async () => {
    const { service, attemptRepository } = buildService();
    await service.recordTrueFalseAttempt(VALID_USER_ID, {
      setId: VALID_SET_ID,
      categoryId: VALID_CATEGORY_ID,
      score: 5,
      totalQuestions: 10,
    });
    expect(attemptRepository.createTrueFalseAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: VALID_CATEGORY_ID }),
    );
  });
});

// ── recordFlashcardSession ────────────────────────────────────────────────────

describe("AttemptService.recordFlashcardSession()", () => {
  it("records a valid flashcard session", async () => {
    const { service, attemptRepository } = buildService();
    await service.recordFlashcardSession(VALID_USER_ID, {
      categoryId: VALID_CATEGORY_ID,
      cardsKnown: 7,
      cardsUnknown: 3,
      totalCards: 10,
    });
    expect(attemptRepository.createFlashcardSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cardsKnown: 7,
        cardsUnknown: 3,
        totalCards: 10,
      }),
    );
  });

  it("throws AppError when cardsKnown + cardsUnknown != totalCards", async () => {
    const { service } = buildService();
    await expect(
      service.recordFlashcardSession(VALID_USER_ID, {
        cardsKnown: 7,
        cardsUnknown: 4, // 7+4=11 ≠ 10
        totalCards: 10,
      }),
    ).rejects.toThrow(AppError);
  });

  it("throws AppError when totalCards <= 0", async () => {
    const { service } = buildService();
    await expect(
      service.recordFlashcardSession(VALID_USER_ID, {
        cardsKnown: 0,
        cardsUnknown: 0,
        totalCards: 0,
      }),
    ).rejects.toThrow(AppError);
  });

  it("throws AppError when cardsKnown is negative", async () => {
    const { service } = buildService();
    await expect(
      service.recordFlashcardSession(VALID_USER_ID, {
        cardsKnown: -1,
        cardsUnknown: 11,
        totalCards: 10,
      }),
    ).rejects.toThrow(AppError);
  });

  it("throws AppError when values are not integers", async () => {
    const { service } = buildService();
    await expect(
      service.recordFlashcardSession(VALID_USER_ID, {
        cardsKnown: 5.5,
        cardsUnknown: 4.5,
        totalCards: 10,
      }),
    ).rejects.toThrow(AppError);
  });

  it("throws AppError when cardsUnknown is negative", async () => {
    const { service } = buildService();
    await expect(
      service.recordFlashcardSession(VALID_USER_ID, {
        cardsKnown: 11,
        cardsUnknown: -1,
        totalCards: 10,
      }),
    ).rejects.toThrow(AppError);
  });

  it("passes categoryId when provided", async () => {
    const { service, attemptRepository } = buildService();
    await service.recordFlashcardSession(VALID_USER_ID, {
      categoryId: VALID_CATEGORY_ID,
      cardsKnown: 7,
      cardsUnknown: 3,
      totalCards: 10,
    });
    expect(attemptRepository.createFlashcardSession).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: VALID_CATEGORY_ID }),
    );
  });
});

// ── getAttemptStats ───────────────────────────────────────────────────────────

describe("AttemptService.getAttemptStats()", () => {
  it("delegates to repository", async () => {
    const { service, attemptRepository } = buildService();
    const result = await service.getAttemptStats(VALID_USER_ID);
    expect(attemptRepository.getAttemptStats).toHaveBeenCalledWith(
      VALID_USER_ID,
    );
    expect(result).toEqual({ totalAttempts: 5 });
  });
});

// ── getChartData ──────────────────────────────────────────────────────────────

describe("AttemptService.getChartData()", () => {
  it("delegates to repository", async () => {
    const { service, attemptRepository } = buildService();
    const result = await service.getChartData(VALID_USER_ID);
    expect(attemptRepository.getChartData).toHaveBeenCalledWith(VALID_USER_ID);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── getHistory ────────────────────────────────────────────────────────────────

describe("AttemptService.getHistory()", () => {
  it("delegates to repository with filters", async () => {
    const { service, attemptRepository } = buildService();
    const filters = { type: "quiz", page: 1, limit: 10 };
    await service.getHistory(VALID_USER_ID, filters);
    expect(attemptRepository.getHistory).toHaveBeenCalledWith(
      VALID_USER_ID,
      filters,
    );
  });
});

// ── recordGameScore ───────────────────────────────────────────────────────────

describe("AttemptService.recordGameScore()", () => {
  it("records a valid game score", async () => {
    const { service, attemptRepository } = buildService();
    await service.recordGameScore(VALID_USER_ID, {
      gameType: "memory",
      score: 250,
      categoryId: VALID_CATEGORY_ID,
    });
    expect(attemptRepository.createGameScore).toHaveBeenCalledWith(
      expect.objectContaining({ gameType: "memory", score: 250 }),
    );
  });

  it("throws AppError when gameType is missing", async () => {
    const { service } = buildService();
    await expect(
      service.recordGameScore(VALID_USER_ID, { gameType: "", score: 100 }),
    ).rejects.toThrow(AppError);
  });

  it("throws AppError when score is negative", async () => {
    const { service } = buildService();
    await expect(
      service.recordGameScore(VALID_USER_ID, { gameType: "memory", score: -1 }),
    ).rejects.toThrow(AppError);
  });

  it("throws AppError when score is not an integer", async () => {
    const { service } = buildService();
    await expect(
      service.recordGameScore(VALID_USER_ID, {
        gameType: "memory",
        score: 10.5,
      }),
    ).rejects.toThrow(AppError);
  });

  it("passes categoryId when provided", async () => {
    const { service, attemptRepository } = buildService();
    await service.recordGameScore(VALID_USER_ID, {
      gameType: "memory",
      categoryId: VALID_CATEGORY_ID,
      score: 100,
    });
    expect(attemptRepository.createGameScore).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: VALID_CATEGORY_ID }),
    );
  });
});

// ── getGameBest ───────────────────────────────────────────────────────────────

describe("AttemptService.getGameBest()", () => {
  it("delegates to repository", async () => {
    const { service, attemptRepository } = buildService();
    const result = await service.getGameBest(VALID_USER_ID, {
      gameType: "memory",
      categoryId: VALID_CATEGORY_ID,
    });
    expect(attemptRepository.getGameBest).toHaveBeenCalledWith(
      expect.objectContaining({ gameType: "memory", userId: VALID_USER_ID }),
    );
    expect(result).toEqual({ score: 100 });
  });

  it("throws AppError when gameType is missing", async () => {
    const { service } = buildService();
    await expect(
      service.getGameBest(VALID_USER_ID, { gameType: "" }),
    ).rejects.toThrow(AppError);
  });

  it("passes categoryId when provided", async () => {
    const { service, attemptRepository } = buildService();
    await service.getGameBest(VALID_USER_ID, {
      gameType: "memory",
      categoryId: VALID_CATEGORY_ID,
    });
    expect(attemptRepository.getGameBest).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: VALID_CATEGORY_ID }),
    );
  });
});

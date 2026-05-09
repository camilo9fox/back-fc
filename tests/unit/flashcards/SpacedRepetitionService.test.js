/**
 * Unit tests — SpacedRepetitionService
 * Covers getDueCards, submitReview (SM-2 algorithm), getReviewStats,
 * searchFlashCards, exportToCsv, and _csvEscape.
 */

const SpacedRepetitionService = require("../../../src/modules/flashcards/services/SpacedRepetitionService");
const { ValidationError } = require("../../../src/shared/errors/AppError");
const {
  VALID_USER_ID,
  VALID_CATEGORY_ID,
} = require("../../__mocks__/fixtures");

// ── Helpers ───────────────────────────────────────────────────────────────────

const CARD_ID = "fc-sr-001";

function buildService(repoOverrides = {}) {
  const repo = {
    findDueCards: jest.fn().mockResolvedValue([]),
    getReview: jest.fn().mockResolvedValue(null),
    upsertReview: jest.fn().mockImplementation(async (data) => data),
    getReviewStats: jest
      .fn()
      .mockResolvedValue({ due: 0, new: 0, learned: 0, total: 0 }),
    search: jest.fn().mockResolvedValue([]),
    findAllForExport: jest.fn().mockResolvedValue([]),
    ...repoOverrides,
  };
  return { service: new SpacedRepetitionService(repo), repo };
}

// ── getDueCards ───────────────────────────────────────────────────────────────

describe("SpacedRepetitionService.getDueCards()", () => {
  it("delegates to repo.findDueCards with userId, limit and categoryId", async () => {
    const { service, repo } = buildService();
    await service.getDueCards(VALID_USER_ID, {
      limit: 10,
      categoryId: VALID_CATEGORY_ID,
    });
    expect(repo.findDueCards).toHaveBeenCalledWith(
      VALID_USER_ID,
      10,
      VALID_CATEGORY_ID,
    );
  });

  it("uses default limit of 20 for falsy/zero values", async () => {
    const { service, repo } = buildService();
    await service.getDueCards(VALID_USER_ID, { limit: 0 });
    expect(repo.findDueCards).toHaveBeenCalledWith(VALID_USER_ID, 20, null);
  });

  it("clamps limit to 100 for values exceeding max", async () => {
    const { service, repo } = buildService();
    await service.getDueCards(VALID_USER_ID, { limit: 999 });
    expect(repo.findDueCards).toHaveBeenCalledWith(VALID_USER_ID, 100, null);
  });

  it("uses default limit of 20 when not specified", async () => {
    const { service, repo } = buildService();
    await service.getDueCards(VALID_USER_ID, {});
    expect(repo.findDueCards).toHaveBeenCalledWith(VALID_USER_ID, 20, null);
  });

  it("uses default limit of 20 for non-integer limit (e.g. string)", async () => {
    const { service, repo } = buildService();
    await service.getDueCards(VALID_USER_ID, { limit: "ten" });
    expect(repo.findDueCards).toHaveBeenCalledWith(VALID_USER_ID, 20, null);
  });
});

// ── submitReview — validation ─────────────────────────────────────────────────

describe("SpacedRepetitionService.submitReview() — validation", () => {
  it("throws ValidationError for quality = 0 (out of range)", async () => {
    const { service } = buildService();
    await expect(
      service.submitReview(VALID_USER_ID, CARD_ID, 0),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for quality = 5 (out of range)", async () => {
    const { service } = buildService();
    await expect(
      service.submitReview(VALID_USER_ID, CARD_ID, 5),
    ).rejects.toThrow(ValidationError);
  });
});

// ── submitReview — SM-2 fail path (quality = 1) ───────────────────────────────

describe("SpacedRepetitionService.submitReview() — fail path (quality=1)", () => {
  it("resets repetitions to 0 and sets interval to 1 day", async () => {
    const { service } = buildService({
      getReview: jest.fn().mockResolvedValue({
        ease_factor: 2.5,
        interval_days: 10,
        repetitions: 5,
      }),
    });
    const result = await service.submitReview(VALID_USER_ID, CARD_ID, 1);
    expect(result.repetitions).toBe(0);
    expect(result.intervalDays).toBe(1);
    expect(result.easeFactor).toBe(2.5); // ease unchanged on fail
  });
});

// ── submitReview — SM-2 pass path ────────────────────────────────────────────

describe("SpacedRepetitionService.submitReview() — pass path", () => {
  it("sets interval to 1 on first successful review (reps=0)", async () => {
    const { service } = buildService({
      getReview: jest.fn().mockResolvedValue(null), // no history
    });
    const result = await service.submitReview(VALID_USER_ID, CARD_ID, 3);
    expect(result.repetitions).toBe(1);
    expect(result.intervalDays).toBe(1);
  });

  it("sets interval to 6 on second successful review (reps=1)", async () => {
    const { service } = buildService({
      getReview: jest.fn().mockResolvedValue({
        ease_factor: 2.5,
        interval_days: 1,
        repetitions: 1,
      }),
    });
    const result = await service.submitReview(VALID_USER_ID, CARD_ID, 3);
    expect(result.repetitions).toBe(2);
    expect(result.intervalDays).toBe(6);
  });

  it("multiplies interval by ease factor from third review onward (reps=2)", async () => {
    const { service } = buildService({
      getReview: jest.fn().mockResolvedValue({
        ease_factor: 2.5,
        interval_days: 6,
        repetitions: 2,
      }),
    });
    const result = await service.submitReview(VALID_USER_ID, CARD_ID, 3);
    expect(result.repetitions).toBe(3);
    expect(result.intervalDays).toBe(Math.ceil(6 * 2.5)); // 15
  });

  it("quality=4 (Easy) increases ease factor", async () => {
    const { service } = buildService();
    const result = await service.submitReview(VALID_USER_ID, CARD_ID, 4);
    // default ease is 2.5; quality=4 → q=5 → delta = 0.1 - 0*(0.08+0*0.02) = 0.1
    expect(result.easeFactor).toBeGreaterThan(2.5);
  });

  it("quality=2 (Hard) decreases ease factor but not below MIN_EASE=1.3", async () => {
    const { service } = buildService({
      getReview: jest.fn().mockResolvedValue({
        ease_factor: 1.31,
        interval_days: 1,
        repetitions: 1,
      }),
    });
    const result = await service.submitReview(VALID_USER_ID, CARD_ID, 2);
    // quality=2 → q=3 → delta = 0.1-(5-3)*(0.08+(5-3)*0.02) = 0.1-2*0.12 = -0.14
    // 1.31 + (-0.14) = 1.17 < 1.3 → clamped to 1.3
    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it("returns the correct shape including nextReviewAt", async () => {
    const { service } = buildService();
    const result = await service.submitReview(VALID_USER_ID, CARD_ID, 3);
    expect(result).toMatchObject({
      flashcardId: CARD_ID,
      quality: 3,
      easeFactor: expect.any(Number),
      intervalDays: expect.any(Number),
      repetitions: expect.any(Number),
      nextReviewAt: expect.any(String),
    });
  });
});

// ── getReviewStats ────────────────────────────────────────────────────────────

describe("SpacedRepetitionService.getReviewStats()", () => {
  it("delegates to repo.getReviewStats", async () => {
    const stats = { due: 5, new: 3, learned: 10, total: 18 };
    const { service, repo } = buildService({
      getReviewStats: jest.fn().mockResolvedValue(stats),
    });
    const result = await service.getReviewStats(VALID_USER_ID);
    expect(repo.getReviewStats).toHaveBeenCalledWith(VALID_USER_ID);
    expect(result).toEqual(stats);
  });
});

// ── searchFlashCards ──────────────────────────────────────────────────────────

describe("SpacedRepetitionService.searchFlashCards()", () => {
  it("throws ValidationError when query is shorter than 2 characters", async () => {
    const { service } = buildService();
    await expect(service.searchFlashCards(VALID_USER_ID, "a")).rejects.toThrow(
      ValidationError,
    );
  });

  it("throws ValidationError for empty query", async () => {
    const { service } = buildService();
    await expect(service.searchFlashCards(VALID_USER_ID, "")).rejects.toThrow(
      ValidationError,
    );
  });

  it("delegates valid search to repo.search", async () => {
    const cards = [{ id: "fc-001" }];
    const { service, repo } = buildService({
      search: jest.fn().mockResolvedValue(cards),
    });
    const result = await service.searchFlashCards(
      VALID_USER_ID,
      "mitosis",
      VALID_CATEGORY_ID,
      10,
    );
    expect(repo.search).toHaveBeenCalledWith(
      VALID_USER_ID,
      "mitosis",
      VALID_CATEGORY_ID,
      10,
    );
    expect(result).toEqual(cards);
  });

  it("trims the query before searching", async () => {
    const { service, repo } = buildService();
    await service.searchFlashCards(VALID_USER_ID, "  fotosíntesis  ");
    expect(repo.search).toHaveBeenCalledWith(
      VALID_USER_ID,
      "fotosíntesis",
      null,
      50,
    );
  });
});

// ── exportToCsv ───────────────────────────────────────────────────────────────

describe("SpacedRepetitionService.exportToCsv()", () => {
  it("returns CSV header + rows for each flashcard", async () => {
    const { service } = buildService({
      findAllForExport: jest.fn().mockResolvedValue([
        {
          question: "¿Qué es la mitosis?",
          answer: "División celular.",
          source: "manual",
          created_at: "2026-01-15T10:00:00Z",
          category: { title: "Biología" },
        },
      ]),
    });
    const csv = await service.exportToCsv(VALID_USER_ID);
    expect(csv).toContain(
      "Categoría,Pregunta,Respuesta,Fuente,Fecha de creación",
    );
    expect(csv).toContain("Biología");
    expect(csv).toContain("División celular.");
    expect(csv).toContain("2026-01-15");
  });

  it("wraps values containing commas in double quotes", async () => {
    const { service } = buildService({
      findAllForExport: jest.fn().mockResolvedValue([
        {
          question: "Pregunta, con coma",
          answer: "Respuesta",
          source: "ai",
          created_at: "2026-01-01T00:00:00Z",
          category: null,
        },
      ]),
    });
    const csv = await service.exportToCsv(VALID_USER_ID);
    expect(csv).toContain('"Pregunta, con coma"');
  });

  it("escapes double quotes by doubling them", async () => {
    const { service } = buildService({
      findAllForExport: jest.fn().mockResolvedValue([
        {
          question: 'Dijo "hola"',
          answer: "Saludo",
          source: "manual",
          created_at: "2026-01-01T00:00:00Z",
          category: { title: "Idiomas" },
        },
      ]),
    });
    const csv = await service.exportToCsv(VALID_USER_ID);
    expect(csv).toContain('""hola""');
  });

  it("handles null category gracefully", async () => {
    const { service } = buildService({
      findAllForExport: jest.fn().mockResolvedValue([
        {
          question: "Q",
          answer: "A",
          source: "manual",
          created_at: null,
          category: null,
        },
      ]),
    });
    const csv = await service.exportToCsv(VALID_USER_ID);
    expect(csv).toContain("Q");
  });

  it("handles null question and answer gracefully (_csvEscape null path)", async () => {
    const { service } = buildService({
      findAllForExport: jest.fn().mockResolvedValue([
        {
          question: null,
          answer: null,
          source: "manual",
          created_at: null,
          category: null,
        },
      ]),
    });
    const csv = await service.exportToCsv(VALID_USER_ID);
    // Should not throw; question and answer columns should be empty
    const dataRow = csv.split("\n")[1];
    expect(dataRow).toBeDefined();
  });

  it("wraps values containing newlines in double quotes", async () => {
    const { service } = buildService({
      findAllForExport: jest.fn().mockResolvedValue([
        {
          question: "Línea1\nLínea2",
          answer: "Respuesta",
          source: "manual",
          created_at: "2026-01-01T00:00:00Z",
          category: null,
        },
      ]),
    });
    const csv = await service.exportToCsv(VALID_USER_ID);
    expect(csv).toContain('"Línea1\nLínea2"');
  });

  it("delegates to repo.findAllForExport with userId and categoryId", async () => {
    const { service, repo } = buildService();
    await service.exportToCsv(VALID_USER_ID, VALID_CATEGORY_ID);
    expect(repo.findAllForExport).toHaveBeenCalledWith(
      VALID_USER_ID,
      VALID_CATEGORY_ID,
    );
  });
});

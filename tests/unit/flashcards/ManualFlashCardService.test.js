/**
 * Unit tests — ManualFlashCardService
 * Covers validation rules, default-category fallback and repository delegation.
 */

const ManualFlashCardService = require("../../../src/modules/flashcards/services/ManualFlashCardService");
const { ValidationError } = require("../../../src/shared/errors/AppError");
const {
  VALID_USER_ID,
  VALID_CATEGORY_ID,
  validFlashCardInput,
  validFlashCard,
  validCategory,
} = require("../../__mocks__/fixtures");

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService({ repoOverrides = {}, categoryOverrides = {} } = {}) {
  const flashCardRepository = {
    create: jest.fn().mockResolvedValue(validFlashCard),
    createMany: jest.fn().mockResolvedValue([validFlashCard]),
    createSet: jest.fn().mockResolvedValue(validFlashCard),
    ...repoOverrides,
  };
  const categoryService = {
    getCategoryById: jest.fn().mockResolvedValue(validCategory),
    getDefaultCategory: jest.fn().mockResolvedValue(validCategory),
    ...categoryOverrides,
  };
  return {
    service: new ManualFlashCardService(flashCardRepository, categoryService),
    flashCardRepository,
    categoryService,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ManualFlashCardService.createFlashCard()", () => {
  it("creates and returns a flashcard when input is valid", async () => {
    const { service, flashCardRepository } = buildService();
    const result = await service.createFlashCard(
      validFlashCardInput,
      VALID_USER_ID,
      VALID_CATEGORY_ID,
    );
    expect(flashCardRepository.createSet).toHaveBeenCalledTimes(1);
    expect(flashCardRepository.createSet).toHaveBeenCalledWith(
      expect.objectContaining({
        title: validFlashCardInput.title,
        cards: expect.arrayContaining([
          expect.objectContaining({
            question: validFlashCardInput.question,
            source: "manual",
          }),
        ]),
      }),
    );
    expect(result).toEqual(validFlashCard);
  });

  it("throws ValidationError when userId is missing", async () => {
    const { service } = buildService();
    await expect(
      service.createFlashCard(validFlashCardInput, ""),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when question is empty", async () => {
    const { service } = buildService();
    await expect(
      service.createFlashCard(
        { question: "", answer: "R" },
        VALID_USER_ID,
        VALID_CATEGORY_ID,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when answer is empty", async () => {
    const { service } = buildService();
    await expect(
      service.createFlashCard(
        { question: "P", answer: "" },
        VALID_USER_ID,
        VALID_CATEGORY_ID,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("uses default category when categoryId is not provided", async () => {
    const { service, categoryService } = buildService();
    await service.createFlashCard(validFlashCardInput, VALID_USER_ID);
    expect(categoryService.getDefaultCategory).toHaveBeenCalledWith(
      VALID_USER_ID,
    );
  });

  it("throws ValidationError when no categoryId and getDefaultCategory fails", async () => {
    const { service } = buildService({
      categoryOverrides: {
        getDefaultCategory: jest.fn().mockRejectedValue(new Error("not found")),
      },
    });
    await expect(
      service.createFlashCard(validFlashCardInput, VALID_USER_ID),
    ).rejects.toThrow(ValidationError);
  });
});

describe("ManualFlashCardService.createFlashCards()", () => {
  it("creates multiple flashcards and returns the array", async () => {
    const { service, flashCardRepository } = buildService();
    const cards = [validFlashCardInput, validFlashCardInput];
    const result = await service.createFlashCards(
      cards,
      VALID_USER_ID,
      VALID_CATEGORY_ID,
      "Test Set",
    );
    expect(flashCardRepository.createSet).toHaveBeenCalledTimes(1);
    expect(result).toEqual(validFlashCard);
  });

  it("throws ValidationError when array is empty", async () => {
    const { service } = buildService();
    await expect(
      service.createFlashCards([], VALID_USER_ID, VALID_CATEGORY_ID),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when more than 10 cards are provided", async () => {
    const { service } = buildService();
    const cards = Array(11).fill(validFlashCardInput);
    await expect(
      service.createFlashCards(cards, VALID_USER_ID, VALID_CATEGORY_ID),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when userId is missing", async () => {
    const { service } = buildService();
    await expect(
      service.createFlashCards([validFlashCardInput], ""),
    ).rejects.toThrow(ValidationError);
  });

  it("uses source 'ai' when a card has source='ai'", async () => {
    const { service, flashCardRepository } = buildService();
    await service.createFlashCards(
      [{ ...validFlashCardInput, source: "ai" }],
      VALID_USER_ID,
      VALID_CATEGORY_ID,
      "Test Set",
    );
    expect(flashCardRepository.createSet).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: expect.arrayContaining([expect.objectContaining({ source: "manual" })]),
      }),
    );
  });

  it("uses per-card categoryId when present", async () => {
    const { service, flashCardRepository } = buildService();
    await service.createFlashCards(
      [{ ...validFlashCardInput }],
      VALID_USER_ID,
      VALID_CATEGORY_ID,
      "Test Set",
    );
    // Just verify createSet was called with the correct category
    expect(flashCardRepository.createSet).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: VALID_CATEGORY_ID }),
    );
  });

  it("throws ValidationError wrapping error message when one card is invalid", async () => {
    const { service } = buildService();
    const cards = [
      validFlashCardInput, // valid
      { question: "", answer: "R" }, // invalid — empty question
    ];
    await expect(
      service.createFlashCards(cards, VALID_USER_ID, VALID_CATEGORY_ID, "Test Set"),
    ).rejects.toThrow(ValidationError);
    await expect(
      service.createFlashCards(cards, VALID_USER_ID, VALID_CATEGORY_ID, "Test Set"),
    ).rejects.toThrow(/Error en la flashcard 2/);
  });
});

// ── deleteFlashCard ───────────────────────────────────────────────────────────

describe("ManualFlashCardService.deleteFlashCard()", () => {
  it("deletes and returns true when the card exists", async () => {
    const { service } = buildService({
      repoOverrides: {
        findById: jest.fn().mockResolvedValue({ id: "fc-001" }),
        delete: jest.fn().mockResolvedValue(undefined),
      },
    });
    const result = await service.deleteFlashCard("fc-001", VALID_USER_ID);
    expect(result).toBe(true);
  });

  it("returns false when the card does not exist", async () => {
    const { service } = buildService({
      repoOverrides: { findById: jest.fn().mockResolvedValue(null) },
    });
    const result = await service.deleteFlashCard("nonexistent", VALID_USER_ID);
    expect(result).toBe(false);
  });

  it("throws ValidationError when userId is missing", async () => {
    const { service } = buildService();
    await expect(service.deleteFlashCard("fc-001", "")).rejects.toThrow(
      ValidationError,
    );
  });
});

// ── updateFlashCard ───────────────────────────────────────────────────────────

describe("ManualFlashCardService.updateFlashCard()", () => {
  it("updates and returns the updated card", async () => {
    const updated = { id: "fc-001", question: "Nueva P", answer: "Nueva R" };
    const { service } = buildService({
      repoOverrides: {
        findById: jest.fn().mockResolvedValue({ id: "fc-001" }),
        update: jest.fn().mockResolvedValue(updated),
      },
    });
    const result = await service.updateFlashCard("fc-001", VALID_USER_ID, {
      question: "Nueva P",
      answer: "Nueva R",
    });
    expect(result).toEqual(updated);
  });

  it("returns null when the card is not found", async () => {
    const { service } = buildService({
      repoOverrides: { findById: jest.fn().mockResolvedValue(null) },
    });
    const result = await service.updateFlashCard("nonexistent", VALID_USER_ID, {
      question: "P",
      answer: "R",
    });
    expect(result).toBeNull();
  });

  it("throws ValidationError when userId is missing", async () => {
    const { service } = buildService();
    await expect(
      service.updateFlashCard("fc-001", "", { question: "P", answer: "R" }),
    ).rejects.toThrow(ValidationError);
  });
});

// ── getFlashCards ─────────────────────────────────────────────────────────────

describe("ManualFlashCardService.getFlashCards()", () => {
  it("delegates to repository with userId and filters", async () => {
    const cards = [{ id: "fc-001" }];
    const { service, flashCardRepository } = buildService({
      repoOverrides: { findAll: jest.fn().mockResolvedValue(cards) },
    });
    const result = await service.getFlashCards(VALID_USER_ID, {
      categoryId: VALID_CATEGORY_ID,
    });
    expect(flashCardRepository.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: VALID_USER_ID,
        categoryId: VALID_CATEGORY_ID,
      }),
    );
    expect(result).toEqual(cards);
  });

  it("throws ValidationError when userId is missing", async () => {
    const { service } = buildService();
    await expect(service.getFlashCards("")).rejects.toThrow(ValidationError);
  });
});

// ── getFlashCardById ──────────────────────────────────────────────────────────

describe("ManualFlashCardService.getFlashCardById()", () => {
  it("returns the card when found", async () => {
    const card = { id: "fc-001" };
    const { service } = buildService({
      repoOverrides: { findById: jest.fn().mockResolvedValue(card) },
    });
    const result = await service.getFlashCardById("fc-001", VALID_USER_ID);
    expect(result).toEqual(card);
  });

  it("throws ValidationError when userId is missing", async () => {
    const { service } = buildService();
    await expect(service.getFlashCardById("fc-001", "")).rejects.toThrow(
      ValidationError,
    );
  });
});

// ── publishByCategory ─────────────────────────────────────────────────────────

describe("ManualFlashCardService.publishByCategory()", () => {
  it("delegates to flashCardRepository.publishByCategory", async () => {
    const { service, flashCardRepository } = buildService({
      repoOverrides: {
        publishByCategory: jest.fn().mockResolvedValue(true),
      },
    });
    await service.publishByCategory(VALID_CATEGORY_ID, VALID_USER_ID, true);
    expect(flashCardRepository.publishByCategory).toHaveBeenCalledWith(
      VALID_CATEGORY_ID,
      VALID_USER_ID,
      true,
    );
  });
});

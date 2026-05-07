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
    expect(flashCardRepository.create).toHaveBeenCalledTimes(1);
    expect(flashCardRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        question: validFlashCardInput.question,
        source: "manual",
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
    );
    expect(flashCardRepository.createMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual([validFlashCard]);
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
});

/**
 * Unit tests — TrueFalseService
 * Covers createSet, getSetById, updateSet, deleteSet and validation paths.
 */

const TrueFalseService = require("../../../src/modules/truefalse/services/TrueFalseService");
const {
  ValidationError,
  NotFoundError,
} = require("../../../src/shared/errors/AppError");
const {
  VALID_USER_ID,
  VALID_CATEGORY_ID,
  validTFSetInput,
  savedTFSet,
  validCategory,
} = require("../../__mocks__/fixtures");

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService({
  repoOverrides = {},
  categoryOverrides = {},
  groqOverrides = {},
} = {}) {
  const trueFalseRepository = {
    create: jest.fn().mockResolvedValue(savedTFSet),
    findAllByUser: jest.fn().mockResolvedValue([savedTFSet]),
    findById: jest.fn().mockResolvedValue(savedTFSet),
    update: jest.fn().mockResolvedValue(savedTFSet),
    delete: jest.fn().mockResolvedValue(true),
    ...repoOverrides,
  };
  const categoryService = {
    getCategoryById: jest.fn().mockResolvedValue(validCategory),
    ...categoryOverrides,
  };
  const groqService = {
    generateTrueFalseStatements: jest.fn().mockResolvedValue([]),
    ...groqOverrides,
  };
  const fileService = {
    extractText: jest.fn().mockResolvedValue("texto del archivo"),
  };
  const documentProcessingService = {
    buildStudyContext: jest.fn().mockResolvedValue("contexto procesado"),
  };

  return {
    service: new TrueFalseService(
      trueFalseRepository,
      categoryService,
      groqService,
      fileService,
      documentProcessingService,
    ),
    trueFalseRepository,
    categoryService,
  };
}

// ── createSet ─────────────────────────────────────────────────────────────────

describe("TrueFalseService.createSet()", () => {
  it("creates and returns a set with valid data", async () => {
    const { service, trueFalseRepository } = buildService();
    const result = await service.createSet(validTFSetInput, VALID_USER_ID);
    expect(trueFalseRepository.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual(savedTFSet);
  });

  it("throws ValidationError when title is missing", async () => {
    const { service } = buildService();
    await expect(
      service.createSet({ ...validTFSetInput, title: "" }, VALID_USER_ID),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when questions array is empty", async () => {
    const { service } = buildService();
    await expect(
      service.createSet({ ...validTFSetInput, questions: [] }, VALID_USER_ID),
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError when category does not exist", async () => {
    const { service } = buildService({
      categoryOverrides: { getCategoryById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.createSet(validTFSetInput, VALID_USER_ID),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── getSetById ────────────────────────────────────────────────────────────────

describe("TrueFalseService.getSetById()", () => {
  it("returns the set when found", async () => {
    const { service } = buildService();
    const result = await service.getSetById(savedTFSet.id, VALID_USER_ID);
    expect(result).toEqual(savedTFSet);
  });

  it("throws NotFoundError when set does not exist", async () => {
    const { service } = buildService({
      repoOverrides: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.getSetById("nonexistent", VALID_USER_ID),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── updateSet ─────────────────────────────────────────────────────────────────

describe("TrueFalseService.updateSet()", () => {
  it("updates and returns the set", async () => {
    const { service } = buildService();
    const result = await service.updateSet(savedTFSet.id, VALID_USER_ID, {
      title: "Nuevo título",
    });
    expect(result).toEqual(savedTFSet);
  });

  it("throws NotFoundError when set does not exist", async () => {
    const { service } = buildService({
      repoOverrides: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.updateSet("nonexistent", VALID_USER_ID, {}),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── deleteSet ─────────────────────────────────────────────────────────────────

describe("TrueFalseService.deleteSet()", () => {
  it("deletes the set when it exists", async () => {
    const { service, trueFalseRepository } = buildService();
    await service.deleteSet(savedTFSet.id, VALID_USER_ID);
    expect(trueFalseRepository.delete).toHaveBeenCalledWith(
      savedTFSet.id,
      VALID_USER_ID,
    );
  });

  it("throws NotFoundError when set does not exist", async () => {
    const { service } = buildService({
      repoOverrides: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.deleteSet("nonexistent", VALID_USER_ID),
    ).rejects.toThrow(NotFoundError);
  });
});

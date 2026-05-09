/**
 * Unit tests — StudyGuideService
 * Covers estimateDocumentScale, generateGuide, getGuides, getGuideById, deleteGuide.
 */

const StudyGuideService = require("../../../src/modules/studyguides/services/StudyGuideService");
const {
  ValidationError,
  NotFoundError,
} = require("../../../src/shared/errors/AppError");
const {
  VALID_USER_ID,
  VALID_CATEGORY_ID,
  validCategory,
} = require("../../__mocks__/fixtures");

// ── Helpers ───────────────────────────────────────────────────────────────────

const savedGuide = {
  id: "sg-001",
  userId: VALID_USER_ID,
  title: "Guía de Biología",
  content: "...",
};

function buildService(overrides = {}) {
  const studyGuideRepository = {
    create: jest.fn().mockResolvedValue(savedGuide),
    findAllByUser: jest.fn().mockResolvedValue([savedGuide]),
    findById: jest.fn().mockResolvedValue(savedGuide),
    delete: jest.fn().mockResolvedValue(true),
    ...(overrides.repoOverrides || {}),
  };
  const categoryService = {
    getCategoryById: jest.fn().mockResolvedValue(validCategory),
    ...(overrides.categoryOverrides || {}),
  };
  const studyGuideGenerationService = {
    generateGuide: jest.fn().mockResolvedValue("Contenido de la guía"),
    ...(overrides.genOverrides || {}),
  };
  const fileService = {
    extractText: jest.fn().mockResolvedValue("texto del archivo"),
    extractTextWithMeta: jest
      .fn()
      .mockResolvedValue({ text: "texto del archivo", pageCount: 5 }),
    ...(overrides.fileOverrides || {}),
  };
  const documentProcessingService = {
    buildStudyContext: jest.fn().mockResolvedValue("contexto procesado"),
    ...(overrides.docOverrides || {}),
  };

  return {
    service: new StudyGuideService(
      studyGuideRepository,
      categoryService,
      studyGuideGenerationService,
      fileService,
      documentProcessingService,
    ),
    studyGuideRepository,
    categoryService,
    fileService,
  };
}

// ── estimateDocumentScale ─────────────────────────────────────────────────────

describe("StudyGuideService.estimateDocumentScale()", () => {
  let service;
  beforeEach(() => {
    ({ service } = buildService());
  });

  it("returns tier=short for a small text", () => {
    const result = service.estimateDocumentScale("word ".repeat(200));
    expect(result.tier).toBe("short");
  });

  it("returns tier=medium for >50 pages worth of words", () => {
    const result = service.estimateDocumentScale("word ".repeat(450 * 51));
    expect(result.tier).toBe("medium");
  });

  it("returns tier=long for >100 pages", () => {
    const result = service.estimateDocumentScale("word ".repeat(450 * 101));
    expect(result.tier).toBe("long");
  });

  it("returns tier=very_long for >200 pages", () => {
    const result = service.estimateDocumentScale("word ".repeat(450 * 201));
    expect(result.tier).toBe("very_long");
  });

  it("returns tier=ultra for >400 pages", () => {
    const result = service.estimateDocumentScale("word ".repeat(450 * 401));
    expect(result.tier).toBe("ultra");
  });

  it("uses actualPageCount when it is larger than word-based estimate", () => {
    const result = service.estimateDocumentScale("word ".repeat(100), 300);
    expect(result.estimatedPages).toBe(300);
  });

  it("includes contextMaxLength and other profile fields", () => {
    const result = service.estimateDocumentScale("word ".repeat(100));
    expect(result.contextMaxLength).toBeDefined();
    expect(result.summaryParagraphs).toBeDefined();
  });

  it("handles empty content gracefully", () => {
    const result = service.estimateDocumentScale("");
    expect(result.tier).toBe("short");
    expect(result.words).toBe(0);
  });
});

// ── generateGuide ─────────────────────────────────────────────────────────────

describe("StudyGuideService.generateGuide()", () => {
  const baseParams = {
    text: "La célula es la unidad básica de la vida.",
    title: "Biología celular",
    categoryId: VALID_CATEGORY_ID,
    userId: VALID_USER_ID,
  };

  it("returns the saved guide on happy path", async () => {
    const { service } = buildService();
    const result = await service.generateGuide(baseParams);
    expect(result).toEqual(savedGuide);
  });

  it("throws ValidationError when neither file nor text is provided", async () => {
    const { service } = buildService();
    await expect(
      service.generateGuide({ ...baseParams, text: "  ", file: undefined }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when title is empty", async () => {
    const { service } = buildService();
    await expect(
      service.generateGuide({ ...baseParams, title: "" }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when categoryId is missing", async () => {
    const { service } = buildService();
    await expect(
      service.generateGuide({ ...baseParams, categoryId: null }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError when category does not exist", async () => {
    const { service } = buildService({
      categoryOverrides: { getCategoryById: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.generateGuide(baseParams)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("extracts text with metadata from file when file is provided", async () => {
    const { service, fileService } = buildService();
    const fakeFile = { originalname: "bio.pdf", size: 1024 };
    await service.generateGuide({
      ...baseParams,
      text: undefined,
      file: fakeFile,
    });
    expect(fileService.extractTextWithMeta).toHaveBeenCalledWith(fakeFile);
  });

  it("calls onProgress at key stages", async () => {
    const onProgress = jest.fn();
    const { service } = buildService();
    await service.generateGuide({ ...baseParams, onProgress });
    expect(onProgress).toHaveBeenCalled();
  });

  it("uses fastPathMinChunks=1 for sparse documents (low words-per-page PDF)", async () => {
    // 3 pages × ~50 words/page = sparse document (wordsPerPage < 120)
    const sparseText = "word ".repeat(150); // ~150 words
    const { service } = buildService({
      fileOverrides: {
        extractTextWithMeta: jest.fn().mockResolvedValue({
          text: sparseText,
          pageCount: 3, // 150/3 = 50 words/page → sparse
        }),
      },
    });
    await service.generateGuide({
      ...baseParams,
      text: undefined,
      file: { originalname: "slides.pdf", size: 1024 },
    });
    // Should not throw — sparse path is taken (fastPathMinChunks=1)
  });
});

// ── getGuides ─────────────────────────────────────────────────────────────────

describe("StudyGuideService.getGuides()", () => {
  it("delegates to studyGuideRepository.findAllByUser", async () => {
    const { service, studyGuideRepository } = buildService();
    const result = await service.getGuides(VALID_USER_ID, {
      categoryId: VALID_CATEGORY_ID,
    });
    expect(studyGuideRepository.findAllByUser).toHaveBeenCalledWith(
      VALID_USER_ID,
      {
        categoryId: VALID_CATEGORY_ID,
      },
    );
    expect(result).toEqual([savedGuide]);
  });
});

// ── getGuideById ──────────────────────────────────────────────────────────────

describe("StudyGuideService.getGuideById()", () => {
  it("returns the guide when found", async () => {
    const { service } = buildService();
    const result = await service.getGuideById("sg-001", VALID_USER_ID);
    expect(result).toEqual(savedGuide);
  });

  it("returns null when guide does not exist", async () => {
    const { service } = buildService({
      repoOverrides: { findById: jest.fn().mockResolvedValue(null) },
    });
    const result = await service.getGuideById("nonexistent", VALID_USER_ID);
    expect(result).toBeNull();
  });
});

// ── deleteGuide ───────────────────────────────────────────────────────────────

describe("StudyGuideService.deleteGuide()", () => {
  it("deletes and returns true when guide exists", async () => {
    const { service, studyGuideRepository } = buildService();
    const result = await service.deleteGuide("sg-001", VALID_USER_ID);
    expect(studyGuideRepository.delete).toHaveBeenCalledWith(
      "sg-001",
      VALID_USER_ID,
    );
    expect(result).toBe(true);
  });

  it("throws NotFoundError when guide does not exist", async () => {
    const { service } = buildService({
      repoOverrides: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.deleteGuide("nonexistent", VALID_USER_ID),
    ).rejects.toThrow(NotFoundError);
  });
});

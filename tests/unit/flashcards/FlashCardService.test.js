/**
 * Unit tests — FlashCardService
 * Covers processInput validation, generation flow, shouldPreferAsync
 * and processLargeDocument delegation.
 */

const FlashCardService = require("../../../src/modules/flashcards/services/FlashCardService");
const { ValidationError } = require("../../../src/shared/errors/AppError");
const {
  VALID_USER_ID,
  VALID_CATEGORY_ID,
} = require("../../__mocks__/fixtures");

// ── Helpers ───────────────────────────────────────────────────────────────────

const RAW_AI_CARDS = [
  { question: "¿Qué es la mitosis?", answer: "División celular." },
  { question: "¿Qué es la meiosis?", answer: "División reproductiva." },
];

function buildService({
  groqOverrides = {},
  fileOverrides = {},
  docOverrides = {},
  repoOverrides = {},
} = {}) {
  const groqService = {
    generateFlashCards: jest.fn().mockResolvedValue(RAW_AI_CARDS),
    summarizeChunk: jest.fn().mockResolvedValue("resumen"),
    ...groqOverrides,
  };
  const fileService = {
    extractText: jest.fn().mockResolvedValue("texto extraído del archivo"),
    ...fileOverrides,
  };
  const documentProcessingService = {
    normalizeText: jest.fn((t) => t),
    validateAndTruncateContent: jest.fn((t) => t),
    buildStudyContext: jest.fn().mockResolvedValue("contexto procesado"),
    ...docOverrides,
  };
  const flashCardRepository = {
    findAll: jest.fn().mockResolvedValue([]),
    ...repoOverrides,
  };
  const categoryService = {};

  return {
    service: new FlashCardService(
      groqService,
      fileService,
      documentProcessingService,
      flashCardRepository,
      categoryService,
    ),
    groqService,
    fileService,
    documentProcessingService,
    flashCardRepository,
  };
}

// ── processInput — validation ─────────────────────────────────────────────────

describe("FlashCardService.processInput() — validation", () => {
  it("throws ValidationError when userId is missing", async () => {
    const { service } = buildService();
    await expect(
      service.processInput({ text: "algo", quantity: 1, userId: "" }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when quantity is below minimum (< 1)", async () => {
    const { service } = buildService();
    await expect(
      service.processInput({
        text: "algo",
        quantity: 0,
        userId: VALID_USER_ID,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when quantity exceeds maximum (> 10)", async () => {
    const { service } = buildService();
    await expect(
      service.processInput({
        text: "algo",
        quantity: 11,
        userId: VALID_USER_ID,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when no file and no text are provided", async () => {
    const { service } = buildService();
    await expect(
      service.processInput({ text: "", quantity: 1, userId: VALID_USER_ID }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when AI returns fewer cards than requested", async () => {
    const { service } = buildService({
      groqOverrides: {
        generateFlashCards: jest.fn().mockResolvedValue([RAW_AI_CARDS[0]]),
      },
    });
    await expect(
      service.processInput({
        text: "contenido",
        quantity: 5,
        userId: VALID_USER_ID,
      }),
    ).rejects.toThrow(ValidationError);
  });
});

// ── processInput — happy path ─────────────────────────────────────────────────

describe("FlashCardService.processInput() — happy path", () => {
  it("returns flashcards from plain text input", async () => {
    const { service } = buildService({
      groqOverrides: {
        generateFlashCards: jest.fn().mockResolvedValue(RAW_AI_CARDS),
      },
    });
    const result = await service.processInput({
      text: "La mitosis es la división celular somática.",
      quantity: 2,
      userId: VALID_USER_ID,
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      question: expect.any(String),
      answer: expect.any(String),
    });
  });

  it("calls fileService.extractText when file is provided", async () => {
    const { service, fileService, groqService } = buildService();
    const fakeFile = { originalname: "doc.pdf", size: 1024 };
    groqService.generateFlashCards.mockResolvedValue(RAW_AI_CARDS);

    await service.processInput({
      file: fakeFile,
      quantity: 2,
      userId: VALID_USER_ID,
    });
    expect(fileService.extractText).toHaveBeenCalledWith(fakeFile);
  });

  it("concatenates file text and plain text when both are provided", async () => {
    const { service, documentProcessingService } = buildService({
      groqOverrides: {
        generateFlashCards: jest.fn().mockResolvedValue(RAW_AI_CARDS),
      },
    });
    const fakeFile = { originalname: "doc.pdf", size: 100 };

    await service.processInput({
      file: fakeFile,
      text: "extra texto",
      quantity: 2,
      userId: VALID_USER_ID,
    });
    // normalizeText should receive the combined content
    expect(documentProcessingService.normalizeText).toHaveBeenCalledWith(
      expect.stringContaining("texto extraído del archivo"),
    );
  });

  it("calls flashCardRepository.findAll for deduplication when categoryId is provided", async () => {
    const { service, flashCardRepository } = buildService({
      groqOverrides: {
        generateFlashCards: jest.fn().mockResolvedValue(RAW_AI_CARDS),
      },
    });
    await service.processInput({
      text: "contenido",
      quantity: 2,
      userId: VALID_USER_ID,
      categoryId: VALID_CATEGORY_ID,
    });
    expect(flashCardRepository.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: VALID_USER_ID,
        categoryId: VALID_CATEGORY_ID,
      }),
    );
  });

  it("skips deduplication fetch when categoryId is not provided", async () => {
    const { service, flashCardRepository } = buildService({
      groqOverrides: {
        generateFlashCards: jest.fn().mockResolvedValue(RAW_AI_CARDS),
      },
    });
    await service.processInput({
      text: "contenido",
      quantity: 2,
      userId: VALID_USER_ID,
    });
    expect(flashCardRepository.findAll).not.toHaveBeenCalled();
  });

  it("invokes onProgress callback at key stages", async () => {
    const { service } = buildService({
      groqOverrides: {
        generateFlashCards: jest.fn().mockResolvedValue(RAW_AI_CARDS),
      },
    });
    const onProgress = jest.fn();
    await service.processInput({
      text: "contenido",
      quantity: 2,
      userId: VALID_USER_ID,
      onProgress,
    });
    expect(onProgress).toHaveBeenCalled();
    const stages = onProgress.mock.calls.map((c) => c[0].stage);
    expect(stages).toContain("Preparando contenido");
    expect(stages).toContain("Flashcards listas");
  });

  it("continues generation even when deduplication fetch fails", async () => {
    const { service } = buildService({
      groqOverrides: {
        generateFlashCards: jest.fn().mockResolvedValue(RAW_AI_CARDS),
      },
      repoOverrides: {
        findAll: jest.fn().mockRejectedValue(new Error("DB error")),
      },
    });
    // Should not throw
    const result = await service.processInput({
      text: "contenido",
      quantity: 2,
      userId: VALID_USER_ID,
      categoryId: VALID_CATEGORY_ID,
    });
    expect(result).toHaveLength(2);
  });

  it("uses processLargeDocument when content exceeds MAX_CONTENT_LENGTH", async () => {
    const { service, documentProcessingService } = buildService({
      groqOverrides: {
        generateFlashCards: jest.fn().mockResolvedValue(RAW_AI_CARDS),
      },
      docOverrides: {
        normalizeText: jest.fn((t) => t),
        validateAndTruncateContent: jest.fn((t) => t),
        buildStudyContext: jest.fn().mockResolvedValue("contexto largo"),
      },
    });
    const longText = "a".repeat(5000); // > MAX_CONTENT_LENGTH (4500)
    await service.processInput({
      text: longText,
      quantity: 2,
      userId: VALID_USER_ID,
    });
    expect(documentProcessingService.buildStudyContext).toHaveBeenCalled();
  });
});

// ── shouldPreferAsync ─────────────────────────────────────────────────────────

describe("FlashCardService.shouldPreferAsync()", () => {
  it("returns false for short text", () => {
    const { service } = buildService();
    expect(service.shouldPreferAsync({ text: "corto" })).toBe(false);
  });

  it("returns true when text length equals threshold (5000)", () => {
    const { service } = buildService();
    const text = "a".repeat(5000);
    expect(service.shouldPreferAsync({ text })).toBe(true);
  });

  it("returns true when text is long", () => {
    const { service } = buildService();
    expect(service.shouldPreferAsync({ text: "a".repeat(10000) })).toBe(true);
  });

  it("factors in file size (file.size / 2) towards threshold", () => {
    const { service } = buildService();
    // file.size = 10000 → contributes 5000 chars, which meets threshold
    expect(service.shouldPreferAsync({ file: { size: 10000 }, text: "" })).toBe(
      true,
    );
  });

  it("returns false when neither file nor text is provided", () => {
    const { service } = buildService();
    expect(service.shouldPreferAsync({})).toBe(false);
  });
});

// ── processLargeDocument ─────────────────────────────────────────────────────

describe("FlashCardService.processLargeDocument()", () => {
  it("delegates to documentProcessingService.buildStudyContext", async () => {
    const { service, documentProcessingService } = buildService();
    await service.processLargeDocument("contenido largo");
    expect(documentProcessingService.buildStudyContext).toHaveBeenCalledWith(
      "contenido largo",
      expect.anything(),
      expect.objectContaining({ maxLength: expect.any(Number) }),
    );
  });

  it("returns the result from buildStudyContext", async () => {
    const { service } = buildService({
      docOverrides: {
        buildStudyContext: jest.fn().mockResolvedValue("resultado"),
        normalizeText: jest.fn((t) => t),
        validateAndTruncateContent: jest.fn((t) => t),
      },
    });
    const result = await service.processLargeDocument("contenido");
    expect(result).toBe("resultado");
  });

  it("forwards onProgress events from buildStudyContext", async () => {
    const onProgress = jest.fn();
    const { service } = buildService({
      docOverrides: {
        buildStudyContext: jest.fn(
          (_content, _groq, { onProgress: innerCb }) => {
            innerCb({ stage: "Resumiendo", percent: 50 });
            return Promise.resolve("ok");
          },
        ),
        normalizeText: jest.fn((t) => t),
        validateAndTruncateContent: jest.fn((t) => t),
      },
    });
    await service.processLargeDocument("contenido", { onProgress });
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "Resumiendo", percent: 50 }),
    );
  });
});

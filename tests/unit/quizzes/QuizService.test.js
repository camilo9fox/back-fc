/**
 * Unit tests — QuizService
 * Covers createQuiz, getQuizById, updateQuiz, deleteQuiz and validation paths.
 * generateQuiz (Groq) uses a mock to avoid real API calls.
 */

const QuizService = require("../../../src/modules/quizzes/services/QuizService");
const {
  ValidationError,
  NotFoundError,
} = require("../../../src/shared/errors/AppError");
const {
  VALID_USER_ID,
  VALID_CATEGORY_ID,
  validQuizInput,
  savedQuiz,
  validCategory,
} = require("../../__mocks__/fixtures");

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService({
  repoOverrides = {},
  categoryOverrides = {},
  groqOverrides = {},
} = {}) {
  const quizRepository = {
    create: jest.fn().mockResolvedValue(savedQuiz),
    findAllByUser: jest.fn().mockResolvedValue([savedQuiz]),
    findById: jest.fn().mockResolvedValue(savedQuiz),
    update: jest.fn().mockResolvedValue(savedQuiz),
    delete: jest.fn().mockResolvedValue(true),
    addQuestion: jest.fn().mockResolvedValue({}),
    ...repoOverrides,
  };
  const categoryService = {
    getCategoryById: jest.fn().mockResolvedValue(validCategory),
    ...categoryOverrides,
  };
  const groqService = {
    generateQuizQuestions: jest.fn().mockResolvedValue([]),
    ...groqOverrides,
  };
  const fileService = {
    extractText: jest.fn().mockResolvedValue("texto del archivo"),
  };
  const documentProcessingService = {
    buildStudyContext: jest.fn().mockResolvedValue("contexto procesado"),
    normalizeText: jest.fn((t) => t),
    validateAndTruncateContent: jest.fn((t) => t),
  };

  return {
    service: new QuizService(
      quizRepository,
      categoryService,
      groqService,
      fileService,
      documentProcessingService,
    ),
    quizRepository,
    categoryService,
    groqService,
  };
}

// ── createQuiz ────────────────────────────────────────────────────────────────

describe("QuizService.createQuiz()", () => {
  it("creates and returns a quiz with valid data", async () => {
    const { service, quizRepository } = buildService();
    const result = await service.createQuiz(validQuizInput, VALID_USER_ID);
    expect(quizRepository.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual(savedQuiz);
  });

  it("throws ValidationError when title is missing", async () => {
    const { service } = buildService();
    await expect(
      service.createQuiz({ ...validQuizInput, title: "" }, VALID_USER_ID),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when questions array is empty", async () => {
    const { service } = buildService();
    await expect(
      service.createQuiz({ ...validQuizInput, questions: [] }, VALID_USER_ID),
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError when category does not exist", async () => {
    const { service } = buildService({
      categoryOverrides: { getCategoryById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.createQuiz(validQuizInput, VALID_USER_ID),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── getQuizById ───────────────────────────────────────────────────────────────

describe("QuizService.getQuizById()", () => {
  it("returns the quiz when found", async () => {
    const { service } = buildService();
    const result = await service.getQuizById(savedQuiz.id, VALID_USER_ID);
    expect(result).toEqual(savedQuiz);
  });

  it("throws NotFoundError when quiz does not exist", async () => {
    const { service } = buildService({
      repoOverrides: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.getQuizById("nonexistent", VALID_USER_ID),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── updateQuiz ────────────────────────────────────────────────────────────────

describe("QuizService.updateQuiz()", () => {
  it("updates and returns the quiz", async () => {
    const { service } = buildService();
    const result = await service.updateQuiz(savedQuiz.id, VALID_USER_ID, {
      title: "Nuevo título",
    });
    expect(result).toEqual(savedQuiz);
  });

  it("throws NotFoundError when quiz does not exist", async () => {
    const { service } = buildService({
      repoOverrides: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.updateQuiz("nonexistent", VALID_USER_ID, {}),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── deleteQuiz ────────────────────────────────────────────────────────────────

describe("QuizService.deleteQuiz()", () => {
  it("deletes the quiz when it exists", async () => {
    const { service, quizRepository } = buildService();
    await service.deleteQuiz(savedQuiz.id, VALID_USER_ID);
    expect(quizRepository.delete).toHaveBeenCalledWith(
      savedQuiz.id,
      VALID_USER_ID,
    );
  });

  it("throws NotFoundError when quiz does not exist", async () => {
    const { service } = buildService({
      repoOverrides: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.deleteQuiz("nonexistent", VALID_USER_ID),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── addQuestion ───────────────────────────────────────────────────────────────

describe("QuizService.addQuestion()", () => {
  const validQuestion = {
    question: "¿Capital de Francia?",
    options: ["Madrid", "París", "Roma"],
    correctAnswer: "París",
    explanation: null,
    orderIndex: 0,
  };

  it("adds a valid question to an existing quiz", async () => {
    const { service, quizRepository } = buildService();
    await service.addQuestion(savedQuiz.id, VALID_USER_ID, validQuestion);
    expect(quizRepository.addQuestion).toHaveBeenCalledTimes(1);
  });

  it("throws ValidationError when correctAnswer is not in options", async () => {
    const { service } = buildService();
    await expect(
      service.addQuestion(savedQuiz.id, VALID_USER_ID, {
        ...validQuestion,
        correctAnswer: "Berlín",
      }),
    ).rejects.toThrow(ValidationError);
  });
});

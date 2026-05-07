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
    updateQuestion: jest.fn().mockResolvedValue({}),
    deleteQuestion: jest.fn().mockResolvedValue(true),
    publish: jest.fn().mockResolvedValue(savedQuiz),
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
    fileService,
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

// ── generateQuiz ──────────────────────────────────────────────────────────────

describe("QuizService.generateQuiz()", () => {
  const baseParams = {
    text: "Las capitales de Europa.",
    title: "Capitales",
    categoryId: VALID_CATEGORY_ID,
    quantity: 3,
    userId: VALID_USER_ID,
  };

  const rawQuestions = [
    {
      question: "¿Capital de Francia?",
      options: ["Madrid", "París"],
      correct_answer: "París",
      explanation: null,
    },
    {
      question: "¿Capital de España?",
      options: ["Madrid", "París"],
      correct_answer: "Madrid",
      explanation: null,
    },
    {
      question: "¿Capital de Italia?",
      options: ["Roma", "Milán"],
      correct_answer: "Roma",
      explanation: null,
    },
  ];

  it("returns mapped question objects on happy path", async () => {
    const { service } = buildService({
      groqOverrides: {
        generateQuizQuestions: jest.fn().mockResolvedValue(rawQuestions),
      },
    });
    const result = await service.generateQuiz(baseParams);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      question: expect.any(String),
      options: expect.any(Array),
    });
  });

  it("throws ValidationError when neither file nor text is provided", async () => {
    const { service } = buildService();
    await expect(
      service.generateQuiz({ ...baseParams, text: "  ", file: undefined }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when title is missing", async () => {
    const { service } = buildService();
    await expect(
      service.generateQuiz({ ...baseParams, title: "" }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when categoryId is missing", async () => {
    const { service } = buildService();
    await expect(
      service.generateQuiz({ ...baseParams, categoryId: null }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError when category does not exist", async () => {
    const { service } = buildService({
      categoryOverrides: { getCategoryById: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.generateQuiz(baseParams)).rejects.toThrow(
      require("../../../src/shared/errors/AppError").NotFoundError,
    );
  });

  it("extracts text from file when file is provided instead of text", async () => {
    const { service, fileService } = buildService({
      groqOverrides: {
        generateQuizQuestions: jest.fn().mockResolvedValue(rawQuestions),
      },
    });
    const fakeFile = { originalname: "doc.pdf", size: 512 };
    await service.generateQuiz({
      ...baseParams,
      text: undefined,
      file: fakeFile,
    });
    expect(fileService.extractText).toHaveBeenCalledWith(fakeFile);
  });

  it("calls onProgress at key stages", async () => {
    const onProgress = jest.fn();
    const { service } = buildService({
      groqOverrides: {
        generateQuizQuestions: jest.fn().mockResolvedValue(rawQuestions),
      },
    });
    await service.generateQuiz({ ...baseParams, onProgress });
    expect(onProgress).toHaveBeenCalled();
  });

  it("continues generation when existing questions fetch fails", async () => {
    const { service } = buildService({
      repoOverrides: {
        findAllByUser: jest.fn().mockRejectedValue(new Error("DB error")),
      },
      groqOverrides: {
        generateQuizQuestions: jest.fn().mockResolvedValue(rawQuestions),
      },
    });
    const result = await service.generateQuiz(baseParams);
    expect(result).toHaveLength(3);
  });
});

// ── getQuizzes ────────────────────────────────────────────────────────────────

describe("QuizService.getQuizzes()", () => {
  it("delegates to quizRepository.findAllByUser", async () => {
    const { service, quizRepository } = buildService();
    const result = await service.getQuizzes(VALID_USER_ID, {
      categoryId: VALID_CATEGORY_ID,
    });
    expect(quizRepository.findAllByUser).toHaveBeenCalledWith(VALID_USER_ID, {
      categoryId: VALID_CATEGORY_ID,
    });
    expect(result).toEqual([savedQuiz]);
  });
});

// ── updateQuiz — category validation ─────────────────────────────────────────

describe("QuizService.updateQuiz() — category validation", () => {
  it("throws NotFoundError when new categoryId does not exist", async () => {
    const { service } = buildService({
      categoryOverrides: { getCategoryById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.updateQuiz(savedQuiz.id, VALID_USER_ID, {
        categoryId: "cat-new",
      }),
    ).rejects.toThrow(
      require("../../../src/shared/errors/AppError").NotFoundError,
    );
  });

  it("updates successfully when new categoryId is valid", async () => {
    const { service } = buildService();
    const result = await service.updateQuiz(savedQuiz.id, VALID_USER_ID, {
      categoryId: VALID_CATEGORY_ID,
      title: "Nuevo título",
    });
    expect(result).toEqual(savedQuiz);
  });
});

// ── updateQuestion ────────────────────────────────────────────────────────────

describe("QuizService.updateQuestion()", () => {
  const validQuestion = {
    question: "¿Capital de Portugal?",
    options: ["Lisboa", "Oporto"],
    correctAnswer: "Lisboa",
    explanation: "Lisboa es la capital.",
    orderIndex: 1,
  };

  it("updates a valid question via repository", async () => {
    const { service, quizRepository } = buildService({
      repoOverrides: {
        updateQuestion: jest.fn().mockResolvedValue(validQuestion),
      },
    });
    await service.updateQuestion("qq-001", VALID_USER_ID, validQuestion);
    expect(quizRepository.updateQuestion).toHaveBeenCalledTimes(1);
  });

  it("throws ValidationError when correctAnswer is not in options", async () => {
    const { service } = buildService();
    await expect(
      service.updateQuestion("qq-001", VALID_USER_ID, {
        ...validQuestion,
        correctAnswer: "Madrid",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("accepts correct_answer field as alias for correctAnswer", async () => {
    const { service, quizRepository } = buildService({
      repoOverrides: {
        updateQuestion: jest.fn().mockResolvedValue({}),
      },
    });
    await service.updateQuestion("qq-001", VALID_USER_ID, {
      question: "¿Capital?",
      options: ["A", "B"],
      correct_answer: "A",
    });
    expect(quizRepository.updateQuestion).toHaveBeenCalledTimes(1);
  });
});

// ── deleteQuestion ────────────────────────────────────────────────────────────

describe("QuizService.deleteQuestion()", () => {
  it("delegates to quizRepository.deleteQuestion", async () => {
    const { service, quizRepository } = buildService({
      repoOverrides: {
        deleteQuestion: jest.fn().mockResolvedValue(true),
      },
    });
    await service.deleteQuestion("qq-001", VALID_USER_ID);
    expect(quizRepository.deleteQuestion).toHaveBeenCalledWith(
      "qq-001",
      VALID_USER_ID,
    );
  });
});

// ── publish ───────────────────────────────────────────────────────────────────

describe("QuizService.publish()", () => {
  it("delegates to quizRepository.publish", async () => {
    const { service, quizRepository } = buildService({
      repoOverrides: {
        publish: jest.fn().mockResolvedValue(savedQuiz),
      },
    });
    await service.publish(savedQuiz.id, VALID_USER_ID, true);
    expect(quizRepository.publish).toHaveBeenCalledWith(
      savedQuiz.id,
      VALID_USER_ID,
      true,
    );
  });
});

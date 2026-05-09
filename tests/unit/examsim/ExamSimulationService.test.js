/**
 * Unit tests — ExamSimulationService
 * Covers pure helpers (pickRandom, buildDevelopmentContext, truncateContext,
 * areEquivalentAnswers, scoreDevelopmentQuestion, etc.) and the main
 * async flows (createSimulation, generateSimulation, getSimulations,
 * getSimulationById, deleteSimulation).
 */

const ExamSimulationService = require("../../../src/modules/examsim/services/ExamSimulationService");
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

const savedSimulation = {
  id: "exam-001",
  userId: VALID_USER_ID,
  title: "Examen Final",
};

const questionBank = {
  trueFalseQuestions: [
    { statement: "La Tierra es redonda.", is_true: true, explanation: null },
    {
      statement: "El sol es una planeta.",
      is_true: false,
      explanation: "Es una estrella.",
    },
  ],
  multipleChoiceQuestions: [
    {
      question: "¿Capital de Francia?",
      options: ["Madrid", "París", "Roma"],
      correct_answer: "París",
      explanation: null,
    },
  ],
};

function buildService(overrides = {}) {
  const examSimulationRepository = {
    create: jest.fn().mockResolvedValue(savedSimulation),
    findAllByUser: jest.fn().mockResolvedValue([savedSimulation]),
    findById: jest.fn().mockResolvedValue(savedSimulation),
    delete: jest.fn().mockResolvedValue(true),
    ensureOwnership: jest.fn().mockResolvedValue(undefined),
    listQuestionBankByCategory: jest.fn().mockResolvedValue(questionBank),
    ...(overrides.repoOverrides || {}),
  };
  const categoryService = {
    getCategoryById: jest.fn().mockResolvedValue(validCategory),
    ...(overrides.categoryOverrides || {}),
  };
  const trueFalseGenerationService = {
    generateTrueFalseStatements: jest.fn().mockResolvedValue([]),
    ...(overrides.tfOverrides || {}),
  };
  const examSimulationGenerationService = {
    generateDevelopmentQuestions: jest.fn().mockResolvedValue([
      {
        prompt: "Explica la mitosis.",
        evaluation_criteria: "Debe incluir fases.",
        max_points: 5,
      },
    ]),
    buildStudyContext: jest.fn().mockResolvedValue("contexto de estudio"),
    ...(overrides.genOverrides || {}),
  };
  const fileService = {
    extractText: jest.fn().mockResolvedValue("texto del archivo"),
    ...(overrides.fileOverrides || {}),
  };
  const documentProcessingService = {
    buildStudyContext: jest.fn().mockResolvedValue("contexto procesado"),
    ...(overrides.docOverrides || {}),
  };

  return {
    service: new ExamSimulationService(
      examSimulationRepository,
      categoryService,
      trueFalseGenerationService,
      examSimulationGenerationService,
      fileService,
      documentProcessingService,
    ),
    examSimulationRepository,
    categoryService,
    fileService,
  };
}

// ── pickRandom ────────────────────────────────────────────────────────────────

describe("ExamSimulationService.pickRandom()", () => {
  let service;
  beforeEach(() => ({ service } = buildService()));

  it("returns the exact count requested", () => {
    const items = [1, 2, 3, 4, 5];
    expect(service.pickRandom(items, 3)).toHaveLength(3);
  });

  it("returns all items when target >= length", () => {
    const items = [1, 2, 3];
    expect(service.pickRandom(items, 10)).toHaveLength(3);
  });

  it("returns empty array when target is 0", () => {
    expect(service.pickRandom([1, 2, 3], 0)).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(service.pickRandom([], 5)).toHaveLength(0);
  });

  it("does not mutate the original array", () => {
    const items = [1, 2, 3, 4, 5];
    const copy = [...items];
    service.pickRandom(items, 3);
    expect(items).toEqual(copy);
  });

  it("handles non-array input gracefully", () => {
    expect(service.pickRandom(null, 3)).toHaveLength(0);
  });
});

// ── buildDevelopmentContext ───────────────────────────────────────────────────

describe("ExamSimulationService.buildDevelopmentContext()", () => {
  let service;
  beforeEach(() => ({ service } = buildService()));

  it("includes TF and MC bank sections", () => {
    const result = service.buildDevelopmentContext(
      questionBank.trueFalseQuestions,
      questionBank.multipleChoiceQuestions,
    );
    expect(result).toContain("Banco V/F");
    expect(result).toContain("Banco de alternativas");
  });

  it("returns empty string when both arrays are empty", () => {
    expect(service.buildDevelopmentContext([], [])).toBe("");
  });

  it("only includes TF section when no MC questions", () => {
    const result = service.buildDevelopmentContext(
      questionBank.trueFalseQuestions,
      [],
    );
    expect(result).toContain("Banco V/F");
    expect(result).not.toContain("Banco de alternativas");
  });

  it("formats TF answers as Verdadero/Falso", () => {
    const result = service.buildDevelopmentContext(
      questionBank.trueFalseQuestions,
      [],
    );
    expect(result).toContain("Verdadero");
    expect(result).toContain("Falso");
  });
});

// ── truncateContext ───────────────────────────────────────────────────────────

describe("ExamSimulationService.truncateContext()", () => {
  let service;
  beforeEach(() => ({ service } = buildService()));

  it("returns the text unchanged when below maxChars", () => {
    const text = "short text";
    expect(service.truncateContext(text, 100)).toBe("short text");
  });

  it("truncates to maxChars and appends truncation notice", () => {
    const text = "a".repeat(200);
    const result = service.truncateContext(text, 100);
    expect(result).toContain("[Contexto truncado por longitud]");
    expect(result.length).toBeLessThan(text.length);
  });

  it("returns empty string for empty input", () => {
    expect(service.truncateContext("")).toBe("");
  });
});

// ── areEquivalentAnswers ──────────────────────────────────────────────────────

describe("ExamSimulationService.areEquivalentAnswers()", () => {
  let service;
  beforeEach(() => ({ service } = buildService()));

  it("returns true for identical strings", () => {
    expect(service.areEquivalentAnswers("París", "París")).toBe(true);
  });

  it("returns true for strings that differ only in case", () => {
    expect(service.areEquivalentAnswers("PARIS", "paris")).toBe(true);
  });

  it("returns false for different answers", () => {
    expect(service.areEquivalentAnswers("Madrid", "París")).toBe(false);
  });

  it("returns falsy when either is empty", () => {
    expect(service.areEquivalentAnswers("", "París")).toBeFalsy();
    expect(service.areEquivalentAnswers("París", "")).toBeFalsy();
  });
});

// ── scoreDevelopmentQuestion ──────────────────────────────────────────────────

describe("ExamSimulationService.scoreDevelopmentQuestion()", () => {
  let service;
  beforeEach(() => ({ service } = buildService()));

  it("returns 0 for an empty answer", () => {
    expect(
      service.scoreDevelopmentQuestion("", "La mitosis divide la célula.", 5),
    ).toBe(0);
  });

  it("returns a value between 0 and maxPoints", () => {
    const score = service.scoreDevelopmentQuestion(
      "La mitosis divide la célula en dos células hijas.",
      "La mitosis divide la célula en dos células hijas idénticas.",
      10,
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(10);
  });

  it("awards partial credit for partial answers", () => {
    const full = service.scoreDevelopmentQuestion(
      "La mitosis divide la célula en dos células hijas idénticas con el mismo material genético.",
      "La mitosis divide la célula en dos células hijas idénticas con el mismo material genético.",
      10,
    );
    const partial = service.scoreDevelopmentQuestion(
      "mitosis celula",
      "La mitosis divide la célula en dos células hijas idénticas con el mismo material genético.",
      10,
    );
    expect(full).toBeGreaterThanOrEqual(partial);
  });
});

// ── createSimulation ──────────────────────────────────────────────────────────

describe("ExamSimulationService.createSimulation()", () => {
  const validCreateInput = {
    title: "Examen de Biología",
    categoryId: VALID_CATEGORY_ID,
    durationMinutes: 60,
    trueFalseQuestions: [{ statement: "La Tierra es redonda.", is_true: true }],
    multipleChoiceQuestions: [],
    developmentQuestions: [],
  };

  it("creates and returns a simulation record", async () => {
    const { service } = buildService();
    const result = await service.createSimulation(
      validCreateInput,
      VALID_USER_ID,
    );
    expect(result).toEqual(savedSimulation);
  });

  it("throws NotFoundError when category does not exist", async () => {
    const { service } = buildService({
      categoryOverrides: { getCategoryById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.createSimulation(validCreateInput, VALID_USER_ID),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── generateSimulation ────────────────────────────────────────────────────────

describe("ExamSimulationService.generateSimulation()", () => {
  const baseParams = {
    text: "Material de estudio sobre biología.",
    title: "Simulación Final",
    categoryId: VALID_CATEGORY_ID,
    trueFalseCount: 2,
    quizCount: 1,
    developmentCount: 1,
    durationMinutes: 60,
    userId: VALID_USER_ID,
  };

  it("returns simulation object on happy path", async () => {
    const { service } = buildService();
    const result = await service.generateSimulation(baseParams);
    expect(result.title).toBe("Simulación Final");
    expect(result.trueFalseQuestions).toBeDefined();
    expect(result.multipleChoiceQuestions).toBeDefined();
    expect(result.developmentQuestions).toBeDefined();
  });

  it("throws ValidationError when title is missing", async () => {
    const { service } = buildService();
    await expect(
      service.generateSimulation({ ...baseParams, title: "" }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when categoryId is missing", async () => {
    const { service } = buildService();
    await expect(
      service.generateSimulation({ ...baseParams, categoryId: null }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError when category does not exist", async () => {
    const { service } = buildService({
      categoryOverrides: { getCategoryById: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.generateSimulation(baseParams)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("throws ValidationError when question bank is empty and no file/text", async () => {
    const { service } = buildService({
      repoOverrides: {
        listQuestionBankByCategory: jest.fn().mockResolvedValue({
          trueFalseQuestions: [],
          multipleChoiceQuestions: [],
        }),
      },
    });
    await expect(
      service.generateSimulation({ ...baseParams, text: "", file: undefined }),
    ).rejects.toThrow(ValidationError);
  });

  it("clamps trueFalseCount to 1 minimum", async () => {
    const { service, examSimulationRepository } = buildService();
    await service.generateSimulation({ ...baseParams, trueFalseCount: -5 });
    // service should not throw — just clamp to 1
    expect(
      examSimulationRepository.listQuestionBankByCategory,
    ).toHaveBeenCalled();
  });

  it("calls onProgress at key stages", async () => {
    const onProgress = jest.fn();
    const { service } = buildService();
    await service.generateSimulation({ ...baseParams, onProgress });
    expect(onProgress).toHaveBeenCalled();
  });
});

// ── getSimulations ────────────────────────────────────────────────────────────

describe("ExamSimulationService.getSimulations()", () => {
  it("delegates to repository", async () => {
    const { service, examSimulationRepository } = buildService();
    const result = await service.getSimulations(VALID_USER_ID, {});
    expect(examSimulationRepository.findAllByUser).toHaveBeenCalledWith(
      VALID_USER_ID,
      {},
    );
    expect(result).toEqual([savedSimulation]);
  });
});

// ── getSimulationById ─────────────────────────────────────────────────────────

describe("ExamSimulationService.getSimulationById()", () => {
  it("returns the simulation when found", async () => {
    const { service } = buildService();
    const result = await service.getSimulationById("exam-001", VALID_USER_ID);
    expect(result).toEqual(savedSimulation);
  });

  it("throws NotFoundError when simulation does not exist", async () => {
    const { service } = buildService({
      repoOverrides: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.getSimulationById("nonexistent", VALID_USER_ID),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── deleteSimulation ──────────────────────────────────────────────────────────

describe("ExamSimulationService.deleteSimulation()", () => {
  it("checks ownership then deletes", async () => {
    const { service, examSimulationRepository } = buildService();
    await service.deleteSimulation("exam-001", VALID_USER_ID);
    expect(examSimulationRepository.ensureOwnership).toHaveBeenCalledWith(
      "exam-001",
      VALID_USER_ID,
    );
    expect(examSimulationRepository.delete).toHaveBeenCalledWith(
      "exam-001",
      VALID_USER_ID,
    );
  });
});

// ── conceptAppearsInAnswer ────────────────────────────────────────────────────

describe("ExamSimulationService.conceptAppearsInAnswer()", () => {
  let service;
  beforeEach(() => ({ service } = buildService()));

  it("returns true when concept appears as phrase", () => {
    expect(
      service.conceptAppearsInAnswer(
        "La mitosis divide la célula",
        "mitosis divide",
      ),
    ).toBe(true);
  });

  it("returns false when concept is absent", () => {
    expect(
      service.conceptAppearsInAnswer("La meiosis ocurre en gametos", "mitosis"),
    ).toBe(false);
  });

  it("returns false for empty inputs", () => {
    expect(service.conceptAppearsInAnswer("", "mitosis")).toBe(false);
    expect(service.conceptAppearsInAnswer("texto", "")).toBe(false);
  });
});

// ── hasFullCriteriaCoverage ───────────────────────────────────────────────────

describe("ExamSimulationService.hasFullCriteriaCoverage()", () => {
  let service;
  beforeEach(() => ({ service } = buildService()));

  it("returns true when all required concepts appear in answer", () => {
    const result = service.hasFullCriteriaCoverage(
      "La mitosis incluye profase, metafase, anafase y telofase.",
      "incluyendo profase, metafase, anafase, telofase",
    );
    expect(result).toBe(true);
  });

  it("returns false when criteria text is empty", () => {
    expect(service.hasFullCriteriaCoverage("any answer", "")).toBe(false);
  });
});

// ── buildAttemptIndex ─────────────────────────────────────────────────────────

describe("ExamSimulationService.buildAttemptIndex()", () => {
  let service;
  beforeEach(() => ({ service } = buildService()));

  it("indexes items by idKey", () => {
    const items = [
      { questionId: "q1", answer: "A" },
      { questionId: "q2", answer: "B" },
    ];
    const map = service.buildAttemptIndex(items, "questionId");
    expect(map.get("q1")).toMatchObject({ answer: "A" });
    expect(map.get("q2")).toMatchObject({ answer: "B" });
  });

  it("skips items that lack the idKey", () => {
    const items = [{ answer: "A" }, { questionId: "q2", answer: "B" }];
    const map = service.buildAttemptIndex(items, "questionId");
    expect(map.size).toBe(1);
  });

  it("returns an empty Map for an empty array", () => {
    expect(service.buildAttemptIndex([], "questionId").size).toBe(0);
  });

  it("uses default idKey 'questionId'", () => {
    const items = [{ questionId: "q1", answer: "X" }];
    const map = service.buildAttemptIndex(items);
    expect(map.get("q1")).toBeDefined();
  });
});

// ── feedbackHasNegativeMissingClaim ───────────────────────────────────────────

describe("ExamSimulationService.feedbackHasNegativeMissingClaim()", () => {
  let service;
  beforeEach(() => ({ service } = buildService()));

  it("returns true for 'no incluye conceptos'", () => {
    expect(
      service.feedbackHasNegativeMissingClaim(
        "La respuesta no incluye conceptos clave.",
      ),
    ).toBe(true);
  });

  it("returns true for 'falta información'", () => {
    expect(
      service.feedbackHasNegativeMissingClaim("falta información importante"),
    ).toBe(true);
  });

  it("returns false for positive feedback", () => {
    expect(
      service.feedbackHasNegativeMissingClaim("Excelente respuesta."),
    ).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(service.feedbackHasNegativeMissingClaim("")).toBe(false);
  });
});

// ── buildSanitizedAiFeedback ──────────────────────────────────────────────────

describe("ExamSimulationService.buildSanitizedAiFeedback()", () => {
  let service;
  beforeEach(() => ({ service } = buildService()));

  it("returns base feedback when no contradictions and no guardrail", () => {
    const result = service.buildSanitizedAiFeedback({
      feedback: "Buena respuesta.",
    });
    expect(result).toBe("Buena respuesta.");
  });

  it("returns null when feedback is empty and no notes", () => {
    const result = service.buildSanitizedAiFeedback({ feedback: "" });
    expect(result).toBeNull();
  });

  it("adds guardrail note when guardrailApplied=true", () => {
    const result = service.buildSanitizedAiFeedback({
      feedback: "Respuesta incompleta.",
      guardrailApplied: true,
    });
    expect(result).toContain("verificacion automatica");
  });

  it("adds contradiction note when contradictoryConcepts is non-empty", () => {
    const result = service.buildSanitizedAiFeedback({
      feedback: "La respuesta no menciona mitosis.",
      contradictoryConcepts: ["mitosis"],
    });
    expect(result).toContain("SI menciona");
    expect(result).toContain("mitosis");
  });

  it("replaces base when contradictions present and feedback has negative claim", () => {
    const result = service.buildSanitizedAiFeedback({
      feedback: "no incluye los conceptos principales",
      contradictoryConcepts: ["concepto"],
    });
    // Base should be replaced; note added
    expect(result).not.toContain("no incluye los conceptos principales");
    expect(result).toContain("SI menciona");
  });
});

// ── softenFeedbackForHighScore ────────────────────────────────────────────────

describe("ExamSimulationService.softenFeedbackForHighScore()", () => {
  let service;
  beforeEach(() => ({ service } = buildService()));

  it("returns feedback unchanged when score ratio < 0.8", () => {
    const fb = "Respuesta parcial.";
    expect(service.softenFeedbackForHighScore(fb, 7, 10)).toBe(fb);
  });

  it("prepends 'Respuesta mayormente correcta' when ratio >= 0.8 and harsh tone", () => {
    const fb = "Respuesta parcial e insuficiente.";
    const result = service.softenFeedbackForHighScore(fb, 9, 10);
    expect(result).toContain("Respuesta mayormente correcta");
    expect(result).toContain(fb);
  });

  it("returns feedback unchanged when no undervaluing tone detected", () => {
    const fb = "Buena respuesta. Incluye los conceptos correctos.";
    const result = service.softenFeedbackForHighScore(fb, 9, 10);
    expect(result).toBe(fb);
  });

  it("returns empty string for empty feedback", () => {
    expect(service.softenFeedbackForHighScore("", 10, 10)).toBe("");
  });

  it("returns feedback unchanged when maxPoints is 0", () => {
    const fb = "parcial";
    expect(service.softenFeedbackForHighScore(fb, 0, 0)).toBe(fb);
  });
});

// ── scoreDevelopmentWithAi ────────────────────────────────────────────────────

describe("ExamSimulationService.scoreDevelopmentWithAi()", () => {
  it("returns heuristic breakdown when all answers are empty", async () => {
    const { service } = buildService();
    const questions = [
      {
        id: "q1",
        prompt: "P.",
        reference_answer: "R.",
        evaluation_criteria: null,
        max_points: 5,
      },
    ];
    const devAnswers = new Map([["q1", { answer: "" }]]);
    const result = await service.scoreDevelopmentWithAi(questions, devAnswers);
    expect(result).toHaveLength(1);
    expect(result[0].gradingSource).toBe("heuristic");
    expect(result[0].points).toBe(0);
  });

  it("returns AI-enhanced breakdown when answer is non-empty", async () => {
    const { service } = buildService({
      genOverrides: {
        generateDevelopmentQuestions: jest.fn().mockResolvedValue([]),
        evaluateDevelopmentAnswers: jest.fn().mockResolvedValue([
          {
            questionId: "q1",
            points: 4,
            feedback: "Buena respuesta.",
            strengths: ["mitosis explicada"],
            missingConcepts: [],
          },
        ]),
        buildStudyContext: jest.fn().mockResolvedValue("ctx"),
      },
    });
    const questions = [
      {
        id: "q1",
        prompt: "Explica la mitosis.",
        reference_answer: "La mitosis divide la célula.",
        evaluation_criteria: null,
        max_points: 5,
      },
    ];
    const devAnswers = new Map([
      ["q1", { answer: "La mitosis es un proceso de división celular" }],
    ]);
    const result = await service.scoreDevelopmentWithAi(questions, devAnswers);
    expect(result[0].gradingSource).toBe("ai");
    expect(result[0].aiFeedback).toBeDefined();
  });

  it("falls back to heuristic when AI evaluation throws", async () => {
    const { service } = buildService({
      genOverrides: {
        generateDevelopmentQuestions: jest.fn().mockResolvedValue([]),
        evaluateDevelopmentAnswers: jest
          .fn()
          .mockRejectedValue(new Error("AI timeout")),
        buildStudyContext: jest.fn().mockResolvedValue("ctx"),
      },
    });
    const questions = [
      {
        id: "q1",
        prompt: "P.",
        reference_answer: "R.",
        evaluation_criteria: null,
        max_points: 5,
      },
    ];
    const devAnswers = new Map([["q1", { answer: "Respuesta de ejemplo" }]]);
    const result = await service.scoreDevelopmentWithAi(questions, devAnswers);
    expect(result[0].gradingSource).toBe("heuristic");
  });
});

// ── submitSimulation ──────────────────────────────────────────────────────────

describe("ExamSimulationService.submitSimulation()", () => {
  const fullSimulation = {
    id: "exam-001",
    userId: VALID_USER_ID,
    title: "Examen Final",
    trueFalseQuestions: [
      { id: "tf-1", statement: "La Tierra es redonda.", is_true: true },
    ],
    multipleChoiceQuestions: [
      {
        id: "mc-1",
        question: "¿Capital?",
        options: ["Madrid", "París"],
        correct_answer: "París",
      },
    ],
    developmentQuestions: [
      {
        id: "dev-1",
        prompt: "Explica mitosis.",
        reference_answer: "División celular",
        evaluation_criteria: null,
        max_points: 5,
      },
    ],
  };

  it("scores TF, MC and development questions and returns attempt", async () => {
    const { service } = buildService({
      repoOverrides: {
        create: jest.fn().mockResolvedValue(fullSimulation),
        findById: jest.fn().mockResolvedValue(fullSimulation),
        findAllByUser: jest.fn().mockResolvedValue([fullSimulation]),
        delete: jest.fn().mockResolvedValue(true),
        ensureOwnership: jest.fn().mockResolvedValue(undefined),
        listQuestionBankByCategory: jest.fn().mockResolvedValue(questionBank),
        createAttempt: jest
          .fn()
          .mockResolvedValue({ id: "attempt-001", score: 50 }),
      },
      genOverrides: {
        generateDevelopmentQuestions: jest.fn().mockResolvedValue([]),
        evaluateDevelopmentAnswers: jest.fn().mockResolvedValue([
          {
            questionId: "dev-1",
            points: 4,
            feedback: "Bien.",
            strengths: [],
            missingConcepts: [],
          },
        ]),
        buildStudyContext: jest.fn().mockResolvedValue("ctx"),
      },
    });

    const result = await service.submitSimulation("exam-001", VALID_USER_ID, {
      trueFalseAnswers: [{ questionId: "tf-1", answer: true }],
      multipleChoiceAnswers: [{ questionId: "mc-1", answer: "París" }],
      developmentAnswers: [
        { questionId: "dev-1", answer: "La mitosis divide la célula" },
      ],
    });

    expect(result.attemptId).toBe("attempt-001");
    expect(result.score).toBeDefined();
    expect(result.trueFalse).toHaveLength(1);
    expect(result.multipleChoice).toHaveLength(1);
  });

  it("scores MC answer as incorrect when answer does not match", async () => {
    const { service } = buildService({
      repoOverrides: {
        create: jest.fn().mockResolvedValue(fullSimulation),
        findById: jest.fn().mockResolvedValue(fullSimulation),
        findAllByUser: jest.fn().mockResolvedValue([fullSimulation]),
        delete: jest.fn().mockResolvedValue(true),
        ensureOwnership: jest.fn().mockResolvedValue(undefined),
        listQuestionBankByCategory: jest.fn().mockResolvedValue(questionBank),
        createAttempt: jest
          .fn()
          .mockResolvedValue({ id: "attempt-001", score: 0 }),
      },
      genOverrides: {
        generateDevelopmentQuestions: jest.fn().mockResolvedValue([]),
        evaluateDevelopmentAnswers: jest.fn().mockResolvedValue([]),
        buildStudyContext: jest.fn().mockResolvedValue("ctx"),
      },
    });

    const result = await service.submitSimulation("exam-001", VALID_USER_ID, {
      trueFalseAnswers: [{ questionId: "tf-1", answer: false }], // wrong
      multipleChoiceAnswers: [{ questionId: "mc-1", answer: "Madrid" }], // wrong
      developmentAnswers: [],
    });

    expect(result.trueFalse[0].correct).toBe(false);
    expect(result.multipleChoice[0].correct).toBe(false);
  });
});

// ── generateSimulation — file extraction path ─────────────────────────────────

describe("ExamSimulationService.generateSimulation() — file extraction", () => {
  it("calls fileService.extractText when file is provided", async () => {
    const { service, fileService } = buildService();
    const fakeFile = { originalname: "slides.pdf", size: 1024 };
    await service.generateSimulation({
      file: fakeFile,
      title: "Simulación",
      categoryId: VALID_CATEGORY_ID,
      trueFalseCount: 2,
      quizCount: 1,
      developmentCount: 1,
      userId: VALID_USER_ID,
    });
    expect(fileService.extractText).toHaveBeenCalledWith(fakeFile);
  });
});

// ── generateSimulation — development question fallback ────────────────────────

describe("ExamSimulationService.generateSimulation() — dev question fallback", () => {
  it("uses fallback context when primary generateDevelopmentQuestions fails", async () => {
    let callCount = 0;
    const { service } = buildService({
      genOverrides: {
        generateDevelopmentQuestions: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1)
            return Promise.reject(new Error("primary failed"));
          // Second call (fallback) succeeds
          return Promise.resolve([
            { prompt: "P.", evaluation_criteria: "", max_points: 5 },
          ]);
        }),
        buildStudyContext: jest.fn().mockResolvedValue("ctx"),
      },
    });
    const result = await service.generateSimulation({
      text: "Texto de estudio.",
      title: "Simulación",
      categoryId: VALID_CATEGORY_ID,
      trueFalseCount: 1,
      quizCount: 1,
      developmentCount: 1,
      userId: VALID_USER_ID,
    });
    expect(result.developmentQuestions).toBeDefined();
  });

  it("throws ValidationError when all fallback attempts fail", async () => {
    const { service } = buildService({
      genOverrides: {
        generateDevelopmentQuestions: jest
          .fn()
          .mockRejectedValue(new Error("All failed")),
        buildStudyContext: jest.fn().mockResolvedValue("ctx"),
      },
    });
    await expect(
      service.generateSimulation({
        text: "Texto.",
        title: "Simulación",
        categoryId: VALID_CATEGORY_ID,
        developmentCount: 1,
        userId: VALID_USER_ID,
      }),
    ).rejects.toThrow(ValidationError);
  });
});

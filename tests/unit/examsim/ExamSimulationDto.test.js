/**
 * Unit tests — ExamSimulationDto
 * Covers normalizeTrueFalseQuestion, normalizeDevelopmentQuestion,
 * normalizeMultipleChoiceQuestion and normalizeCreatePayload.
 */

const ExamSimulationDto = require("../../../src/modules/examsim/dtos/ExamSimulationDto");
const { ValidationError } = require("../../../src/shared/errors/AppError");
const { VALID_CATEGORY_ID } = require("../../__mocks__/fixtures");

// ── normalizeTrueFalseQuestion ────────────────────────────────────────────────

describe("ExamSimulationDto.normalizeTrueFalseQuestion()", () => {
  it("normalises a valid true question", () => {
    const result = ExamSimulationDto.normalizeTrueFalseQuestion(
      { statement: "La Tierra es redonda.", is_true: true },
      0,
    );
    expect(result.statement).toBe("La Tierra es redonda.");
    expect(result.is_true).toBe(true);
    expect(result.order_index).toBe(0);
  });

  it("accepts isTrue camelCase field", () => {
    const result = ExamSimulationDto.normalizeTrueFalseQuestion(
      { statement: "El cielo es azul.", isTrue: false },
      1,
    );
    expect(result.is_true).toBe(false);
    expect(result.order_index).toBe(1);
  });

  it("sets explanation to null when absent", () => {
    const result = ExamSimulationDto.normalizeTrueFalseQuestion({
      statement: "Algo.",
      is_true: true,
    });
    expect(result.explanation).toBeNull();
  });

  it("throws ValidationError when statement is empty", () => {
    expect(() =>
      ExamSimulationDto.normalizeTrueFalseQuestion({
        statement: "",
        is_true: true,
      }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when is_true is not a boolean", () => {
    expect(() =>
      ExamSimulationDto.normalizeTrueFalseQuestion({
        statement: "Enunciado.",
        is_true: "true",
      }),
    ).toThrow(ValidationError);
  });

  it("defaults order_index to 0 for non-integer orderIndex", () => {
    const result = ExamSimulationDto.normalizeTrueFalseQuestion(
      { statement: "Enunciado.", is_true: true },
      "bad",
    );
    expect(result.order_index).toBe(0);
  });
});

// ── normalizeDevelopmentQuestion ──────────────────────────────────────────────

describe("ExamSimulationDto.normalizeDevelopmentQuestion()", () => {
  it("normalises a valid development question", () => {
    const result = ExamSimulationDto.normalizeDevelopmentQuestion(
      { prompt: "Explica la mitosis.", max_points: 5 },
      0,
    );
    expect(result.prompt).toBe("Explica la mitosis.");
    expect(result.max_points).toBe(5);
  });

  it("clamps max_points to range 1-20", () => {
    const low = ExamSimulationDto.normalizeDevelopmentQuestion({
      prompt: "P.",
      max_points: 0,
    });
    expect(low.max_points).toBe(1);

    const high = ExamSimulationDto.normalizeDevelopmentQuestion({
      prompt: "P.",
      max_points: 100,
    });
    expect(high.max_points).toBe(20);
  });

  it("accepts referenceAnswer camelCase", () => {
    const result = ExamSimulationDto.normalizeDevelopmentQuestion({
      prompt: "P.",
      referenceAnswer: "R.",
    });
    expect(result.reference_answer).toBe("R.");
  });

  it("accepts evaluationCriteria camelCase", () => {
    const result = ExamSimulationDto.normalizeDevelopmentQuestion({
      prompt: "P.",
      evaluationCriteria: "C.",
    });
    expect(result.evaluation_criteria).toBe("C.");
  });

  it("throws ValidationError when prompt is empty", () => {
    expect(() =>
      ExamSimulationDto.normalizeDevelopmentQuestion({ prompt: "" }),
    ).toThrow(ValidationError);
  });
});

// ── normalizeMultipleChoiceQuestion ───────────────────────────────────────────

describe("ExamSimulationDto.normalizeMultipleChoiceQuestion()", () => {
  it("normalises a valid MC question", () => {
    const result = ExamSimulationDto.normalizeMultipleChoiceQuestion({
      question: "¿Capital de Francia?",
      options: ["Madrid", "París", "Roma"],
      correct_answer: "París",
    });
    expect(result.correct_answer).toBe("París");
    expect(result.options).toHaveLength(3);
  });

  it("normalises correct_answer case-insensitively from options", () => {
    const result = ExamSimulationDto.normalizeMultipleChoiceQuestion({
      question: "¿Pregunta?",
      options: ["Opción A", "Opción B"],
      correct_answer: "OPCIÓN A",
    });
    expect(result.correct_answer).toBe("Opción A");
  });

  it("throws ValidationError when question is empty", () => {
    expect(() =>
      ExamSimulationDto.normalizeMultipleChoiceQuestion({
        question: "",
        options: ["A", "B"],
        correct_answer: "A",
      }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when fewer than 2 options", () => {
    expect(() =>
      ExamSimulationDto.normalizeMultipleChoiceQuestion({
        question: "¿P?",
        options: ["Solo"],
        correct_answer: "Solo",
      }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when correct_answer is not in options", () => {
    expect(() =>
      ExamSimulationDto.normalizeMultipleChoiceQuestion({
        question: "¿P?",
        options: ["A", "B"],
        correct_answer: "C",
      }),
    ).toThrow(ValidationError);
  });

  it("sets explanation to null when absent", () => {
    const result = ExamSimulationDto.normalizeMultipleChoiceQuestion({
      question: "¿P?",
      options: ["A", "B"],
      correct_answer: "A",
    });
    expect(result.explanation).toBeNull();
  });
});

// ── normalizeCreatePayload ────────────────────────────────────────────────────

describe("ExamSimulationDto.normalizeCreatePayload()", () => {
  it("validates and returns the payload for a full set", () => {
    const result = ExamSimulationDto.normalizeCreatePayload({
      title: "Examen Final",
      categoryId: VALID_CATEGORY_ID,
      durationMinutes: 60,
      trueFalseQuestions: [
        { statement: "La Tierra es redonda.", is_true: true },
      ],
      multipleChoiceQuestions: [],
      developmentQuestions: [],
    });
    expect(result.title).toBe("Examen Final");
    expect(result.durationMinutes).toBe(60);
    expect(result.trueFalseQuestions).toHaveLength(1);
  });

  it("clamps durationMinutes to 10-300 range", () => {
    const low = ExamSimulationDto.normalizeCreatePayload({
      title: "Exam",
      categoryId: VALID_CATEGORY_ID,
      durationMinutes: 1,
      trueFalseQuestions: [{ statement: "S.", is_true: true }],
    });
    expect(low.durationMinutes).toBe(10);

    const high = ExamSimulationDto.normalizeCreatePayload({
      title: "Exam",
      categoryId: VALID_CATEGORY_ID,
      durationMinutes: 9999,
      trueFalseQuestions: [{ statement: "S.", is_true: true }],
    });
    expect(high.durationMinutes).toBe(300);
  });

  it("accepts snake_case true_false_questions", () => {
    const result = ExamSimulationDto.normalizeCreatePayload({
      title: "T",
      categoryId: VALID_CATEGORY_ID,
      true_false_questions: [{ statement: "S.", is_true: false }],
    });
    expect(result.trueFalseQuestions).toHaveLength(1);
  });

  it("accepts snake_case development_questions", () => {
    const result = ExamSimulationDto.normalizeCreatePayload({
      title: "T",
      categoryId: VALID_CATEGORY_ID,
      development_questions: [{ prompt: "P." }],
    });
    expect(result.developmentQuestions).toHaveLength(1);
  });

  it("throws ValidationError when title is empty", () => {
    expect(() =>
      ExamSimulationDto.normalizeCreatePayload({
        title: "",
        categoryId: VALID_CATEGORY_ID,
        trueFalseQuestions: [{ statement: "S.", is_true: true }],
      }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when categoryId is missing", () => {
    expect(() =>
      ExamSimulationDto.normalizeCreatePayload({
        title: "T",
        trueFalseQuestions: [{ statement: "S.", is_true: true }],
      }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when all question arrays are empty", () => {
    expect(() =>
      ExamSimulationDto.normalizeCreatePayload({
        title: "T",
        categoryId: VALID_CATEGORY_ID,
        trueFalseQuestions: [],
        multipleChoiceQuestions: [],
        developmentQuestions: [],
      }),
    ).toThrow(ValidationError);
  });
});

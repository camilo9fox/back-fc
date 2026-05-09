/**
 * Unit tests — QuizDto and QuizQuestionDto
 */

const {
  QuizDto,
  QuizQuestionDto,
} = require("../../../src/modules/quizzes/dtos/QuizDto");
const {
  validQuizQuestion,
  VALID_CATEGORY_ID,
} = require("../../__mocks__/fixtures");

// ── QuizQuestionDto ───────────────────────────────────────────────────────────

describe("QuizQuestionDto", () => {
  describe("isValid()", () => {
    it("returns true for a well-formed question", () => {
      const q = new QuizQuestionDto(
        validQuizQuestion.question,
        validQuizQuestion.options,
        validQuizQuestion.correctAnswer,
        validQuizQuestion.explanation,
        0,
      );
      expect(q.isValid()).toBe(true);
    });

    it("returns false when correctAnswer is not in options", () => {
      const q = new QuizQuestionDto(
        "¿Pregunta?",
        ["A", "B", "C"],
        "D", // not in options
        null,
        0,
      );
      expect(q.isValid()).toBe(false);
    });

    it("returns false when options has fewer than 2 items", () => {
      const q = new QuizQuestionDto(
        "¿Pregunta?",
        ["Solo una"],
        "Solo una",
        null,
        0,
      );
      expect(q.isValid()).toBe(false);
    });

    it("returns false when question text is empty", () => {
      const q = new QuizQuestionDto("", ["A", "B"], "A", null, 0);
      expect(q.isValid()).toBe(false);
    });

    it("returns false when question exceeds 2000 characters", () => {
      const q = new QuizQuestionDto("x".repeat(2001), ["A", "B"], "A", null, 0);
      expect(q.isValid()).toBe(false);
    });

    it("returns false when options array has more than 6 items", () => {
      const opts = ["A", "B", "C", "D", "E", "F", "G"];
      const q = new QuizQuestionDto("¿Pregunta?", opts, "A", null, 0);
      expect(q.isValid()).toBe(false);
    });

    it("returns false when an option exceeds 500 characters", () => {
      const longOpt = "o".repeat(501);
      const q = new QuizQuestionDto(
        "¿Pregunta?",
        [longOpt, "B"],
        longOpt,
        null,
        0,
      );
      expect(q.isValid()).toBe(false);
    });

    it("returns false when explanation exceeds 2000 characters", () => {
      const q = new QuizQuestionDto(
        "¿Pregunta?",
        ["A", "B"],
        "A",
        "e".repeat(2001),
        0,
      );
      expect(q.isValid()).toBe(false);
    });
  });
});

// ── QuizDto ───────────────────────────────────────────────────────────────────

describe("QuizDto", () => {
  const buildValidQuestion = () =>
    new QuizQuestionDto(
      validQuizQuestion.question,
      validQuizQuestion.options,
      validQuizQuestion.correctAnswer,
      validQuizQuestion.explanation,
      0,
    );

  describe("isValid()", () => {
    it("returns true for a complete quiz with one valid question", () => {
      const dto = new QuizDto("Capitales", VALID_CATEGORY_ID, null, [
        buildValidQuestion(),
      ]);
      expect(dto.isValid()).toBe(true);
    });

    it("returns false when title is empty", () => {
      const dto = new QuizDto("", VALID_CATEGORY_ID, null, [
        buildValidQuestion(),
      ]);
      expect(dto.isValid()).toBe(false);
    });

    it("returns false when categoryId is missing", () => {
      const dto = new QuizDto("Título", "", null, [buildValidQuestion()]);
      expect(dto.isValid()).toBe(false);
    });

    it("returns false when questions array is empty", () => {
      const dto = new QuizDto("Título", VALID_CATEGORY_ID, null, []);
      expect(dto.isValid()).toBe(false);
    });

    it("returns false when a question in the array is invalid", () => {
      const badQuestion = new QuizQuestionDto("", [], "", null, 0);
      const dto = new QuizDto("Título", VALID_CATEGORY_ID, null, [badQuestion]);
      expect(dto.isValid()).toBe(false);
    });

    it("returns false when title exceeds 255 characters", () => {
      const dto = new QuizDto("t".repeat(256), VALID_CATEGORY_ID, null, [
        buildValidQuestion(),
      ]);
      expect(dto.isValid()).toBe(false);
    });

    it("returns false when description exceeds 2000 characters", () => {
      const dto = new QuizDto("Título", VALID_CATEGORY_ID, "d".repeat(2001), [
        buildValidQuestion(),
      ]);
      expect(dto.isValid()).toBe(false);
    });
  });

  describe("buildQuestion()", () => {
    it("builds a QuizQuestionDto from raw data", () => {
      const q = QuizDto.buildQuestion(validQuizQuestion, 0);
      expect(q).toBeInstanceOf(QuizQuestionDto);
      expect(q.question).toBe(validQuizQuestion.question);
      expect(q.correctAnswer).toBe(validQuizQuestion.correctAnswer);
    });
  });
});

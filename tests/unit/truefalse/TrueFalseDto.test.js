/**
 * Unit tests — TrueFalseSetDto and TrueFalseQuestionDto
 */

const {
  TrueFalseSetDto,
  TrueFalseQuestionDto,
} = require("../../../src/modules/truefalse/dtos/TrueFalseDto");
const {
  validTFQuestion,
  VALID_CATEGORY_ID,
} = require("../../__mocks__/fixtures");

// ── TrueFalseQuestionDto ──────────────────────────────────────────────────────

describe("TrueFalseQuestionDto", () => {
  describe("isValid()", () => {
    it("returns true for a valid true statement", () => {
      const q = new TrueFalseQuestionDto(
        "El agua hierve a 100°C al nivel del mar.",
        true,
        null,
        0,
      );
      expect(q.isValid()).toBe(true);
    });

    it("returns true for a valid false statement", () => {
      const q = new TrueFalseQuestionDto(
        validTFQuestion.statement,
        false,
        validTFQuestion.explanation,
        0,
      );
      expect(q.isValid()).toBe(true);
    });

    it("returns false when statement is empty", () => {
      const q = new TrueFalseQuestionDto("", true, null, 0);
      expect(q.isValid()).toBe(false);
    });

    it("returns false when statement is only whitespace", () => {
      const q = new TrueFalseQuestionDto("   ", false, null, 0);
      expect(q.isValid()).toBe(false);
    });

    it("returns false when isTrue is not a boolean", () => {
      const q = new TrueFalseQuestionDto("Enunciado válido.", "true", null, 0);
      expect(q.isValid()).toBe(false);
    });

    it("returns false when statement exceeds 2000 characters", () => {
      const q = new TrueFalseQuestionDto("x".repeat(2001), true, null, 0);
      expect(q.isValid()).toBe(false);
    });
  });
});

// ── TrueFalseSetDto ───────────────────────────────────────────────────────────

describe("TrueFalseSetDto", () => {
  const buildValidQuestion = () =>
    new TrueFalseQuestionDto(
      validTFQuestion.statement,
      validTFQuestion.isTrue,
      null,
      0,
    );

  describe("isValid()", () => {
    it("returns true for a complete valid set", () => {
      const dto = new TrueFalseSetDto("Mitos", VALID_CATEGORY_ID, null, [
        buildValidQuestion(),
      ]);
      expect(dto.isValid()).toBe(true);
    });

    it("returns false when title is empty", () => {
      const dto = new TrueFalseSetDto("", VALID_CATEGORY_ID, null, [
        buildValidQuestion(),
      ]);
      expect(dto.isValid()).toBe(false);
    });

    it("returns false when categoryId is missing", () => {
      const dto = new TrueFalseSetDto("Título", "", null, [
        buildValidQuestion(),
      ]);
      expect(dto.isValid()).toBe(false);
    });

    it("returns false when questions array is empty", () => {
      const dto = new TrueFalseSetDto("Título", VALID_CATEGORY_ID, null, []);
      expect(dto.isValid()).toBe(false);
    });

    it("returns false when a question in the array is invalid", () => {
      const bad = new TrueFalseQuestionDto("", true, null, 0);
      const dto = new TrueFalseSetDto("Título", VALID_CATEGORY_ID, null, [bad]);
      expect(dto.isValid()).toBe(false);
    });
  });

  describe("buildQuestion()", () => {
    it("builds from camelCase fields", () => {
      const q = TrueFalseSetDto.buildQuestion(
        { statement: "S", isTrue: true, explanation: "E" },
        0,
      );
      expect(q).toBeInstanceOf(TrueFalseQuestionDto);
      expect(q.isTrue).toBe(true);
    });

    it("builds from snake_case fields (is_true)", () => {
      const q = TrueFalseSetDto.buildQuestion(
        { statement: "S", is_true: false },
        1,
      );
      expect(q.isTrue).toBe(false);
      expect(q.orderIndex).toBe(1);
    });
  });
});

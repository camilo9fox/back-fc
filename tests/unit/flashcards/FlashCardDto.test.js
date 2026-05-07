/**
 * Unit tests — FlashCardDto
 * Verifies validation rules without any I/O.
 */

const FlashCardDto = require("../../../src/modules/flashcards/dtos/FlashCardDto");

describe("FlashCardDto", () => {
  describe("isValid()", () => {
    it("returns true when question and answer are non-empty strings", () => {
      const dto = new FlashCardDto(
        "¿Qué es la fotosíntesis?",
        "Un proceso biológico.",
      );
      expect(dto.isValid()).toBe(true);
    });

    it("returns false when question is empty", () => {
      const dto = new FlashCardDto("", "Una respuesta válida.");
      expect(dto.isValid()).toBe(false);
    });

    it("returns false when question is only whitespace", () => {
      const dto = new FlashCardDto("   ", "Una respuesta válida.");
      expect(dto.isValid()).toBe(false);
    });

    it("returns false when answer is empty", () => {
      const dto = new FlashCardDto("Una pregunta válida.", "");
      expect(dto.isValid()).toBe(false);
    });

    it("returns false when answer is only whitespace", () => {
      const dto = new FlashCardDto("Una pregunta válida.", "   ");
      expect(dto.isValid()).toBe(false);
    });

    it("returns false when question is not a string", () => {
      const dto = new FlashCardDto(null, "Una respuesta.");
      expect(dto.isValid()).toBe(false);
    });

    it("returns false when answer is not a string", () => {
      const dto = new FlashCardDto("Una pregunta.", 123);
      expect(dto.isValid()).toBe(false);
    });
  });

  describe("fromJson()", () => {
    it("parses valid JSON and returns a FlashCardDto instance", () => {
      const json = JSON.stringify({ question: "¿Q?", answer: "R" });
      const dto = FlashCardDto.fromJson(json);
      expect(dto).toBeInstanceOf(FlashCardDto);
      expect(dto.question).toBe("¿Q?");
      expect(dto.answer).toBe("R");
    });

    it("throws ValidationError on malformed JSON", () => {
      expect(() => FlashCardDto.fromJson("{bad json")).toThrow(
        "Invalid JSON format for FlashCard",
      );
    });
  });
});

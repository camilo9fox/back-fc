/**
 * Data Transfer Object for FlashCard
 * Defines the structure of flashcard data
 */
class FlashCardDto {
  constructor(question, answer, options, requiredOptionsCount = 3) {
    this.question = question;
    this.answer = answer;
    this.options = options;
    this.requiredOptionsCount = requiredOptionsCount;
  }

  /**
   * Validates the flashcard data
   * @returns {boolean} True if valid
   */
  isValid() {
    return (
      typeof this.question === "string" &&
      this.question.length > 0 &&
      typeof this.answer === "string" &&
      this.answer.length > 0 &&
      Array.isArray(this.options) &&
      this.options.length === this.requiredOptionsCount &&
      this.options.every(
        (option) => typeof option === "string" && option.length > 0,
      ) &&
      this.options.includes(this.answer)
    );
  }

  /**
   * Creates a FlashCardDto from JSON string
   * @param {string} jsonString - JSON string to parse
   * @returns {FlashCardDto} Parsed flashcard
   */
  static fromJson(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      return new FlashCardDto(data.question, data.answer, data.options);
    } catch (error) {
      throw new Error("Invalid JSON format for FlashCard");
    }
  }
}

module.exports = FlashCardDto;

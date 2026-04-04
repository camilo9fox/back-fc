/**
 * Data Transfer Object for FlashCard
 * Defines the structure of flashcard data
 */
class FlashCardDto {
  constructor(question, answer, options) {
    this.question = question;
    this.answer = answer;
    this.options = options;
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
      this.options.length === 3 &&
      this.options.every(
        (option) => typeof option === "string" && option.length > 0,
      )
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

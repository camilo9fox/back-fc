/**
 * Data Transfer Object for FlashCard (classic Q/A format)
 */
class FlashCardDto {
  constructor(question, answer) {
    this.question = question;
    this.answer = answer;
  }

  isValid() {
    return (
      typeof this.question === "string" &&
      this.question.trim().length > 0 &&
      typeof this.answer === "string" &&
      this.answer.trim().length > 0
    );
  }

  static fromJson(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      return new FlashCardDto(data.question, data.answer);
    } catch (error) {
      throw new Error("Invalid JSON format for FlashCard");
    }
  }
}

module.exports = FlashCardDto;

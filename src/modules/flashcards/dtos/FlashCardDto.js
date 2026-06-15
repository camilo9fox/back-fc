/**
 * Data Transfer Object for FlashCard (classic Q/A format)
 */
const { ValidationError } = require("../../../shared/errors/AppError");

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
      throw new ValidationError("Invalid JSON format for FlashCard");
    }
  }
}

module.exports = FlashCardDto;

class FlashCardSetDto {
  constructor(title, categoryId, description, cards) {
    this.title = title;
    this.categoryId = categoryId;
    this.description = description || null;
    this.cards = cards || [];
  }

  isValid() {
    return (
      typeof this.title === "string" &&
      this.title.trim().length > 0 &&
      typeof this.categoryId === "string" &&
      this.categoryId.trim().length > 0 &&
      Array.isArray(this.cards) &&
      this.cards.length > 0 &&
      this.cards.every(
        (c) =>
          typeof c.question === "string" &&
          c.question.trim().length > 0 &&
          typeof c.answer === "string" &&
          c.answer.trim().length > 0,
      )
    );
  }

  static buildCard(data, index) {
    return {
      question: String(data.question || "").trim(),
      answer: String(data.answer || "").trim(),
      source: data.source || "manual",
      order_index: index,
    };
  }
}

module.exports = { FlashCardDto, FlashCardSetDto };

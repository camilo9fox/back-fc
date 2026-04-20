/**
 * DTO for a single quiz question
 */
class QuizQuestionDto {
  /**
   * @param {string} question
   * @param {string[]} options  - all alternatives including the correct answer
   * @param {string} correctAnswer - must be one of options
   * @param {string|null} explanation
   * @param {number} orderIndex
   */
  constructor(
    question,
    options,
    correctAnswer,
    explanation = null,
    orderIndex = 0,
  ) {
    this.question = question;
    this.options = options;
    this.correctAnswer = correctAnswer;
    this.explanation = explanation;
    this.orderIndex = orderIndex;
  }

  isValid() {
    return (
      typeof this.question === "string" &&
      this.question.trim().length > 0 &&
      this.question.length <= 2000 &&
      Array.isArray(this.options) &&
      this.options.length >= 2 &&
      this.options.length <= 6 &&
      this.options.every(
        (o) => typeof o === "string" && o.trim().length > 0 && o.length <= 500,
      ) &&
      typeof this.correctAnswer === "string" &&
      this.correctAnswer.trim().length > 0 &&
      this.options.includes(this.correctAnswer) &&
      (this.explanation === null || this.explanation.length <= 2000)
    );
  }
}

/**
 * DTO for a quiz (cuestionario)
 */
class QuizDto {
  /**
   * @param {string} title
   * @param {string} categoryId - required
   * @param {string|null} description
   * @param {QuizQuestionDto[]} questions
   */
  constructor(title, categoryId, description = null, questions = []) {
    this.title = title;
    this.categoryId = categoryId;
    this.description = description;
    this.questions = questions;
  }

  isValid() {
    return (
      typeof this.title === "string" &&
      this.title.trim().length > 0 &&
      this.title.length <= 255 &&
      typeof this.categoryId === "string" &&
      this.categoryId.trim().length > 0 &&
      (this.description === null ||
        this.description === undefined ||
        this.description.length <= 2000) &&
      Array.isArray(this.questions) &&
      this.questions.length > 0 &&
      this.questions.every((q) => q instanceof QuizQuestionDto && q.isValid())
    );
  }

  static buildQuestion(data, index = 0) {
    return new QuizQuestionDto(
      data.question,
      data.options,
      data.correctAnswer ?? data.correct_answer,
      data.explanation ?? null,
      data.orderIndex ?? data.order_index ?? index,
    );
  }
}

module.exports = { QuizDto, QuizQuestionDto };

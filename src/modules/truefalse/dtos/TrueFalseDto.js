/**
 * DTO for a single true/false question
 */
class TrueFalseQuestionDto {
  /**
   * @param {string} statement  - the statement the user must judge
   * @param {boolean} isTrue
   * @param {string|null} explanation
   * @param {number} orderIndex
   */
  constructor(statement, isTrue, explanation = null, orderIndex = 0) {
    this.statement = statement;
    this.isTrue = isTrue;
    this.explanation = explanation;
    this.orderIndex = orderIndex;
  }

  isValid() {
    return (
      typeof this.statement === "string" &&
      this.statement.trim().length > 0 &&
      typeof this.isTrue === "boolean"
    );
  }
}

/**
 * DTO for a true/false set
 */
class TrueFalseSetDto {
  /**
   * @param {string} title
   * @param {string} categoryId - required
   * @param {string|null} description
   * @param {TrueFalseQuestionDto[]} questions
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
      typeof this.categoryId === "string" &&
      this.categoryId.trim().length > 0 &&
      Array.isArray(this.questions) &&
      this.questions.length > 0 &&
      this.questions.every(
        (q) => q instanceof TrueFalseQuestionDto && q.isValid(),
      )
    );
  }

  static buildQuestion(data, index = 0) {
    return new TrueFalseQuestionDto(
      data.statement,
      typeof data.isTrue !== "undefined" ? data.isTrue : data.is_true,
      data.explanation ?? null,
      data.orderIndex ?? data.order_index ?? index,
    );
  }
}

module.exports = { TrueFalseSetDto, TrueFalseQuestionDto };

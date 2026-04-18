/**
 * Business logic for recording and retrieving study attempt data.
 * Single Responsibility: validates and delegates to the repository.
 * Dependency Inversion: depends on IAttemptRepository abstraction.
 */
class AttemptService {
  constructor(attemptRepository) {
    this.attemptRepository = attemptRepository;
  }

  /**
   * Records a completed quiz session.
   * @param {string} userId
   * @param {{ quizId?: string, categoryId?: string, score: number, totalQuestions: number }} dto
   */
  async recordQuizAttempt(
    userId,
    { quizId, categoryId, score, totalQuestions },
  ) {
    this._validateScore(score, totalQuestions);
    return this.attemptRepository.createQuizAttempt({
      userId,
      quizId: quizId ?? null,
      categoryId: categoryId ?? null,
      score,
      totalQuestions,
    });
  }

  /**
   * Records a completed true/false session.
   * @param {string} userId
   * @param {{ setId?: string, categoryId?: string, score: number, totalQuestions: number }} dto
   */
  async recordTrueFalseAttempt(
    userId,
    { setId, categoryId, score, totalQuestions },
  ) {
    this._validateScore(score, totalQuestions);
    return this.attemptRepository.createTrueFalseAttempt({
      userId,
      setId: setId ?? null,
      categoryId: categoryId ?? null,
      score,
      totalQuestions,
    });
  }

  /**
   * Records a completed flashcard study session.
   * @param {string} userId
   * @param {{ categoryId?: string, cardsKnown: number, cardsUnknown: number, totalCards: number }} dto
   */
  async recordFlashcardSession(
    userId,
    { categoryId, cardsKnown, cardsUnknown, totalCards },
  ) {
    if (
      !Number.isInteger(cardsKnown) ||
      !Number.isInteger(cardsUnknown) ||
      !Number.isInteger(totalCards) ||
      totalCards <= 0 ||
      cardsKnown < 0 ||
      cardsUnknown < 0 ||
      cardsKnown + cardsUnknown !== totalCards
    ) {
      const { AppError } = require("../../../shared/errors/AppError");
      throw new AppError("Invalid flashcard session data", 400);
    }
    return this.attemptRepository.createFlashcardSession({
      userId,
      categoryId: categoryId ?? null,
      cardsKnown,
      cardsUnknown,
      totalCards,
    });
  }

  /**
   * Returns aggregated attempt statistics for a user.
   * @param {string} userId
   */
  async getAttemptStats(userId) {
    return this.attemptRepository.getAttemptStats(userId);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  _validateScore(score, totalQuestions) {
    if (
      !Number.isInteger(score) ||
      !Number.isInteger(totalQuestions) ||
      totalQuestions <= 0 ||
      score < 0 ||
      score > totalQuestions
    ) {
      const { AppError } = require("../../../shared/errors/AppError");
      throw new AppError("Invalid score or total_questions value", 400);
    }
  }
}

module.exports = AttemptService;

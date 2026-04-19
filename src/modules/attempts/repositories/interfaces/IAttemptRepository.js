/**
 * Interface for attempt repository.
 * Defines the contract for recording and reading study attempt data.
 * Open/Closed Principle: extend by implementing, not by modifying.
 */
class IAttemptRepository {
  /**
   * Persists a completed quiz attempt.
   * @param {{ userId:string, quizId:string|null, categoryId:string|null, score:number, totalQuestions:number }} data
   * @returns {Promise<object>} Saved attempt record
   */
  async createQuizAttempt(data) {
    throw new Error(
      "IAttemptRepository.createQuizAttempt() must be implemented",
    );
  }

  /**
   * Persists a completed true/false attempt.
   * @param {{ userId:string, setId:string|null, categoryId:string|null, score:number, totalQuestions:number }} data
   * @returns {Promise<object>} Saved attempt record
   */
  async createTrueFalseAttempt(data) {
    throw new Error(
      "IAttemptRepository.createTrueFalseAttempt() must be implemented",
    );
  }

  /**
   * Persists a completed flashcard study session.
   * @param {{ userId:string, categoryId:string|null, cardsKnown:number, cardsUnknown:number, totalCards:number }} data
   * @returns {Promise<object>} Saved session record
   */
  async createFlashcardSession(data) {
    throw new Error(
      "IAttemptRepository.createFlashcardSession() must be implemented",
    );
  }

  /**
   * Returns aggregated attempt statistics for a user.
   * @param {string} userId
   * @returns {Promise<{ totalAttempts:number, avgScore:number, currentStreak:number, recentAttempts:Array }>}
   */
  async getAttemptStats(userId) {
    throw new Error("IAttemptRepository.getAttemptStats() must be implemented");
  }

  /**
   * Returns daily activity data for the last N days (default 14).
   * @param {string} userId
   * @param {number} [days=14]
   * @returns {Promise<{ activityByDay: Array, scoreByDay: Array }>}
   */
  async getChartData(userId, days = 14) {
    throw new Error("IAttemptRepository.getChartData() must be implemented");
  }

  /**
   * Returns paginated attempt history with optional filters.
   * @param {string} userId
   * @param {{ type?: string, categoryId?: string, page?: number, limit?: number }} filters
   * @returns {Promise<{ items: Array, total: number, page: number, totalPages: number }>}
   */
  async getHistory(userId, filters) {
    throw new Error("IAttemptRepository.getHistory() must be implemented");
  }
}

module.exports = IAttemptRepository;

/**
 * Interface for statistics repository.
 * Defines the contract that any stats data source must implement.
 * Open/Closed Principle: extend by implementing, not by modifying.
 */
class IStatsRepository {
  /**
   * Returns aggregate resource counts for a user.
   * @param {string} userId
   * @returns {Promise<{categories:number, flashcards:number, quizzes:number, trueFalseSets:number, studyGuides:number}>}
   */
  async getUserStats(userId) {
    throw new Error("IStatsRepository.getUserStats() must be implemented");
  }

  /**
   * Returns per-category resource counts for a user.
   * @param {string} userId
   * @returns {Promise<Array<{id:string, title:string, flashcards:number, quizzes:number, trueFalseSets:number, studyGuides:number, total:number}>>}
   */
  async getCategoryBreakdown(userId) {
    throw new Error(
      "IStatsRepository.getCategoryBreakdown() must be implemented",
    );
  }
}

module.exports = IStatsRepository;

/**
 * Interface for Quiz repository operations.
 * Defines the contract for quiz persistence operations.
 * Follows Interface Segregation Principle — only quiz-related operations.
 */
class IQuizRepository {
  async create(quizData) {
    throw new Error("Method create must be implemented");
  }

  async findAllByUser(userId, options) {
    throw new Error("Method findAllByUser must be implemented");
  }

  async findById(id, userId) {
    throw new Error("Method findById must be implemented");
  }

  async update(id, userId, updateData) {
    throw new Error("Method update must be implemented");
  }

  async delete(id, userId) {
    throw new Error("Method delete must be implemented");
  }

  async addQuestion(quizId, userId, questionData) {
    throw new Error("Method addQuestion must be implemented");
  }

  async deleteQuestion(questionId, userId) {
    throw new Error("Method deleteQuestion must be implemented");
  }
}

module.exports = IQuizRepository;

/**
 * Interface for TrueFalse repository operations.
 * Defines the contract for true/false set persistence operations.
 * Follows Interface Segregation Principle — only true/false-related operations.
 */
class ITrueFalseRepository {
  async create(setData) {
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

  async addQuestion(setId, userId, questionData) {
    throw new Error("Method addQuestion must be implemented");
  }

  async deleteQuestion(questionId, userId) {
    throw new Error("Method deleteQuestion must be implemented");
  }
}

module.exports = ITrueFalseRepository;

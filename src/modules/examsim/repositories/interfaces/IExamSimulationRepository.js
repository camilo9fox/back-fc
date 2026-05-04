/**
 * Interface for Exam Simulation persistence operations.
 */
class IExamSimulationRepository {
  async create(payload) {
    throw new Error("Method create must be implemented");
  }

  async findAllByUser(userId, options) {
    throw new Error("Method findAllByUser must be implemented");
  }

  async findById(id, userId) {
    throw new Error("Method findById must be implemented");
  }

  async update(id, userId, payload) {
    throw new Error("Method update must be implemented");
  }

  async delete(id, userId) {
    throw new Error("Method delete must be implemented");
  }

  async createAttempt(payload) {
    throw new Error("Method createAttempt must be implemented");
  }

  async listQuestionBankByCategory(userId, categoryId) {
    throw new Error("Method listQuestionBankByCategory must be implemented");
  }
}

module.exports = IExamSimulationRepository;

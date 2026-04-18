/**
 * Interface defining the contract for study guide persistence.
 * Follows the Dependency Inversion Principle.
 */
class IStudyGuideRepository {
  /** @param {{ userId: string, categoryId: string, title: string, content: string }} data */
  async create(data) {
    throw new Error("Not implemented");
  }

  /** @param {string} userId @param {{ limit?: number, offset?: number, categoryId?: string }} options */
  async findAllByUser(userId, options = {}) {
    throw new Error("Not implemented");
  }

  /** @param {string} id @param {string} userId */
  async findById(id, userId) {
    throw new Error("Not implemented");
  }

  /** @param {string} id @param {string} userId */
  async delete(id, userId) {
    throw new Error("Not implemented");
  }
}

module.exports = IStudyGuideRepository;

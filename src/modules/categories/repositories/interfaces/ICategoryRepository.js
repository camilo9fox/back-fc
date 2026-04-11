/**
 * Interface for Category Repository
 * Defines the contract for category data access operations
 * Follows Interface Segregation Principle - only category-specific operations
 */
class ICategoryRepository {
  /**
   * Creates a new category in the database
   * @param {Object} category - Category data
   * @param {string} category.title
   * @param {string} category.description
   * @param {string} category.userId - User ID (required)
   * @returns {Promise<Object>} Created category with ID and timestamps
   */
  async create(category) {
    throw new Error("Method create must be implemented");
  }

  /**
   * Finds a category by ID
   * @param {string} id - Category ID
   * @param {string} userId - User ID for security
   * @returns {Promise<Object|null>} Category data or null if not found
   */
  async findById(id, userId) {
    throw new Error("Method findById must be implemented");
  }

  /**
   * Finds all categories for a user with optional filtering
   * @param {Object} filters - Optional filters
   * @param {string} filters.userId - Filter by user ID (required for security)
   * @param {number} filters.limit - Limit number of results
   * @param {number} filters.offset - Offset for pagination
   * @returns {Promise<Array<Object>>} Array of categories
   */
  async findAll(filters = {}) {
    throw new Error("Method findAll must be implemented");
  }

  /**
   * Updates a category by ID
   * @param {string} id - Category ID
   * @param {string} userId - User ID for security
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated category or null if not found
   */
  async update(id, userId, updates) {
    throw new Error("Method update must be implemented");
  }

  /**
   * Deletes a category by ID
   * @param {string} id - Category ID
   * @param {string} userId - User ID for security
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id, userId) {
    throw new Error("Method delete must be implemented");
  }

  /**
   * Counts categories for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of categories
   */
  async count(userId) {
    throw new Error("Method count must be implemented");
  }
}

module.exports = ICategoryRepository;

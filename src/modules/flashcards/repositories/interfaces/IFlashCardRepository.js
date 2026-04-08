/**
 * Interface for FlashCard repository operations
 * Defines the contract for flashcard persistence operations
 * Follows Interface Segregation Principle - only flashcard-related operations
 */
class IFlashCardRepository {
  /**
   * Creates a new flashcard in the database
   * @param {Object} flashCard - FlashCard data
   * @param {string} flashCard.question
   * @param {string} flashCard.answer
   * @param {Array<string>} flashCard.options
   * @param {string} flashCard.source - 'ai' or 'manual'
   * @returns {Promise<Object>} Created flashcard with ID and timestamps
   */
  async create(flashCard) {
    throw new Error("Method create must be implemented");
  }

  /**
   * Creates multiple flashcards in the database
   * @param {Array<Object>} flashCards - Array of flashcard data
   * @returns {Promise<Array<Object>>} Created flashcards with IDs and timestamps
   */
  async createMany(flashCards) {
    throw new Error("Method createMany must be implemented");
  }

  /**
   * Retrieves a flashcard by ID
   * @param {string} id - FlashCard ID
   * @returns {Promise<Object|null>} FlashCard data or null if not found
   */
  async findById(id) {
    throw new Error("Method findById must be implemented");
  }

  /**
   * Retrieves all flashcards with optional filtering
   * @param {Object} filters - Optional filters
   * @param {string} filters.source - Filter by source ('ai' or 'manual')
   * @param {number} filters.limit - Limit number of results
   * @param {number} filters.offset - Offset for pagination
   * @returns {Promise<Array<Object>>} Array of flashcards
   */
  async findAll(filters = {}) {
    throw new Error("Method findAll must be implemented");
  }

  /**
   * Updates a flashcard by ID
   * @param {string} id - FlashCard ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated flashcard or null if not found
   */
  async update(id, updates) {
    throw new Error("Method update must be implemented");
  }

  /**
   * Deletes a flashcard by ID
   * @param {string} id - FlashCard ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    throw new Error("Method delete must be implemented");
  }

  /**
   * Gets the total count of flashcards
   * @param {Object} filters - Optional filters
   * @returns {Promise<number>} Total count
   */
  async count(filters = {}) {
    throw new Error("Method count must be implemented");
  }
}

module.exports = IFlashCardRepository;

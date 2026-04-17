const CategoryDto = require("../dtos/CategoryDto");
const { NotFoundError } = require("../../../shared/errors/AppError");

/**
 * Service class for category business logic
 * Handles category operations and validation
 * Follows Single Responsibility Principle - only category business logic
 */
class CategoryService {
  constructor(categoryRepository) {
    this.categoryRepository = categoryRepository;
  }

  /**
   * Creates a new category
   * @param {Object} categoryData - Category data
   * @param {string} categoryData.title
   * @param {string} categoryData.description
   * @param {string} categoryData.userId
   * @returns {Promise<Object>} Created category
   */
  async createCategory(categoryData) {
    const validatedData = CategoryDto.validateCreate(categoryData);

    const category = await this.categoryRepository.create(validatedData);
    return CategoryDto.toResponse(category);
  }

  /**
   * Gets a category by ID
   * @param {string} id - Category ID
   * @param {string} userId - User ID for security
   * @returns {Promise<Object|null>} Category data or null
   */
  async getCategoryById(id, userId) {
    const category = await this.categoryRepository.findById(id, userId);
    return CategoryDto.toResponse(category);
  }

  /**
   * Gets all categories for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @param {number} options.limit - Limit results
   * @param {number} options.offset - Offset for pagination
   * @returns {Promise<Array<Object>>} Array of categories
   */
  async getCategories(userId, options = {}) {
    const filters = {
      userId,
      limit: options.limit || 50,
      offset: options.offset || 0,
    };

    const categories = await this.categoryRepository.findAll(filters);
    return categories.map(CategoryDto.toResponse);
  }

  /**
   * Updates a category
   * @param {string} id - Category ID
   * @param {string} userId - User ID for security
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} Updated category or null
   */
  async updateCategory(id, userId, updateData) {
    const validatedUpdates = CategoryDto.validateUpdate(updateData);

    const category = await this.categoryRepository.update(
      id,
      userId,
      validatedUpdates,
    );
    return CategoryDto.toResponse(category);
  }

  /**
   * Deletes a category
   * @param {string} id - Category ID
   * @param {string} userId - User ID for security
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteCategory(id, userId) {
    return await this.categoryRepository.delete(id, userId);
  }

  /**
   * Gets the default "General" category for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Default category
   * @throws {Error} If default category doesn't exist
   */
  async getDefaultCategory(userId) {
    const categories = await this.categoryRepository.findAll({
      userId,
      title: "General",
      limit: 1,
    });

    if (categories.length === 0) {
      throw new NotFoundError("Default 'General' category not found for user");
    }

    return CategoryDto.toResponse(categories[0]);
  }
}

module.exports = CategoryService;

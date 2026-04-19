/**
 * Data Transfer Object for Category validation and transformation
 * Ensures data integrity and provides consistent interface
 */
const { ValidationError } = require("../../../shared/errors/AppError");

class CategoryDto {
  /**
   * Validates and transforms category data for creation
   * @param {Object} data - Raw category data
   * @param {string} data.title - Category title (required)
   * @param {string} data.description - Category description (optional)
   * @param {string} data.userId - User ID (required)
   * @returns {Object} Validated category data
   */
  static validateCreate(data) {
    if (!data || typeof data !== "object") {
      throw new ValidationError("Category data is required");
    }

    const { title, description, userId } = data;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      throw new ValidationError(
        "Category title is required and must be a non-empty string",
      );
    }

    if (title.length > 255) {
      throw new ValidationError(
        "Category title must be 255 characters or less",
      );
    }

    if (!userId || typeof userId !== "string") {
      throw new ValidationError("User ID is required");
    }

    if (description && typeof description !== "string") {
      throw new ValidationError("Category description must be a string");
    }

    return {
      title: title.trim(),
      description: description ? description.trim() : null,
      userId,
    };
  }

  /**
   * Validates and transforms category data for updates
   * @param {Object} data - Raw category update data
   * @param {string} data.title - Category title (optional)
   * @param {string} data.description - Category description (optional)
   * @returns {Object} Validated update data
   */
  static validateUpdate(data) {
    if (!data || typeof data !== "object") {
      throw new ValidationError("Update data is required");
    }

    const updates = {};

    if (data.title !== undefined) {
      if (typeof data.title !== "string" || data.title.trim().length === 0) {
        throw new ValidationError("Category title must be a non-empty string");
      }
      if (data.title.length > 255) {
        throw new ValidationError(
          "Category title must be 255 characters or less",
        );
      }
      updates.title = data.title.trim();
    }

    if (data.description !== undefined) {
      if (data.description !== null && typeof data.description !== "string") {
        throw new ValidationError(
          "Category description must be a string or null",
        );
      }
      updates.description = data.description ? data.description.trim() : null;
    }

    if (Object.keys(updates).length === 0) {
      throw new ValidationError(
        "At least one field must be provided for update",
      );
    }

    return updates;
  }

  /**
   * Transforms database category record to API response format
   * @param {Object} category - Database category record
   * @returns {Object} Formatted category data
   */
  static toResponse(category) {
    if (!category) return null;

    return {
      id: category.id,
      title: category.title,
      description: category.description,
      userId: category.user_id,
      isPublic: category.is_public ?? false,
      createdAt: category.created_at,
      updatedAt: category.updated_at,
    };
  }
}

module.exports = CategoryDto;

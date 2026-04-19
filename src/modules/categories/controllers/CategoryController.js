const CategoryDto = require("../dtos/CategoryDto");
const { AppError } = require("../../../shared/errors/AppError");

/**
 * Controller class for category operations
 * Handles HTTP requests and responses for category management
 */
class CategoryController {
  constructor(categoryService) {
    this.categoryService = categoryService;
  }

  /**
   * Creates a new category
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async createCategory(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const categoryData = {
        ...req.body,
        userId,
      };

      const category = await this.categoryService.createCategory(categoryData);
      res.status(201).json(category);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * Gets all categories for the authenticated user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getCategories(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { limit = 50, offset = 0 } = req.query;

      const options = {
        limit: Math.min(parseInt(limit) || 50, 100), // Max 100 per request
        offset: parseInt(offset) || 0,
      };

      const categories = await this.categoryService.getCategories(
        userId,
        options,
      );
      res.json({
        categories,
        pagination: {
          limit: options.limit,
          offset: options.offset,
        },
      });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * Gets a specific category by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getCategoryById(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { id } = req.params;
      const category = await this.categoryService.getCategoryById(id, userId);

      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }

      res.json(category);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * Updates a category
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async updateCategory(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { id } = req.params;
      const updateData = req.body;

      const category = await this.categoryService.updateCategory(
        id,
        userId,
        updateData,
      );

      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }

      res.json(category);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * Deletes a category
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async deleteCategory(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { id } = req.params;
      const deleted = await this.categoryService.deleteCategory(id, userId);

      if (!deleted) {
        return res.status(404).json({ error: "Category not found" });
      }

      res.status(204).send();
    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * Handles errors consistently across endpoints
   * @param {Error} error - The error object
   * @param {Object} res - Express response object
   */
  _handleError(error, res) {
    console.error("Error in CategoryController:", error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res
      .status(500)
      .json({ error: error.message || "Error interno del servidor" });
  }

  async publishCategory(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const { id } = req.params;
      const { is_public } = req.body;

      if (typeof is_public !== "boolean")
        return res
          .status(400)
          .json({ error: "is_public (boolean) is required" });

      const result = await this.categoryService.publish(id, userId, is_public);
      res.json(result);
    } catch (error) {
      this._handleError(error, res);
    }
  }
}

module.exports = CategoryController;

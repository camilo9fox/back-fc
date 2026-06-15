const { AppError } = require("../../../shared/errors/AppError");
const logger = require("../../../shared/config/logger");

class LibraryController {
  constructor(libraryService) {
    this.libraryService = libraryService;
  }

  async getCategories(req, res) {
    try {
      const { limit = 20, offset = 0, search = "" } = req.query;
      const userId = req.user?.id || null;
      const result = await this.libraryService.getPublicCategories({
        limit: Math.min(parseInt(limit) || 20, 100),
        offset: parseInt(offset) || 0,
        search: String(search).slice(0, 100),
        userId,
      });
      res.json(result);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async forkCategory(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const { categoryId } = req.params;
      const result = await this.libraryService.forkCategory(categoryId, userId);
      res.status(201).json(result);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async getCategoryPreview(req, res) {
    try {
      const { categoryId } = req.params;
      const result = await this.libraryService.getCategoryPreview(categoryId);
      res.json(result);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  _handleError(error, res) {
    logger.error("LibraryController error:", error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = LibraryController;

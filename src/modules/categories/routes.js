const express = require("express");
const { authMiddleware } = require("../../shared/middleware/auth");

function createCategoryRouter(categoryController) {
  const router = express.Router();

  // All category routes require authentication
  router.use(authMiddleware);

  // Create a new category
  router.post("/", (req, res) => categoryController.createCategory(req, res));

  // Get all categories for the authenticated user
  router.get("/", (req, res) => categoryController.getCategories(req, res));

  // Get a specific category by ID
  router.get("/:id", (req, res) =>
    categoryController.getCategoryById(req, res),
  );

  // Update a category
  router.put("/:id", (req, res) => categoryController.updateCategory(req, res));

  // Delete a category
  router.delete("/:id", (req, res) =>
    categoryController.deleteCategory(req, res),
  );

  return router;
}

module.exports = createCategoryRouter;

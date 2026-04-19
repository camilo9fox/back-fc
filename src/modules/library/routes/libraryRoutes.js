const express = require("express");
const { authMiddleware } = require("../../../shared/middleware/auth");

function createLibraryRouter(controller) {
  const router = express.Router();

  router.use(authMiddleware);

  // List public study topics (categories) with content counts
  router.get("/", (req, res) => controller.getCategories(req, res));

  // Preview the content of a public study topic
  router.get("/:categoryId/preview", (req, res) =>
    controller.getCategoryPreview(req, res),
  );

  // Fork an entire study topic into the authenticated user's library
  router.post("/:categoryId/fork", (req, res) =>
    controller.forkCategory(req, res),
  );

  return router;
}

module.exports = createLibraryRouter;

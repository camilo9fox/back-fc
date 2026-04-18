const express = require("express");
const { authMiddleware } = require("../../../shared/middleware/auth");

function createAttemptRouter(controller) {
  const router = express.Router();

  router.use(authMiddleware);

  router.post("/quiz", (req, res) => controller.recordQuizAttempt(req, res));
  router.post("/true-false", (req, res) =>
    controller.recordTrueFalseAttempt(req, res),
  );
  router.post("/flashcards", (req, res) =>
    controller.recordFlashcardSession(req, res),
  );

  return router;
}

module.exports = createAttemptRouter;

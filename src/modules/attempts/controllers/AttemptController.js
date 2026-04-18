const { AppError } = require("../../../shared/errors/AppError");

/**
 * HTTP handler for attempt endpoints.
 * Single Responsibility: translate HTTP requests to service calls.
 * Dependency Inversion: depends on AttemptService abstraction.
 */
class AttemptController {
  constructor(attemptService) {
    this.attemptService = attemptService;
  }

  async recordQuizAttempt(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { quiz_id, category_id, score, total_questions } = req.body;

      const attempt = await this.attemptService.recordQuizAttempt(userId, {
        quizId: quiz_id,
        categoryId: category_id,
        score,
        totalQuestions: total_questions,
      });

      res.status(201).json(attempt);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async recordTrueFalseAttempt(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { set_id, category_id, score, total_questions } = req.body;

      const attempt = await this.attemptService.recordTrueFalseAttempt(userId, {
        setId: set_id,
        categoryId: category_id,
        score,
        totalQuestions: total_questions,
      });

      res.status(201).json(attempt);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async recordFlashcardSession(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { category_id, cards_known, cards_unknown, total_cards } = req.body;

      const session = await this.attemptService.recordFlashcardSession(userId, {
        categoryId: category_id,
        cardsKnown: cards_known,
        cardsUnknown: cards_unknown,
        totalCards: total_cards,
      });

      res.status(201).json(session);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  _handleError(error, res) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = AttemptController;

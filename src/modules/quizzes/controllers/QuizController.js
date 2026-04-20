const { AppError } = require("../../../shared/errors/AppError");

class QuizController {
  constructor(quizService, generationJobService) {
    this.quizService = quizService;
    this.generationJobService = generationJobService;
  }

  async createQuiz(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const quiz = await this.quizService.createQuiz(req.body, userId);
      res.status(201).json(quiz);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async getQuizzes(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const { limit = 50, offset = 0, categoryId } = req.query;
      const options = {
        limit: Math.min(parseInt(limit) || 50, 100),
        offset: parseInt(offset) || 0,
      };
      if (categoryId) options.categoryId = categoryId;

      const quizzes = await this.quizService.getQuizzes(userId, options);
      res.json({ quizzes, pagination: options });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async getQuizById(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const quiz = await this.quizService.getQuizById(req.params.id, userId);
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });

      res.json(quiz);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async updateQuiz(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const quiz = await this.quizService.updateQuiz(
        req.params.id,
        userId,
        req.body,
      );
      res.json(quiz);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async deleteQuiz(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      await this.quizService.deleteQuiz(req.params.id, userId);
      res.json({ success: true });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async addQuestion(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const question = await this.quizService.addQuestion(
        req.params.id,
        userId,
        req.body,
      );
      res.status(201).json(question);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async updateQuestion(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const question = await this.quizService.updateQuestion(
        req.params.questionId,
        userId,
        req.body,
      );
      res.json(question);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async deleteQuestion(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      await this.quizService.deleteQuestion(req.params.questionId, userId);
      res.json({ success: true });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async generateQuizAsync(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const { title, categoryId, quantity } = req.body;
      const file = req.file || null;
      const text = req.body.text || "";

      const job = this.generationJobService.createJob({
        userId,
        type: "quiz-generation",
        metadata: {
          title,
          quantity: Math.min(Math.max(parseInt(quantity) || 5, 1), 20),
          fileName: file?.originalname || null,
          inputMode: file ? "file" : "text",
        },
      });

      res.status(202).json(job);

      setImmediate(async () => {
        try {
          this.generationJobService.updateJob(job.id, userId, {
            status: "processing",
            progress: { stage: "Iniciando procesamiento", percent: 2 },
          });

          const questions = await this.quizService.generateQuiz({
            file,
            text,
            title,
            categoryId,
            quantity: Math.min(Math.max(parseInt(quantity) || 5, 1), 20),
            userId,
            onProgress: (progress) => {
              this.generationJobService.updateJob(job.id, userId, {
                status: "processing",
                progress,
              });
            },
          });

          this.generationJobService.completeJob(job.id, userId, { questions });
        } catch (error) {
          this.generationJobService.failJob(
            job.id,
            userId,
            error.message || "Error generando cuestionario",
          );
        }
      });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async getGenerationJob(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const job = this.generationJobService.getJob(req.params.jobId, userId);
      if (!job) return res.status(404).json({ error: "Job no encontrado" });

      res.json(job);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async generateQuiz(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const { title, categoryId, quantity } = req.body;
      const file = req.file || null;
      const text = req.body.text || "";

      const quiz = await this.quizService.generateQuiz({
        file,
        text,
        title,
        categoryId,
        quantity: Math.min(Math.max(parseInt(quantity) || 5, 1), 20),
        userId,
      });

      res.status(201).json({ questions: quiz });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async publish(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const isPublic = req.body.is_public;
      if (typeof isPublic !== "boolean")
        return res
          .status(400)
          .json({ error: "is_public (boolean) is required" });

      const result = await this.quizService.publish(
        req.params.id,
        userId,
        isPublic,
      );
      res.json(result);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  _handleError(error, res) {
    console.error("QuizController error:", error.message);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = QuizController;

const {
  AppError,
  ValidationError,
} = require("../../../shared/errors/AppError");

/**
 * Controller class for flashcard operations
 * Handles HTTP requests and responses for flashcard generation, creation and retrieval
 */
class FlashCardController {
  constructor(
    flashCardService,
    manualFlashCardService,
    generationJobService,
    spacedRepetitionService,
  ) {
    this.flashCardService = flashCardService;
    this.manualFlashCardService = manualFlashCardService;
    this.generationJobService = generationJobService;
    this.spacedRepetitionService = spacedRepetitionService;
  }

  /**
   * Validates and extracts input parameters from request
   * @param {Object} req - Express request object
   * @returns {Object} Validated input parameters
   */
  _validateAndExtractInput(req) {
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    const file = req.file || null;
    const quantity = Number.parseInt(req.body.quantity, 10) || 1;
    const categoryId = req.body.categoryId || null;

    if (!file && !text) {
      throw new ValidationError(
        "No se proporcionó ningún archivo ni texto. Envíe al menos una de las opciones.",
      );
    }

    return { file, text, quantity, categoryId };
  }

  /**
   * Handles the generation of flashcards from uploaded files
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async generateFlashCard(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { file, text, categoryId } = this._validateAndExtractInput(req);

      const flashCard = await this.flashCardService.processInput({
        file,
        text,
        quantity: 1,
        userId,
        categoryId,
      });

      res.json(flashCard[0]); // Return single flashcard
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async generateFlashCards(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { file, text, quantity, categoryId } =
        this._validateAndExtractInput(req);

      const flashCards = await this.flashCardService.processInput({
        file,
        text,
        quantity,
        userId,
        categoryId,
      });

      res.json(flashCards);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async generateFlashCardsAsync(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { file, text, quantity, categoryId } =
        this._validateAndExtractInput(req);
      const job = this.generationJobService.createJob({
        userId,
        type: "flashcard-generation",
        metadata: {
          quantity,
          fileName: file?.originalname || null,
          inputMode: file ? "file" : "text",
          recommendedAsync: this.flashCardService.shouldPreferAsync({
            file,
            text,
          }),
        },
      });

      res.status(202).json(job);

      setImmediate(async () => {
        try {
          this.generationJobService.updateJob(job.id, userId, {
            status: "processing",
            progress: {
              stage: "Iniciando procesamiento",
              percent: 2,
            },
          });

          const flashCards = await this.flashCardService.processInput({
            file,
            text,
            quantity,
            userId,
            categoryId,
            onProgress: (progress) => {
              this.generationJobService.updateJob(job.id, userId, {
                status: "processing",
                progress,
              });
            },
          });

          this.generationJobService.completeJob(job.id, userId, {
            flashcards: flashCards,
          });
        } catch (error) {
          this.generationJobService.failJob(
            job.id,
            userId,
            error.message || "Error generando flashcards",
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
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const job = this.generationJobService.getJob(req.params.jobId, userId);
      if (!job) {
        return res.status(404).json({ error: "Job no encontrado" });
      }

      res.json(job);
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
    console.error("Error in FlashCardController:", error);
    // Groq API payload-too-large (comes as a plain error from groq-sdk)
    if (error.message && error.message.includes("request_too_large")) {
      return res.status(413).json({
        error:
          "La solicitud a la API de Groq es demasiado grande. Intenta con un documento más corto o reduce el contenido.",
      });
    }
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res
      .status(500)
      .json({ error: error.message || "Error interno del servidor" });
  }

  /**
   * Handles the creation of a single manual flashcard
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async createManualFlashCard(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { question, answer, categoryId } = req.body;

      if (!question || !answer) {
        return res.status(400).json({
          error:
            "Se requieren question y answer para crear una flashcard manual.",
        });
      }

      if (question.length > 2000 || answer.length > 2000) {
        return res.status(400).json({
          error: "question y answer no pueden superar los 2000 caracteres.",
        });
      }

      if (!categoryId) {
        return res.status(400).json({
          error:
            "categoryId es requerido. Toda flashcard debe pertenecer a una categoría.",
        });
      }

      const flashCard = await this.manualFlashCardService.createFlashCard(
        { question, answer },
        userId,
        categoryId,
      );

      res.status(201).json(flashCard);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * Handles the creation of multiple manual flashcards
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async createManualFlashCards(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { flashcards, categoryId } = req.body;

      if (!flashcards || !Array.isArray(flashcards)) {
        return res.status(400).json({
          error:
            "Se requiere un array 'flashcards' con los datos de las flashcards.",
        });
      }

      const createdFlashCards =
        await this.manualFlashCardService.createFlashCards(
          flashcards,
          userId,
          categoryId,
        );

      res.status(201).json({
        message: `${createdFlashCards.length} flashcards creadas exitosamente`,
        flashcards: createdFlashCards,
      });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * Deletes a flashcard by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async deleteFlashCard(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { id } = req.params;
      const deleted = await this.manualFlashCardService.deleteFlashCard(
        id,
        userId,
      );
      if (!deleted) {
        return res.status(404).json({ error: "Flashcard not found" });
      }
      res.status(200).json({ success: true });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async updateFlashCard(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { id } = req.params;
      const { question, answer } = req.body;
      if (!question?.trim() || !answer?.trim()) {
        return res
          .status(400)
          .json({ error: "Se requieren question y answer." });
      }
      if (question.length > 2000 || answer.length > 2000) {
        return res.status(400).json({
          error: "question y answer no pueden superar los 2000 caracteres.",
        });
      }
      const updated = await this.manualFlashCardService.updateFlashCard(
        id,
        userId,
        { question, answer },
      );
      if (!updated) {
        return res.status(404).json({ error: "Flashcard no encontrada." });
      }
      res.json(updated);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async getFlashCards(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { source, limit = 200, offset = 0, categoryId } = req.query;

      const filters = {
        userId, // Always filter by authenticated user
      };
      if (source && ["ai", "manual"].includes(source)) {
        filters.source = source;
      }
      if (categoryId) {
        filters.categoryId = categoryId;
      }
      filters.limit = Math.min(parseInt(limit) || 200, 500); // Max 500 per request
      filters.offset = parseInt(offset) || 0;

      const flashcards = await this.manualFlashCardService.getFlashCards(
        userId,
        filters,
      );

      res.json({
        flashcards,
        pagination: {
          limit: filters.limit,
          offset: filters.offset,
        },
      });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * Retrieves a specific flashcard by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getFlashCardById(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          error: "Se requiere el ID de la flashcard.",
        });
      }

      const flashcard = await this.manualFlashCardService.getFlashCardById(
        id,
        userId,
      );

      if (!flashcard) {
        return res.status(404).json({
          error: "Flashcard no encontrada.",
        });
      }

      res.json(flashcard);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async publishCategory(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const { categoryId } = req.params;
      const isPublic = req.body.is_public;

      if (typeof isPublic !== "boolean")
        return res
          .status(400)
          .json({ error: "is_public (boolean) is required" });

      const result = await this.manualFlashCardService.publishByCategory(
        categoryId,
        userId,
        isPublic,
      );
      res.json(result);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  // ── Spaced Repetition ────────────────────────────────────────────────────────

  /** GET /flashcards/due — cards due for review today */
  async getDueCards(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });
      const { limit, categoryId } = req.query;
      const cards = await this.spacedRepetitionService.getDueCards(userId, {
        limit,
        categoryId,
      });
      res.json({ flashcards: cards, count: cards.length });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  /** GET /flashcards/review-stats — due/new/learned counts */
  async getReviewStats(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });
      const stats = await this.spacedRepetitionService.getReviewStats(userId);
      res.json(stats);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  /** POST /flashcards/:id/review — submit SM-2 quality rating */
  async submitReview(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });
      const { id } = req.params;
      const quality = parseInt(req.body.quality, 10);
      if (!id)
        return res.status(400).json({ error: "Flashcard ID is required" });
      const result = await this.spacedRepetitionService.submitReview(
        userId,
        id,
        quality,
      );
      res.json(result);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  /** GET /flashcards/search?q=&categoryId= — search by text */
  async searchFlashCards(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });
      const { q, categoryId, limit } = req.query;
      if (!q)
        return res
          .status(400)
          .json({ error: "Parámetro de búsqueda 'q' requerido" });
      const cards = await this.spacedRepetitionService.searchFlashCards(
        userId,
        q,
        categoryId || null,
        parseInt(limit) || 50,
      );
      res.json({ flashcards: cards, count: cards.length });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  /** GET /flashcards/export?categoryId=&format=csv — download CSV */
  async exportFlashCards(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });
      const { categoryId } = req.query;
      const csv = await this.spacedRepetitionService.exportToCsv(
        userId,
        categoryId || null,
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="flashcards.csv"',
      );
      res.send("\uFEFF" + csv); // BOM for Excel UTF-8 detection
    } catch (error) {
      this._handleError(error, res);
    }
  }
}

module.exports = FlashCardController;

/**
 * Controller class for flashcard operations
 * Handles HTTP requests and responses for flashcard generation, creation and retrieval
 */
class FlashCardController {
  constructor(
    flashCardService,
    manualFlashCardService,
    flashCardRepository,
    generationJobService,
  ) {
    this.flashCardService = flashCardService;
    this.manualFlashCardService = manualFlashCardService;
    this.flashCardRepository = flashCardRepository;
    this.generationJobService = generationJobService;
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

    if (!file && !text) {
      throw new Error(
        "No se proporcionó ningún archivo ni texto. Envíe al menos una de las opciones.",
      );
    }

    return { file, text, quantity };
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

      const { file, text } = this._validateAndExtractInput(req);

      const flashCard = await this.flashCardService.processInput({
        file,
        text,
        quantity: 1,
        userId,
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

      const { file, text, quantity } = this._validateAndExtractInput(req);

      const flashCards = await this.flashCardService.processInput({
        file,
        text,
        quantity,
        userId,
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

      const { file, text, quantity } = this._validateAndExtractInput(req);
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
    if (error.message && error.message.includes("request_too_large")) {
      return res.status(413).json({
        error:
          "La solicitud a la API de Groq es demasiado grande. Intenta con un documento más corto o reduce el contenido.",
      });
    }

    if (error.message && error.message.includes("No se proporcionó")) {
      return res.status(400).json({ error: error.message });
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

      const { question, answer, options, categoryId } = req.body;

      if (!question || !answer || !options) {
        return res.status(400).json({
          error:
            "Se requieren question, answer y options para crear una flashcard manual.",
        });
      }

      const flashCard = await this.manualFlashCardService.createFlashCard(
        {
          question,
          answer,
          options,
        },
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

  async saveFlashCards(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { flashcards, categoryId } = req.body;

      if (
        !flashcards ||
        !Array.isArray(flashcards) ||
        flashcards.length === 0
      ) {
        return res.status(400).json({
          error:
            "Se requiere un array 'flashcards' con al menos una flashcard.",
        });
      }

      const createdFlashCards =
        await this.manualFlashCardService.createFlashCards(
          flashcards,
          userId,
          categoryId,
        );

      res.status(201).json({
        message: `${createdFlashCards.length} flashcards guardadas exitosamente`,
        flashcards: createdFlashCards,
      });
    } catch (error) {
      this._handleError(error, res);
    }
  }
  /**
   * Retrieves all flashcards with optional filtering
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getFlashCards(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { source, limit = 10, offset = 0, categoryId } = req.query;

      const filters = {
        userId, // Always filter by authenticated user
      };
      if (source && ["ai", "manual"].includes(source)) {
        filters.source = source;
      }
      if (categoryId) {
        filters.categoryId = categoryId;
      }
      filters.limit = Math.min(parseInt(limit) || 10, 100); // Max 100 per request
      filters.offset = parseInt(offset) || 0;

      const flashcards = await this.flashCardRepository.findAll(filters);

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

      const flashcard = await this.flashCardRepository.findById(id, userId);

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
}

module.exports = FlashCardController;

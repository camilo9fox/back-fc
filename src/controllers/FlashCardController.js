/**
 * Controller class for flashcard operations
 * Handles HTTP requests and responses for flashcard generation
 */
class FlashCardController {
  constructor(flashCardService) {
    this.flashCardService = flashCardService;
  }

  /**
   * Handles the generation of flashcards from uploaded files
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async generateFlashCard(req, res) {
    try {
      const text =
        typeof req.body.text === "string" ? req.body.text.trim() : "";
      const file = req.file || null;

      if (!file && !text) {
        return res.status(400).json({
          error:
            "No se proporcionó ningún archivo ni texto. Envíe al menos una de las opciones.",
        });
      }

      const flashCard = await this.flashCardService.processInput({
        file,
        text,
      });

      res.json(flashCard);
    } catch (error) {
      console.error("Error in generateFlashCard:", error);
      if (error.message && error.message.includes("request_too_large")) {
        return res.status(413).json({
          error:
            "La solicitud a la API de Groq es demasiado grande. Intenta con un documento más corto o reduce el contenido.",
        });
      }

      res
        .status(500)
        .json({ error: error.message || "Error interno del servidor" });
    }
  }

  async generateFlashCards(req, res) {
    try {
      const text =
        typeof req.body.text === "string" ? req.body.text.trim() : "";
      const file = req.file || null;
      const quantity = req.body.quantity || 1;

      if (!file && !text) {
        return res.status(400).json({
          error:
            "No se proporcionó ningún archivo ni texto. Envíe al menos una de las opciones.",
        });
      }

      const flashCards = await this.flashCardService.processInput({
        file,
        text,
        quantity,
      });

      res.json(flashCards);
    } catch (error) {
      console.error("Error in generateFlashCards:", error);
      if (error.message && error.message.includes("request_too_large")) {
        return res.status(413).json({
          error:
            "La solicitud a la API de Groq es demasiado grande. Intenta con un documento más corto o reduce el contenido.",
        });
      }

      res
        .status(500)
        .json({ error: error.message || "Error interno del servidor" });
    }
  }

  /**
   * Test endpoint
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  test(req, res) {
    res.json({ message: "Backend funcionando correctamente" });
  }
}

module.exports = FlashCardController;

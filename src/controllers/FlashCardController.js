/**
 * Controller class for flashcard operations
 * Handles HTTP requests and responses for flashcard generation
 */
class FlashCardController {
  constructor(flashCardService) {
    this.flashCardService = flashCardService;
  }

  /**
   * Validates and extracts input parameters from request
   * @param {Object} req - Express request object
   * @returns {Object} Validated input parameters
   */
  _validateAndExtractInput(req) {
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    const file = req.file || null;
    const quantity = req.body.quantity || 1;

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
      const { file, text } = this._validateAndExtractInput(req);

      const flashCard = await this.flashCardService.processInput({
        file,
        text,
        quantity: 1,
      });

      res.json(flashCard[0]); // Return single flashcard
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async generateFlashCards(req, res) {
    try {
      const { file, text, quantity } = this._validateAndExtractInput(req);

      const flashCards = await this.flashCardService.processInput({
        file,
        text,
        quantity,
      });

      res.json(flashCards);
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
   * Test endpoint
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  test(req, res) {
    res.json({ message: "Backend funcionando correctamente" });
  }
}

module.exports = FlashCardController;

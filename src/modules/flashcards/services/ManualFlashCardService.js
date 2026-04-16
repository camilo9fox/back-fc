const FlashCardDto = require("../dtos/FlashCardDto");

/**
 * Service class for manual flashcard creation
 * Handles user-created flashcards with validation and persistence
 * Follows Single Responsibility Principle - only handles manual flashcard operations
 */
class ManualFlashCardService {
  constructor(flashCardRepository, categoryService) {
    this.flashCardRepository = flashCardRepository;
    this.categoryService = categoryService;
  }

  /**
   * Creates a validated flashcard from user input and saves it to database
   * @param {Object} flashCardData - User provided flashcard data
   * @param {string} flashCardData.question - The question text
   * @param {string} flashCardData.answer - The correct answer
   * @param {Array<string>} flashCardData.options - Array of options (must include answer)
   * @param {string} userId - User ID (required)
   * @param {string} categoryId - Category ID (optional, will use default "General" if not provided)
   * @returns {Promise<Object>} Created flashcard data with ID and timestamps
   */
  async createFlashCard({ question, answer }, userId, categoryId = null) {
    if (!userId) {
      throw new Error("User ID is required to create flashcard");
    }

    // If no categoryId provided, get the default "General" category
    let finalCategoryId = categoryId;
    if (!finalCategoryId) {
      try {
        const defaultCategory =
          await this.categoryService.getDefaultCategory(userId);
        finalCategoryId = defaultCategory.id;
      } catch (error) {
        console.warn(
          "Could not find default category, creating flashcard without category:",
          error,
        );
      }
    }

    // Validate the flashcard data
    const validatedFlashCard = this._validateFlashCardData({
      question,
      answer,
    });

    // Save to database
    try {
      const savedFlashCard = await this.flashCardRepository.create({
        ...validatedFlashCard,
        source: "manual",
        userId,
        categoryId: finalCategoryId,
      });

      return savedFlashCard;
    } catch (error) {
      console.error("Error saving flashcard to database:", error);
      throw new Error("Error al guardar la flashcard en la base de datos");
    }
  }

  /**
   * Creates multiple validated flashcards from user input and saves them to database
   * @param {Array<Object>} flashCardsData - Array of flashcard data objects
   * @param {string} userId - User ID (required)
   * @param {string} categoryId - Category ID (optional)
   * @returns {Promise<Array<Object>>} Array of created flashcard data with IDs and timestamps
   */
  async createFlashCards(flashCardsData, userId, categoryId = null) {
    if (!userId) {
      throw new Error("User ID is required to create flashcards");
    }

    if (!Array.isArray(flashCardsData) || flashCardsData.length === 0) {
      throw new Error("Debe proporcionar al menos una flashcard.");
    }

    if (flashCardsData.length > 20) {
      throw new Error(
        "No se pueden crear más de 20 flashcards manuales a la vez.",
      );
    }

    const validatedFlashCards = [];

    // Validate all flashcards first
    for (let i = 0; i < flashCardsData.length; i++) {
      try {
        const validatedCard = this._validateFlashCardData(flashCardsData[i]);
        const source = flashCardsData[i].source === "ai" ? "ai" : "manual";
        const cardCategoryId = flashCardsData[i].categoryId || categoryId;
        validatedFlashCards.push({
          ...validatedCard,
          source,
          categoryId: cardCategoryId,
        });
      } catch (error) {
        throw new Error(`Error en la flashcard ${i + 1}: ${error.message}`);
      }
    }

    // Save all to database
    try {
      const savedFlashCards = await this.flashCardRepository.createMany(
        validatedFlashCards,
        userId,
        categoryId,
      );
      return savedFlashCards;
    } catch (error) {
      console.error("Error saving flashcards to database:", error);
      throw new Error("Error al guardar las flashcards en la base de datos");
    }
  }

  /**
   * Validates flashcard data (extracted for reuse)
   * @param {Object} flashCardData - Flashcard data to validate
   * @returns {Object} Validated flashcard data
   * @private
   */
  _validateFlashCardData({ question, answer }) {
    if (
      !question ||
      typeof question !== "string" ||
      question.trim().length === 0
    ) {
      throw new Error("La pregunta es requerida y debe ser un texto válido.");
    }

    if (!answer || typeof answer !== "string" || answer.trim().length === 0) {
      throw new Error("La respuesta es requerida y debe ser un texto válido.");
    }

    return {
      question: question.trim(),
      answer: answer.trim(),
    };
  }
}

module.exports = ManualFlashCardService;

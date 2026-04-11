const FlashCardDto = require("../dtos/FlashCardDto");
const config = require("../../../shared/config/config");

/**
 * Service class for flashcard orchestration
 * Encapsula la lógica de archivo, Groq y validación de DTO
 */
class FlashCardService {
  constructor(
    groqService,
    fileService,
    documentProcessingService,
    flashCardRepository,
    categoryService,
  ) {
    this.groqService = groqService;
    this.fileService = fileService;
    this.documentProcessingService = documentProcessingService;
    this.flashCardRepository = flashCardRepository;
    this.categoryService = categoryService;
    // Maximum content size before sending to Groq
    this.MAX_CONTENT_LENGTH = config.limits.maxContentLength;
  }

  /**
   * Process input and generate a validated flashcard
   * @param {Object} params
   * @param {Object|null} params.file - Uploaded file object
   * @param {string} params.text - Optional plain text content
   * @param {string} params.userId - User ID (required)
   * @returns {Promise<Object>} Validated flashcard data
   */
  async processInput({ file, text, quantity = 1, userId }) {
    if (!userId) {
      throw new Error("User ID is required to generate flashcards");
    }

    if (
      quantity < config.limits.minFlashCards ||
      quantity > config.limits.maxFlashCards
    ) {
      throw new Error(
        `La cantidad debe estar entre ${config.limits.minFlashCards} y ${config.limits.maxFlashCards} flashcards`,
      );
    }

    let documentContent = "";

    if (file) {
      const fileText = await this.fileService.extractText(file);
      documentContent += fileText;
    }

    if (text) {
      if (documentContent.length) {
        documentContent += "\n\n" + text;
      } else {
        documentContent = text;
      }
    }

    if (!documentContent.trim()) {
      throw new Error("El contenido del documento está vacío.");
    }

    console.log(
      `FlashCardService: contenido extraído=${documentContent.length} caracteres`,
    );

    let processedContent = documentContent;
    if (documentContent.length > this.MAX_CONTENT_LENGTH) {
      processedContent = await this.processLargeDocument(documentContent);
    } else {
      processedContent =
        this.documentProcessingService.validateAndTruncateContent(
          documentContent,
          this.MAX_CONTENT_LENGTH,
        );
    }

    console.log(
      `FlashCardService: contenido final enviado a Groq=${processedContent.length} caracteres`,
    );

    const flashCardDataArray = await this.groqService.generateFlashCards(
      processedContent,
      quantity,
    );
    const truncatedFlashCardDataArray = flashCardDataArray.slice(0, quantity);
    console.log({ flashCardDataArray: truncatedFlashCardDataArray });

    // Get default category for the user
    let defaultCategoryId = null;
    try {
      const defaultCategory =
        await this.categoryService.getDefaultCategory(userId);
      defaultCategoryId = defaultCategory.id;
    } catch (error) {
      console.warn(
        "Could not find default category for AI-generated flashcards:",
        error,
      );
    }

    const flashCards = [];
    for (const flashCardData of truncatedFlashCardDataArray) {
      const flashCardDto = new FlashCardDto(
        flashCardData.question,
        flashCardData.answer,
        flashCardData.options,
      );

      if (!flashCardDto.isValid()) {
        throw new Error(`Datos de flashcard inválidos generados por IA`);
      }

      flashCards.push({
        question: flashCardDto.question,
        answer: flashCardDto.answer,
        options: flashCardDto.options,
        categoryId: defaultCategoryId, // Include default category
      });
    }

    return flashCards;
  }

  /**
   * Validates content length and truncates if necessary
   * @param {string} content - The document content
   * @returns {string} Validated and potentially truncated content
   */
  async processLargeDocument(content) {
    const chunks = this.documentProcessingService.splitIntoChunks(content);
    console.log(
      `FlashCardService: documento grande dividido en ${chunks.length} chunks`,
    );

    const summaries =
      await this.documentProcessingService.processChunksWithDelay(
        chunks,
        async (chunk, index, totalChunks) => {
          const summary = await this.groqService.summarizeChunk(chunk);
          console.log(
            `FlashCardService: chunk ${index + 1}/${totalChunks} -> ${summary.length} caracteres`,
          );
          return summary;
        },
      );

    let combinedSummary =
      this.documentProcessingService.combineResults(summaries);
    console.log(
      `FlashCardService: resumen combinado=${combinedSummary.length} caracteres`,
    );

    if (combinedSummary.length > this.MAX_CONTENT_LENGTH) {
      combinedSummary =
        await this.groqService.summarizeSummary(combinedSummary);
      console.log(
        `FlashCardService: resumen final comprimido=${combinedSummary.length} caracteres`,
      );
    }

    return this.documentProcessingService.validateAndTruncateContent(
      combinedSummary,
      this.MAX_CONTENT_LENGTH,
    );
  }
}

module.exports = FlashCardService;

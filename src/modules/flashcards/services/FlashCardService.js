const FlashCardDto = require("../dtos/FlashCardDto");
const config = require("../../../shared/config/config");
const { ValidationError } = require("../../../shared/errors/AppError");

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
    this.MAX_CONTENT_LENGTH = config.limits.maxContentLength;
    this.ASYNC_RECOMMENDED_CONTENT_LENGTH = 5000;
    this.FAST_PATH_MIN_CHUNKS = 6;
  }

  reportProgress(onProgress, stage, percent, metadata = {}) {
    if (typeof onProgress === "function") {
      onProgress({
        stage,
        percent,
        metadata,
      });
    }
  }

  /**
   * Process input and generate a validated flashcard
   * @param {Object} params
   * @param {Object|null} params.file - Uploaded file object
   * @param {string} params.text - Optional plain text content
   * @param {string} params.userId - User ID (required)
   * @returns {Promise<Object>} Validated flashcard data
   */
  async processInput({ file, text, quantity = 1, userId, onProgress }) {
    if (!userId) {
      throw new ValidationError("User ID is required to generate flashcards");
    }

    if (
      quantity < config.limits.minFlashCards ||
      quantity > config.limits.maxFlashCards
    ) {
      throw new ValidationError(
        `La cantidad debe estar entre ${config.limits.minFlashCards} y ${config.limits.maxFlashCards} flashcards`,
      );
    }

    let documentContent = "";

    this.reportProgress(onProgress, "Preparando contenido", 5);

    if (file) {
      this.reportProgress(onProgress, "Extrayendo texto del archivo", 12, {
        fileName: file.originalname,
      });
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
      throw new ValidationError("El contenido del documento está vacío.");
    }

    documentContent =
      this.documentProcessingService.normalizeText(documentContent);

    console.log(
      `FlashCardService: contenido extraído=${documentContent.length} caracteres`,
    );

    let processedContent = documentContent;
    if (documentContent.length > this.MAX_CONTENT_LENGTH) {
      processedContent = await this.processLargeDocument(documentContent, {
        onProgress,
      });
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

    this.reportProgress(onProgress, "Generando flashcards", 82);

    const flashCardDataArray = await this.groqService.generateFlashCards(
      processedContent,
      quantity,
    );
    const truncatedFlashCardDataArray = flashCardDataArray.slice(0, quantity);

    if (truncatedFlashCardDataArray.length < quantity) {
      throw new ValidationError(
        `La generación devolvió ${truncatedFlashCardDataArray.length}/${quantity} flashcards. Intenta nuevamente.`,
      );
    }

    this.reportProgress(onProgress, "Validando flashcards", 92);

    const flashCards = [];
    for (const flashCardData of truncatedFlashCardDataArray) {
      const flashCardDto = new FlashCardDto(
        flashCardData.question,
        flashCardData.answer,
      );

      if (!flashCardDto.isValid()) {
        throw new ValidationError(
          `Datos de flashcard inválidos generados por IA`,
        );
      }

      flashCards.push({
        question: flashCardDto.question,
        answer: flashCardDto.answer,
      });
    }

    this.reportProgress(onProgress, "Flashcards listas", 100, {
      count: flashCards.length,
    });

    return flashCards;
  }

  shouldPreferAsync({ file, text }) {
    const estimatedLength = (text || "").length + (file ? file.size / 2 : 0);
    return estimatedLength >= this.ASYNC_RECOMMENDED_CONTENT_LENGTH;
  }

  /**
   * Prepares a large document for generation by delegating to the shared
   * DocumentProcessingService.buildStudyContext pipeline.
   */
  async processLargeDocument(content, { onProgress } = {}) {
    this.reportProgress(onProgress, "Analizando el documento", 20);
    return this.documentProcessingService.buildStudyContext(
      content,
      this.groqService,
      {
        maxLength: this.MAX_CONTENT_LENGTH,
        fastPathMinChunks: this.FAST_PATH_MIN_CHUNKS,
        onProgress: ({ stage, percent }) => {
          // Map 15–78 range from buildStudyContext into the same range
          this.reportProgress(onProgress, stage, percent);
        },
      },
    );
  }
}

module.exports = FlashCardService;

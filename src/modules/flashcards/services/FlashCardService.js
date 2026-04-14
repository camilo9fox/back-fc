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
      throw new Error("El contenido del documento está vacío.");
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
      throw new Error(
        `La generación devolvió ${truncatedFlashCardDataArray.length}/${quantity} flashcards. Intenta nuevamente.`,
      );
    }

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

    this.reportProgress(onProgress, "Validando flashcards", 92);

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
   * Validates content length and truncates if necessary
   * @param {string} content - The document content
   * @returns {string} Validated and potentially truncated content
   */
  async processLargeDocument(content, { onProgress } = {}) {
    const chunks = this.documentProcessingService.splitIntoChunks(content);
    console.log(
      `FlashCardService: documento grande dividido en ${chunks.length} chunks`,
    );

    this.reportProgress(onProgress, "Analizando el documento", 20, {
      chunks: chunks.length,
    });

    if (chunks.length >= this.FAST_PATH_MIN_CHUNKS) {
      this.reportProgress(onProgress, "Modo rapido para documento grande", 36, {
        chunks: chunks.length,
      });

      const fastContext = this.documentProcessingService.buildFastContext(
        chunks,
        this.MAX_CONTENT_LENGTH,
      );

      this.reportProgress(onProgress, "Material listo para generar", 78, {
        mode: "fast-path",
      });

      return this.documentProcessingService.validateAndTruncateContent(
        fastContext,
        this.MAX_CONTENT_LENGTH,
      );
    }

    const notes =
      await this.documentProcessingService.processChunksConcurrently(
        chunks,
        async (chunk, index, totalChunks) => {
          const note = await this.groqService.extractStudyNotes(chunk, {
            index,
            totalChunks,
          });
          return note;
        },
        {
          concurrency: this.documentProcessingService.MAX_PARALLEL_CHUNKS,
          onProgress: ({ completed, total }) => {
            const percent = 20 + Math.round((completed / total) * 45);
            this.reportProgress(
              onProgress,
              `Analizando seccion ${completed} de ${total}`,
              percent,
              { completed, total },
            );
          },
        },
      );

    let combinedSummary =
      this.documentProcessingService.combineStructuredNotes(notes);
    console.log(
      `FlashCardService: notas estructuradas=${combinedSummary.length} caracteres`,
    );

    this.reportProgress(onProgress, "Consolidando ideas clave", 70);

    if (combinedSummary.length > this.MAX_CONTENT_LENGTH) {
      combinedSummary = await this.groqService.compressKnowledgeContext(
        combinedSummary,
        this.MAX_CONTENT_LENGTH,
      );
      console.log(
        `FlashCardService: notas comprimidas=${combinedSummary.length} caracteres`,
      );
    }

    this.reportProgress(onProgress, "Material listo para generar", 78);

    return this.documentProcessingService.validateAndTruncateContent(
      combinedSummary,
      this.MAX_CONTENT_LENGTH,
    );
  }
}

module.exports = FlashCardService;

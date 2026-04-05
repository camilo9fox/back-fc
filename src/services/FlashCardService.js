const FlashCardDto = require("../dtos/FlashCardDto");

/**
 * Service class for flashcard orchestration
 * Encapsula la lógica de archivo, Groq y validación de DTO
 */
class FlashCardService {
  constructor(groqService, fileService, documentProcessingService) {
    this.groqService = groqService;
    this.fileService = fileService;
    this.documentProcessingService = documentProcessingService;
    // Maximum content size before sending to Groq
    this.MAX_CONTENT_LENGTH = 2500; // ~600 tokens, leaving margin for prompt
  }

  /**
   * Process input and generate a validated flashcard
   * @param {Object} params
   * @param {Object|null} params.file - Uploaded file object
   * @param {string} params.text - Optional plain text content
   * @returns {Promise<Object>} Validated flashcard data
   */
  async processInput({ file, text, quantity = 1 }) {
    if (quantity < 1 || quantity > 20) {
      throw new Error("La cantidad debe estar entre 1 y 20 flashcards");
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

    const flashCards = [];
    for (let i = 0; i < quantity; i++) {
      const flashCardData =
        await this.groqService.generateFlashCard(processedContent);
      const flashCardDto = new FlashCardDto(
        flashCardData.question,
        flashCardData.answer,
        flashCardData.options,
      );

      if (!flashCardDto.isValid()) {
        throw new Error(
          `Datos de flashcard inválidos generados por IA (intento ${i + 1})`,
        );
      }

      flashCards.push({
        question: flashCardDto.question,
        answer: flashCardDto.answer,
        options: flashCardDto.options,
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

  splitIntoChunks(text, maxChunkSize) {
    const sentences = text.match(/[^.!?]+[.!?]+[\])'"`’”]*|.+$/g) || [text];
    const chunks = [];
    let current = "";

    for (const sentence of sentences) {
      if (current.length + sentence.length <= maxChunkSize) {
        current += sentence;
      } else {
        if (current.trim()) {
          chunks.push(current.trim());
        }

        if (sentence.length > maxChunkSize) {
          let start = 0;
          while (start < sentence.length) {
            chunks.push(sentence.slice(start, start + maxChunkSize).trim());
            start += maxChunkSize;
          }
          current = "";
        } else {
          current = sentence;
        }
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks;
  }

  validateAndTruncateContent(content) {
    if (content.length > this.MAX_CONTENT_LENGTH) {
      console.warn(
        `Contenido truncado de ${content.length} a ${this.MAX_CONTENT_LENGTH} caracteres`,
      );
      // Truncar al final de una oración si es posible
      let truncated = content.substring(0, this.MAX_CONTENT_LENGTH);
      const lastSentenceEnd = Math.max(
        truncated.lastIndexOf("."),
        truncated.lastIndexOf("!"),
        truncated.lastIndexOf("?"),
      );

      if (lastSentenceEnd > this.MAX_CONTENT_LENGTH * 0.8) {
        truncated = truncated.substring(0, lastSentenceEnd + 1);
      }

      return truncated.trim();
    }

    return content;
  }
}

module.exports = FlashCardService;

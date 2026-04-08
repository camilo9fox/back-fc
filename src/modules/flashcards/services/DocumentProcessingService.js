/**
 * Service class for processing large documents
 * Handles splitting documents into chunks and processing each chunk with delays
 * Follows Single Responsibility Principle - reusable across modules
 */
class DocumentProcessingService {
  constructor() {
    // Configuración de procesamiento de documentos
    this.MAX_CHUNK_LENGTH = 900; // Tamaño máximo de chunk en caracteres
    this.CHUNK_PROCESS_DELAY = 3000; // Delay entre procesamiento de chunks en ms
  }

  /**
   * Splits a document into chunks based on sentence boundaries
   * @param {string} text - The document text to split
   * @param {number} maxChunkSize - Maximum size of each chunk
   * @returns {Array<string>} Array of text chunks
   */
  splitIntoChunks(text, maxChunkSize = this.MAX_CHUNK_LENGTH) {
    const sentences = text.match(/[^.!?]+[.!?]+[\])'"`'"]*|.+$/g) || [text];
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

  /**
   * Processes chunks with a custom processing function and delays between requests
   * @param {Array<string>} chunks - Array of text chunks to process
   * @param {Function} processingFunction - Async function that processes each chunk
   * @param {number} delayMs - Delay between chunk processing in milliseconds
   * @returns {Promise<Array>} Array of processed results
   */
  async processChunksWithDelay(
    chunks,
    processingFunction,
    delayMs = this.CHUNK_PROCESS_DELAY,
  ) {
    const results = [];

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const result = await processingFunction(chunk, index, chunks.length);
      results.push(result);

      // Add delay between chunks to avoid rate limits
      if (index < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  /**
   * Combines processed results with line breaks
   * @param {Array} results - Array of processed results to combine
   * @returns {string} Combined results as string
   */
  combineResults(results) {
    return results.join("\n\n");
  }

  /**
   * Validates and truncates content if it exceeds a maximum length
   * @param {string} content - Content to validate and truncate
   * @param {number} maxLength - Maximum allowed length
   * @returns {string} Validated and potentially truncated content
   */
  validateAndTruncateContent(content, maxLength) {
    if (content.length > maxLength) {
      console.warn(
        `Contenido truncado de ${content.length} a ${maxLength} caracteres`,
      );

      // Truncate at end of sentence if possible
      let truncated = content.substring(0, maxLength);
      const lastSentenceEnd = Math.max(
        truncated.lastIndexOf("."),
        truncated.lastIndexOf("!"),
        truncated.lastIndexOf("?"),
      );

      if (lastSentenceEnd > maxLength * 0.8) {
        truncated = truncated.substring(0, lastSentenceEnd + 1);
      }

      return truncated.trim();
    }

    return content;
  }
}

module.exports = DocumentProcessingService;

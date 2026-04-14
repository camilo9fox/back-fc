/**
 * Service class for processing large documents
 * Handles splitting documents into chunks and processing each chunk with delays
 * Follows Single Responsibility Principle - reusable across modules
 */
class DocumentProcessingService {
  constructor() {
    this.MAX_CHUNK_LENGTH = 5200;
    this.CHUNK_OVERLAP = 120;
    this.MAX_PARALLEL_CHUNKS = 6;
    this.METADATA_LINE_PATTERNS = [
      /\bisbn\b/i,
      /\beditorial\b/i,
      /\bimpreso en\b/i,
      /\bpublicado por\b/i,
      /\btraducci[oó]n\b/i,
      /\btraductor(?:a|es)?\b/i,
      /\bcopyright\b/i,
      /\bphilemon foundation\b/i,
      /\bserie\b\s+filem[oó]n\b/i,
      /^\s*(?:pr[oó]logo|prefacio|dedicatoria|agradecimientos)\s*$/i,
      /^\s*p[aá]gina\s+\d+\s*$/i,
    ];
  }

  normalizeText(text) {
    const cleaned = text
      .replace(/\r/g, "")
      .replace(/-\n/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    return this.removeLowValueLines(cleaned);
  }

  removeLowValueLines(text) {
    const lines = text.split("\n");
    const filteredLines = lines.filter((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        return true;
      }

      if (trimmedLine.length <= 2) {
        return false;
      }

      if (/^\d+$/.test(trimmedLine)) {
        return false;
      }

      for (const pattern of this.METADATA_LINE_PATTERNS) {
        if (pattern.test(trimmedLine)) {
          return false;
        }
      }

      return true;
    });

    return filteredLines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Splits a document into chunks based on sentence boundaries
   * @param {string} text - The document text to split
   * @param {number} maxChunkSize - Maximum size of each chunk
   * @returns {Array<string>} Array of text chunks
   */
  splitIntoChunks(
    text,
    maxChunkSize = this.MAX_CHUNK_LENGTH,
    overlapSize = this.CHUNK_OVERLAP,
  ) {
    const normalizedText = this.normalizeText(text);
    const paragraphs = normalizedText.split(/\n{2,}/).filter(Boolean);
    const chunks = [];
    let current = "";

    for (const paragraph of paragraphs) {
      if (paragraph.length > maxChunkSize) {
        const paragraphChunks = this.splitLargeBlock(paragraph, maxChunkSize);
        for (const paragraphChunk of paragraphChunks) {
          if (current.trim()) {
            chunks.push(current.trim());
          }
          current = paragraphChunk;
          if (current.trim()) {
            chunks.push(current.trim());
          }
          current = this.getOverlap(current, overlapSize);
        }
        continue;
      }

      const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
      if (candidate.length <= maxChunkSize) {
        current = candidate;
      } else {
        if (current.trim()) {
          chunks.push(current.trim());
        }
        current = this.getOverlap(current, overlapSize);
        current = current ? `${current}\n\n${paragraph}` : paragraph;
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks;
  }

  splitLargeBlock(block, maxChunkSize) {
    const sentences = block.match(/[^.!?\n]+(?:[.!?]+|$)/g) || [block];
    const chunks = [];
    let current = "";

    for (const sentence of sentences) {
      const candidate = `${current} ${sentence}`.trim();
      if (candidate.length <= maxChunkSize) {
        current = candidate;
      } else {
        if (current) {
          chunks.push(current);
        }

        if (sentence.length > maxChunkSize) {
          for (let start = 0; start < sentence.length; start += maxChunkSize) {
            chunks.push(sentence.slice(start, start + maxChunkSize).trim());
          }
          current = "";
        } else {
          current = sentence.trim();
        }
      }
    }

    if (current) {
      chunks.push(current);
    }

    return chunks;
  }

  getOverlap(text, overlapSize) {
    if (!text || text.length <= overlapSize) {
      return text || "";
    }

    return text.slice(-overlapSize).trim();
  }

  /**
   * Processes chunks with a custom processing function and delays between requests
   * @param {Array<string>} chunks - Array of text chunks to process
   * @param {Function} processingFunction - Async function that processes each chunk
   * @param {number} delayMs - Delay between chunk processing in milliseconds
   * @returns {Promise<Array>} Array of processed results
   */
  async processChunksConcurrently(chunks, processingFunction, options = {}) {
    const concurrency = Math.max(
      1,
      Math.min(options.concurrency || this.MAX_PARALLEL_CHUNKS, chunks.length),
    );
    const results = new Array(chunks.length);
    let nextIndex = 0;
    let completed = 0;

    const worker = async () => {
      while (nextIndex < chunks.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const result = await processingFunction(
          chunks[currentIndex],
          currentIndex,
          chunks.length,
        );
        results[currentIndex] = result;
        completed += 1;

        if (typeof options.onProgress === "function") {
          options.onProgress({
            completed,
            total: chunks.length,
            index: currentIndex,
          });
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    return results;
  }

  combineStructuredNotes(results) {
    const keyPoints = new Set();
    const definitions = new Set();
    const facts = new Set();
    const examples = new Set();

    for (const result of results) {
      for (const keyPoint of result.keyPoints || []) {
        keyPoints.add(keyPoint.trim());
      }
      for (const definition of result.definitions || []) {
        definitions.add(definition.trim());
      }
      for (const fact of result.facts || []) {
        facts.add(fact.trim());
      }
      for (const example of result.examples || []) {
        examples.add(example.trim());
      }
    }

    return [
      "PUNTOS CLAVE:",
      ...Array.from(keyPoints)
        .slice(0, 25)
        .map((item) => `- ${item}`),
      "",
      "DEFINICIONES:",
      ...Array.from(definitions)
        .slice(0, 20)
        .map((item) => `- ${item}`),
      "",
      "DATOS Y RELACIONES:",
      ...Array.from(facts)
        .slice(0, 25)
        .map((item) => `- ${item}`),
      "",
      "EJEMPLOS Y APLICACIONES:",
      ...Array.from(examples)
        .slice(0, 15)
        .map((item) => `- ${item}`),
    ]
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  buildFastContext(chunks, maxLength) {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return "";
    }

    const pickIndices = new Set([
      Math.floor(chunks.length * 0.2),
      Math.floor(chunks.length * 0.4),
      Math.floor(chunks.length * 0.6),
      Math.floor(chunks.length * 0.8),
    ]);

    // Also prioritize denser chunks by unique word count to preserve salient info.
    const scored = chunks
      .map((chunk, index) => {
        const words = (chunk.toLowerCase().match(/[a-z0-9áéíóúñü]{3,}/gi) || [])
          .map((word) => word.trim())
          .filter(Boolean);
        const uniqueWordCount = new Set(words).size;
        const conceptMatches = (
          chunk.match(
            /\b(concepto|definici[oó]n|proceso|m[eé]todo|teor[ií]a|modelo|evidencia|causa|efecto|aplicaci[oó]n|hip[oó]tesis|an[aá]lisis|resultado|conclusi[oó]n)\b/gi,
          ) || []
        ).length;
        const metadataPenalty = this.METADATA_LINE_PATTERNS.some((pattern) =>
          pattern.test(chunk),
        )
          ? 25
          : 0;
        const score = uniqueWordCount + conceptMatches * 8 - metadataPenalty;
        return { index, chunk, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    for (const item of scored) {
      pickIndices.add(item.index);
    }

    const selectedChunks = Array.from(pickIndices)
      .filter((index) => index >= 0 && index < chunks.length)
      .sort((a, b) => a - b)
      .map((index) => chunks[index]);

    const joined = selectedChunks.join("\n\n");
    return this.validateAndTruncateContent(joined, maxLength);
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

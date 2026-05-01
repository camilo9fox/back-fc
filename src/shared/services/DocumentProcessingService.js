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

  normalizeForDedup(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\W_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  combineStructuredNotes(results, limits = {}) {
    const keyPoints = new Map();
    const definitions = new Map();
    const facts = new Map();
    const examples = new Map();

    const addUnique = (targetMap, value) => {
      const cleaned = String(value || "").trim();
      if (!cleaned) return;
      const key = this.normalizeForDedup(cleaned);
      if (!key || targetMap.has(key)) return;
      targetMap.set(key, cleaned);
    };

    for (const result of results) {
      for (const keyPoint of result.keyPoints || []) {
        addUnique(keyPoints, keyPoint);
      }
      for (const definition of result.definitions || []) {
        addUnique(definitions, definition);
      }
      for (const fact of result.facts || []) {
        addUnique(facts, fact);
      }
      for (const example of result.examples || []) {
        addUnique(examples, example);
      }
    }

    const {
      keyPointsLimit = 25,
      definitionsLimit = 20,
      factsLimit = 25,
      examplesLimit = 15,
    } = limits;

    return [
      "PUNTOS CLAVE:",
      ...Array.from(keyPoints.values())
        .slice(0, keyPointsLimit)
        .map((item) => `- ${item}`),
      "",
      "DEFINICIONES:",
      ...Array.from(definitions.values())
        .slice(0, definitionsLimit)
        .map((item) => `- ${item}`),
      "",
      "DATOS Y RELACIONES:",
      ...Array.from(facts.values())
        .slice(0, factsLimit)
        .map((item) => `- ${item}`),
      "",
      "EJEMPLOS Y APLICACIONES:",
      ...Array.from(examples.values())
        .slice(0, examplesLimit)
        .map((item) => `- ${item}`),
    ]
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  buildFastContext(chunks, maxLength, density = "normal") {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return "";
    }

    const isWide = density === "wide";
    const anchorDivisor = isWide ? 4500 : 7000;
    const scoreDivisor = isWide ? 2200 : 3500;
    const maxAnchors = isWide ? 14 : 8;
    const maxScored = isWide ? 28 : 18;

    const anchorCount = Math.min(
      maxAnchors,
      Math.max(4, Math.ceil(maxLength / anchorDivisor)),
    );
    const pickIndices = new Set();
    for (let i = 1; i <= anchorCount; i += 1) {
      pickIndices.add(Math.floor((chunks.length * i) / (anchorCount + 1)));
    }

    // Also prioritize denser chunks by unique word count to preserve salient info.
    const scoredTake = Math.min(
      maxScored,
      Math.max(6, Math.ceil(maxLength / scoreDivisor)),
    );
    const scored = chunks
      .map((chunk, index) => {
        const words = (chunk.toLowerCase().match(/[a-z0-9áéíóúñü]{3,}/gi) || [])
          .map((word) => word.trim())
          .filter(Boolean);
        const uniqueWordCount = new Set(words).size;
        const conceptMatches = (
          chunk.match(
            /\b(concepto|definici[oó]n|proceso|m[eé]todo|teor[ií]a|modelo|evidencia|causa|efecto|aplicaci[oó]n|hip[oó]tesis|an[aá]lisis|resultado|conclusi[oó]n|diagn[oó]stico|tratamiento|s[ií]ntoma|signo|prevenci[oó]n|cuidado|temperatura|clasificaci[oó]n|fisiopatolog[ií]a|protocolo|indicaci[oó]n|contraindic|manejo|valoraci[oó]n)\b/gi,
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
      .slice(0, scoredTake);

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

  /**
   * Universal pipeline: normalize → chunk → summarize/fast-path → compress.
   * All generation services (flashcards, quizzes, true/false, etc.) should call
   * this instead of implementing their own truncation logic.
   *
   * @param {string} rawContent   - Raw extracted text (may be very large)
   * @param {object} groqService  - GroqService instance (needed for extractStudyNotes / compressKnowledgeContext)
   * @param {object} [options]
   * @param {number} [options.maxLength=4500]        - Final char limit sent to the model
   * @param {number} [options.fastPathMinChunks=6]   - Min chunks to trigger fast-path
   * @param {Function} [options.onProgress]          - Optional progress callback ({ stage, percent })
   * @returns {Promise<string>} Study-ready context, guaranteed ≤ maxLength chars
   */
  async buildStudyContext(rawContent, groqService, options = {}) {
    const {
      maxLength = 4500,
      fastPathMinChunks = 6,
      useFastPath = true,
      fastContextDensity = "normal",
      concurrency,
      onProgress,
    } = options;

    const report = (stage, percent) => {
      if (typeof onProgress === "function") onProgress({ stage, percent });
    };

    const normalized = this.normalizeText(rawContent);
    console.log(
      `DocumentProcessingService.buildStudyContext: entrada=${normalized.length} chars`,
    );

    // Short document — nothing to do
    if (normalized.length <= maxLength) {
      return this.validateAndTruncateContent(normalized, maxLength);
    }

    const scaleFactor = Math.min(4, Math.max(1, maxLength / 4500));

    report("Analizando el documento", 15);
    const chunks = this.splitIntoChunks(normalized);
    console.log(
      `DocumentProcessingService.buildStudyContext: ${chunks.length} chunks`,
    );

    // Fast path: document is large enough → sample representative chunks
    if (useFastPath && chunks.length >= fastPathMinChunks) {
      report("Modo rápido para documento grande", 35);
      const fastContext = this.buildFastContext(
        chunks,
        maxLength,
        fastContextDensity,
      );
      report("Material listo para generar", 78);
      return this.validateAndTruncateContent(fastContext, maxLength);
    }

    // Slow path: extract structured study notes from each chunk in parallel
    report("Extrayendo ideas clave", 20);
    const notes = await this.processChunksConcurrently(
      chunks,
      async (chunk, index, totalChunks) =>
        groqService.extractStudyNotes(chunk, { index, totalChunks }),
      {
        concurrency: Math.max(
          1,
          Math.min(
            concurrency || this.MAX_PARALLEL_CHUNKS,
            this.MAX_PARALLEL_CHUNKS,
          ),
        ),
        onProgress: ({ completed, total }) => {
          const pct = 20 + Math.round((completed / total) * 45);
          report(`Analizando sección ${completed} de ${total}`, pct);
        },
      },
    );

    const combinedLimits = {
      keyPointsLimit: Math.round(25 * scaleFactor),
      definitionsLimit: Math.round(20 * scaleFactor),
      factsLimit: Math.round(25 * scaleFactor),
      examplesLimit: Math.round(15 * scaleFactor),
    };

    let combined = this.combineStructuredNotes(notes, combinedLimits);
    console.log(
      `DocumentProcessingService.buildStudyContext: notas combinadas=${combined.length} chars`,
    );

    report("Consolidando ideas clave", 70);

    if (combined.length > maxLength) {
      combined = await groqService.compressKnowledgeContext(
        combined,
        maxLength,
      );
      console.log(
        `DocumentProcessingService.buildStudyContext: comprimido=${combined.length} chars`,
      );
    }

    report("Material listo para generar", 78);
    return this.validateAndTruncateContent(combined, maxLength);
  }
}

module.exports = DocumentProcessingService;

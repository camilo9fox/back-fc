const {
  ValidationError,
  NotFoundError,
} = require("../../../shared/errors/AppError");

class StudyGuideService {
  constructor(
    studyGuideRepository,
    categoryService,
    studyGuideGenerationService,
    fileService,
    documentProcessingService,
  ) {
    this.studyGuideRepository = studyGuideRepository;
    this.categoryService = categoryService;
    this.studyGuideGenerationService = studyGuideGenerationService;
    this.fileService = fileService;
    this.documentProcessingService = documentProcessingService;
  }

  estimateDocumentScale(rawContent, actualPageCount = null) {
    const normalized = String(rawContent || "")
      .replace(/\s+/g, " ")
      .trim();
    const words = normalized ? normalized.split(" ").filter(Boolean).length : 0;
    const wordBasedPages = Math.max(1, Math.ceil(words / 450));
    // For image-heavy PDFs, word count underestimates the real size — use the
    // actual page count from pdf-parse when it's larger.
    const estimatedPages = actualPageCount
      ? Math.max(wordBasedPages, actualPageCount)
      : wordBasedPages;

    let tier = "short";
    if (estimatedPages > 50) tier = "medium";
    if (estimatedPages > 100) tier = "long";
    if (estimatedPages > 200) tier = "very_long";
    if (estimatedPages > 400) tier = "ultra";

    const profileByTier = {
      short: {
        contextMaxLength: 9000,
        maxCompletionTokens: 5500,
        summaryParagraphs: "4-6",
        conceptsMin: 10,
        termsMin: 14,
        mainPointsMin: 14,
        reviewQuestionsRange: "8-12",
        targetWordsMin: 1200,
        targetWordsMax: 2200,
      },
      medium: {
        contextMaxLength: 14000,
        maxCompletionTokens: 6500,
        summaryParagraphs: "6-8",
        conceptsMin: 14,
        termsMin: 20,
        mainPointsMin: 20,
        reviewQuestionsRange: "12-16",
        targetWordsMin: 1400,
        targetWordsMax: 2100,
      },
      long: {
        contextMaxLength: 21000,
        maxCompletionTokens: 7600,
        summaryParagraphs: "8-11",
        conceptsMin: 18,
        termsMin: 26,
        mainPointsMin: 28,
        reviewQuestionsRange: "16-22",
        targetWordsMin: 2200,
        targetWordsMax: 3200,
      },
      very_long: {
        contextMaxLength: 29000,
        maxCompletionTokens: 9000,
        summaryParagraphs: "11-14",
        conceptsMin: 24,
        termsMin: 34,
        mainPointsMin: 36,
        reviewQuestionsRange: "22-28",
        targetWordsMin: 3200,
        targetWordsMax: 4600,
      },
      ultra: {
        contextMaxLength: 36000,
        maxCompletionTokens: 10000,
        summaryParagraphs: "14-18",
        conceptsMin: 30,
        termsMin: 42,
        mainPointsMin: 48,
        reviewQuestionsRange: "28-36",
        targetWordsMin: 4500,
        targetWordsMax: 6200,
      },
    };

    return {
      estimatedPages,
      words,
      tier,
      ...profileByTier[tier],
    };
  }

  async generateGuide({ file, text, title, categoryId, userId, onProgress }) {
    const report = (stage, percent) => {
      if (typeof onProgress === "function") onProgress({ stage, percent });
    };

    if (!file && !text?.trim()) {
      throw new ValidationError(
        "Se requiere un archivo o texto para generar la guía.",
      );
    }
    if (!title?.trim()) throw new ValidationError("El título es obligatorio.");
    if (!categoryId) throw new ValidationError("La categoría es obligatoria.");

    const category = await this.categoryService.getCategoryById(
      categoryId,
      userId,
    );
    if (!category) {
      throw new NotFoundError("Categoría no encontrada o acceso denegado.");
    }

    report("Extrayendo contenido del archivo", 10);
    let content;
    let actualPageCount = null;
    if (file) {
      const meta = await this.fileService.extractTextWithMeta(file);
      content = meta.text;
      actualPageCount = meta.pageCount;
    } else {
      content = text;
    }
    const scale = this.estimateDocumentScale(content, actualPageCount);
    const isHugeDocument = scale.estimatedPages > 120;

    // Detect sparse/slide-based documents: few words per page means the content
    // is presentation-style (bullets, titles) rather than dense prose.
    // For sparse docs, extractStudyNotes compresses already-thin content and loses
    // detail. Fast path (raw text sampling) preserves the original content better.
    const wordsPerPage =
      actualPageCount && actualPageCount > 0
        ? Math.round(scale.words / actualPageCount)
        : null;
    const isSparseDocument = wordsPerPage !== null && wordsPerPage < 120;

    console.log(
      `StudyGuideService: estimatedPages=${scale.estimatedPages}, tier=${scale.tier}, ` +
        `wordsPerPage=${wordsPerPage ?? "n/a"}, sparse=${isSparseDocument}`,
    );

    report("Analizando el documento", 30);
    content = await this.documentProcessingService.buildStudyContext(
      content,
      this.studyGuideGenerationService,
      {
        maxLength: scale.contextMaxLength,
        // Sparse/slide PDFs: force fast path so raw text is sent directly to the
        // generation model instead of being compressed by extractStudyNotes, which
        // loses information from already-thin bullet-point content.
        // Huge docs: wide sampling for practical coverage.
        useFastPath: true,
        fastPathMinChunks: isSparseDocument ? 1 : 6,
        fastContextDensity: isHugeDocument ? "wide" : "normal",
        concurrency: undefined,
        onProgress: ({ stage, percent }) => {
          report(stage, 30 + Math.round(percent * 0.45));
        },
      },
    );

    report(
      `Generando guía de estudio (${scale.estimatedPages} páginas estimadas)`,
      78,
    );
    const guideContent = await this.studyGuideGenerationService.generateGuide(
      content,
      scale,
    );

    report("Guardando guía de estudio", 92);
    const saved = await this.studyGuideRepository.create({
      userId,
      categoryId,
      title: title.trim(),
      content: guideContent,
    });

    report("Completado", 100);
    return saved;
  }

  async getGuides(userId, options = {}) {
    return this.studyGuideRepository.findAllByUser(userId, options);
  }

  async getGuideById(id, userId) {
    return this.studyGuideRepository.findById(id, userId);
  }

  async deleteGuide(id, userId) {
    const guide = await this.studyGuideRepository.findById(id, userId);
    if (!guide) throw new NotFoundError("Guía de estudio no encontrada.");
    return this.studyGuideRepository.delete(id, userId);
  }
}

module.exports = StudyGuideService;

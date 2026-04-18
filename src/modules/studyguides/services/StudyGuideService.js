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
    let content = file ? await this.fileService.extractText(file) : text;

    report("Analizando el documento", 30);
    content = await this.documentProcessingService.buildStudyContext(
      content,
      this.studyGuideGenerationService,
      {
        maxLength: 4500,
        onProgress: ({ stage, percent }) => {
          report(stage, 30 + Math.round(percent * 0.45));
        },
      },
    );

    report("Generando guía de estudio", 78);
    const guideContent =
      await this.studyGuideGenerationService.generateGuide(content);

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

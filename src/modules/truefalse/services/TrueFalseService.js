const {
  TrueFalseSetDto,
  TrueFalseQuestionDto,
} = require("../dtos/TrueFalseDto");

class TrueFalseService {
  constructor(
    trueFalseRepository,
    categoryService,
    groqService,
    fileService,
    documentProcessingService,
  ) {
    this.trueFalseRepository = trueFalseRepository;
    this.categoryService = categoryService;
    this.groqService = groqService;
    this.fileService = fileService;
    this.documentProcessingService = documentProcessingService;
  }

  async createSet(setData, userId) {
    const categoryId = setData.categoryId || setData.category_id;
    const questions = (setData.questions || []).map((q, i) =>
      TrueFalseSetDto.buildQuestion(q, i),
    );
    const dto = new TrueFalseSetDto(
      setData.title,
      categoryId,
      setData.description,
      questions,
    );
    if (!dto.isValid()) {
      throw new Error(
        "Invalid set data: title, categoryId and at least one valid question are required",
      );
    }

    const category = await this.categoryService.getCategoryById(
      categoryId,
      userId,
    );
    if (!category) {
      throw new Error("Category not found or access denied");
    }

    return this.trueFalseRepository.create({
      userId,
      categoryId: dto.categoryId,
      title: dto.title,
      description: dto.description,
      questions: dto.questions,
    });
  }

  async generateSet({ file, text, title, categoryId, quantity, userId }) {
    if (!file && !text?.trim()) {
      throw new Error("Se requiere un archivo o texto para generar el set.");
    }
    if (!title?.trim()) throw new Error("El título es obligatorio.");
    if (!categoryId) throw new Error("La categoría es obligatoria.");

    const category = await this.categoryService.getCategoryById(
      categoryId,
      userId,
    );
    if (!category)
      throw new Error("Categoría no encontrada o acceso denegado.");

    let content = file ? await this.fileService.extractText(file) : text;
    content = await this.documentProcessingService.buildStudyContext(
      content,
      this.groqService,
      { maxLength: 4500 },
    );

    const rawStatements = await this.groqService.generateTrueFalseStatements(
      content,
      quantity,
    );

    // Devuelve las afirmaciones generadas sin persistir — el cliente decide si guardar
    return rawStatements.map((s, i) => ({
      statement: s.statement,
      is_true: s.is_true,
      explanation: s.explanation || null,
      order_index: i,
    }));
  }

  async getSets(userId, options = {}) {
    return this.trueFalseRepository.findAllByUser(userId, options);
  }

  async getSetById(id, userId) {
    const set = await this.trueFalseRepository.findById(id, userId);
    if (!set) throw new Error("True/false set not found");
    return set;
  }

  async updateSet(id, userId, updateData) {
    const existing = await this.trueFalseRepository.findById(id, userId);
    if (!existing) throw new Error("True/false set not found or access denied");

    if (updateData.categoryId) {
      const category = await this.categoryService.getCategoryById(
        updateData.categoryId,
        userId,
      );
      if (!category) throw new Error("Category not found or access denied");
    }

    return this.trueFalseRepository.update(id, userId, updateData);
  }

  async deleteSet(id, userId) {
    const existing = await this.trueFalseRepository.findById(id, userId);
    if (!existing) throw new Error("True/false set not found or access denied");
    return this.trueFalseRepository.delete(id, userId);
  }

  async addQuestion(setId, userId, questionData) {
    const isTrue =
      typeof questionData.isTrue !== "undefined"
        ? questionData.isTrue
        : questionData.is_true;
    const dto = new TrueFalseQuestionDto(
      questionData.statement,
      isTrue,
      questionData.explanation ?? null,
      questionData.orderIndex ?? 0,
    );
    if (!dto.isValid()) {
      throw new Error(
        "Invalid question data: statement and isTrue (boolean) are required",
      );
    }
    return this.trueFalseRepository.addQuestion(setId, userId, dto);
  }

  async deleteQuestion(questionId, userId) {
    return this.trueFalseRepository.deleteQuestion(questionId, userId);
  }
}

module.exports = TrueFalseService;

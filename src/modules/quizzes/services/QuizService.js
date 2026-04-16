const { QuizDto, QuizQuestionDto } = require("../dtos/QuizDto");

class QuizService {
  constructor(
    quizRepository,
    categoryService,
    groqService,
    fileService,
    documentProcessingService,
  ) {
    this.quizRepository = quizRepository;
    this.categoryService = categoryService;
    this.groqService = groqService;
    this.fileService = fileService;
    this.documentProcessingService = documentProcessingService;
  }

  async createQuiz(quizData, userId) {
    const questions = (quizData.questions || []).map((q, i) =>
      QuizDto.buildQuestion(q, i),
    );
    const dto = new QuizDto(
      quizData.title,
      quizData.categoryId,
      quizData.description,
      questions,
    );
    if (!dto.isValid()) {
      throw new Error(
        "Invalid quiz data: title, categoryId and at least one valid question are required",
      );
    }

    const category = await this.categoryService.getCategoryById(
      quizData.categoryId,
      userId,
    );
    if (!category) {
      throw new Error("Category not found or access denied");
    }

    return this.quizRepository.create({
      userId,
      categoryId: dto.categoryId,
      title: dto.title,
      description: dto.description,
      questions: dto.questions,
    });
  }

  async generateQuiz({ file, text, title, categoryId, quantity, userId }) {
    if (!file && !text?.trim()) {
      throw new Error(
        "Se requiere un archivo o texto para generar el cuestionario.",
      );
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
    content = this.documentProcessingService.normalizeText(content);
    content = this.documentProcessingService.validateAndTruncateContent(
      content,
      15000,
    );

    const rawQuestions = await this.groqService.generateQuizQuestions(
      content,
      quantity,
    );

    const questions = rawQuestions.map((q, i) => ({
      question: q.question,
      options: q.options,
      correct_answer: q.correct_answer,
      explanation: q.explanation || null,
      order_index: i,
    }));

    return this.quizRepository.create({
      userId,
      categoryId,
      title: title.trim(),
      description: null,
      questions,
    });
  }

  async getQuizzes(userId, options = {}) {
    return this.quizRepository.findAllByUser(userId, options);
  }

  async getQuizById(id, userId) {
    const quiz = await this.quizRepository.findById(id, userId);
    if (!quiz) throw new Error("Quiz not found");
    return quiz;
  }

  async updateQuiz(id, userId, updateData) {
    const existing = await this.quizRepository.findById(id, userId);
    if (!existing) throw new Error("Quiz not found or access denied");

    if (updateData.categoryId) {
      const category = await this.categoryService.getCategoryById(
        updateData.categoryId,
        userId,
      );
      if (!category) throw new Error("Category not found or access denied");
    }

    return this.quizRepository.update(id, userId, updateData);
  }

  async deleteQuiz(id, userId) {
    const existing = await this.quizRepository.findById(id, userId);
    if (!existing) throw new Error("Quiz not found or access denied");
    return this.quizRepository.delete(id, userId);
  }

  async addQuestion(quizId, userId, questionData) {
    const dto = new QuizQuestionDto(
      questionData.question,
      questionData.options,
      questionData.correctAnswer ?? questionData.correct_answer,
      questionData.explanation ?? null,
      questionData.orderIndex ?? 0,
    );
    if (!dto.isValid()) {
      throw new Error(
        "Invalid question data: question, options (≥2) and correctAnswer (in options) are required",
      );
    }
    return this.quizRepository.addQuestion(quizId, userId, dto);
  }

  async deleteQuestion(questionId, userId) {
    return this.quizRepository.deleteQuestion(questionId, userId);
  }
}

module.exports = QuizService;

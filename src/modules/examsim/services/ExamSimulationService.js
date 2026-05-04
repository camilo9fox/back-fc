const ExamSimulationDto = require("../dtos/ExamSimulationDto");
const {
  NotFoundError,
  ValidationError,
} = require("../../../shared/errors/AppError");

class ExamSimulationService {
  constructor(
    examSimulationRepository,
    categoryService,
    trueFalseGenerationService,
    examSimulationGenerationService,
    fileService,
    documentProcessingService,
  ) {
    this.examSimulationRepository = examSimulationRepository;
    this.categoryService = categoryService;
    this.trueFalseGenerationService = trueFalseGenerationService;
    this.examSimulationGenerationService = examSimulationGenerationService;
    this.fileService = fileService;
    this.documentProcessingService = documentProcessingService;
  }

  pickRandom(items = [], target = 0) {
    const safeItems = Array.isArray(items) ? [...items] : [];
    for (let i = safeItems.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [safeItems[i], safeItems[j]] = [safeItems[j], safeItems[i]];
    }

    const amount = Math.min(Math.max(Number(target) || 0, 0), safeItems.length);
    return safeItems.slice(0, amount);
  }

  buildDevelopmentContext(
    trueFalseQuestions = [],
    multipleChoiceQuestions = [],
  ) {
    const tfLines = trueFalseQuestions.map((item, index) => {
      const answer = item.is_true ? "Verdadero" : "Falso";
      const explanation = item.explanation
        ? ` Explicacion: ${item.explanation}`
        : "";
      return `${index + 1}) ${item.statement} (Respuesta: ${answer}).${explanation}`;
    });

    const mcLines = multipleChoiceQuestions.map((item, index) => {
      const options = Array.isArray(item.options)
        ? item.options.map((option) => String(option).trim()).filter(Boolean)
        : [];
      const optionsText = options
        .map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`)
        .join(" | ");
      const explanation = item.explanation
        ? ` Explicacion: ${item.explanation}`
        : "";
      return `${index + 1}) ${item.question} Opciones: ${optionsText}. Correcta: ${item.correct_answer}.${explanation}`;
    });

    const blocks = [];
    if (tfLines.length) {
      blocks.push(`Banco V/F:\n${tfLines.join("\n")}`);
    }
    if (mcLines.length) {
      blocks.push(`Banco de alternativas:\n${mcLines.join("\n")}`);
    }

    return blocks.join("\n\n");
  }

  truncateContext(text = "", maxChars = 12000) {
    const value = String(text || "").trim();
    if (!value) return "";
    if (value.length <= maxChars) return value;
    return `${value.slice(0, maxChars)}\n\n[Contexto truncado por longitud]`;
  }

  async createSimulation(input, userId) {
    const dto = ExamSimulationDto.normalizeCreatePayload(input);

    const category = await this.categoryService.getCategoryById(
      dto.categoryId,
      userId,
    );
    if (!category) {
      throw new NotFoundError("Category not found or access denied");
    }

    return this.examSimulationRepository.create({
      userId,
      ...dto,
    });
  }

  async generateSimulation({
    file,
    text,
    title,
    description,
    categoryId,
    trueFalseCount,
    quizCount,
    developmentCount,
    durationMinutes,
    userId,
    onProgress,
  }) {
    let currentStage = "Validando solicitud";
    const report = (stage, percent) => {
      currentStage = stage;
      if (typeof onProgress === "function") onProgress({ stage, percent });
    };

    if (!String(title || "").trim()) {
      throw new ValidationError("El titulo es obligatorio");
    }

    if (!categoryId) {
      throw new ValidationError("La categoria es obligatoria");
    }

    const tfCount = Math.min(Math.max(Number(trueFalseCount) || 6, 1), 20);
    const mcCount = Math.min(Math.max(Number(quizCount) || 6, 1), 20);
    const devCount = Math.min(Math.max(Number(developmentCount) || 3, 1), 10);

    const category = await this.categoryService.getCategoryById(
      categoryId,
      userId,
    );
    if (!category) {
      throw new NotFoundError("Categoria no encontrada o acceso denegado");
    }

    report("Cargando bancos de preguntas", 22);
    let existingBank;
    try {
      existingBank =
        await this.examSimulationRepository.listQuestionBankByCategory(
          userId,
          categoryId,
        );
    } catch (error) {
      error.generationStage = currentStage;
      throw error;
    }

    const pickedTrueFalse = this.pickRandom(
      existingBank.trueFalseQuestions,
      tfCount,
    );
    const pickedMultipleChoice = this.pickRandom(
      existingBank.multipleChoiceQuestions,
      mcCount,
    );

    report("Preparando contexto de evaluacion", 56);
    const bankContext = this.buildDevelopmentContext(
      pickedTrueFalse,
      pickedMultipleChoice,
    );

    let externalContext = "";
    const rawText = String(text || "").trim();
    if (file || rawText) {
      report("Procesando material adicional", 68);

      try {
        const extracted = file
          ? await this.fileService.extractText(file)
          : rawText;

        const normalized =
          await this.documentProcessingService.buildStudyContext(
            extracted,
            this.examSimulationGenerationService,
            {
              maxLength: 4500,
              fastPathMaxInputChars: 260000,
            },
          );

        externalContext = String(normalized || "").trim();
      } catch (error) {
        error.generationStage = currentStage;
        throw error;
      }
    }

    if (!bankContext && !externalContext) {
      throw new ValidationError(
        "No hay contenido suficiente para generar la simulacion. Agrega preguntas en la categoria o sube un PDF/TXT.",
      );
    }

    const generationContext = this.truncateContext(
      bankContext && externalContext
        ? `${bankContext}\n\nMaterial adicional (PDF/TXT):\n${externalContext}`
        : bankContext || externalContext,
    );

    report("Generando preguntas de desarrollo con IA", 84);
    let developmentQuestions;
    try {
      developmentQuestions =
        await this.examSimulationGenerationService.generateDevelopmentQuestions(
          generationContext,
          devCount,
        );
    } catch (primaryError) {
      const fallbackContexts = [
        this.truncateContext(externalContext),
        this.truncateContext(bankContext),
      ].filter(Boolean);

      let recovered = null;
      for (const fallbackContext of fallbackContexts) {
        try {
          recovered =
            await this.examSimulationGenerationService.generateDevelopmentQuestions(
              fallbackContext,
              devCount,
            );
          if (recovered?.length) break;
        } catch (fallbackError) {
          console.warn(
            `ExamSimulationService: fallback context failed (${fallbackError.message})`,
          );
        }
      }

      if (!recovered?.length) {
        throw new ValidationError(
          "No se pudo generar la seccion de desarrollo con el contenido disponible. Intenta con otro documento o menos cantidad de preguntas.",
        );
      }

      developmentQuestions = recovered;
      console.warn(
        `ExamSimulationService: using fallback context for development generation (${primaryError.message})`,
      );
    }

    report("Finalizando simulacion", 96);

    try {
      return {
        title: String(title).trim(),
        description: String(description || "").trim() || null,
        categoryId,
        durationMinutes: Math.min(
          Math.max(Number(durationMinutes) || 45, 10),
          300,
        ),
        trueFalseQuestions: pickedTrueFalse.map((item, index) =>
          ExamSimulationDto.normalizeTrueFalseQuestion(item, index),
        ),
        multipleChoiceQuestions: pickedMultipleChoice.map((item, index) =>
          ExamSimulationDto.normalizeMultipleChoiceQuestion(item, index),
        ),
        developmentQuestions: developmentQuestions.map((item, index) =>
          ExamSimulationDto.normalizeDevelopmentQuestion(item, index),
        ),
      };
    } catch (error) {
      error.generationStage = currentStage;
      throw error;
    }
  }

  async getSimulations(userId, options = {}) {
    return this.examSimulationRepository.findAllByUser(userId, options);
  }

  async getSimulationById(id, userId) {
    const simulation = await this.examSimulationRepository.findById(id, userId);
    if (!simulation) {
      throw new NotFoundError("Simulacion no encontrada");
    }
    return simulation;
  }

  async deleteSimulation(id, userId) {
    await this.examSimulationRepository.ensureOwnership(id, userId);
    return this.examSimulationRepository.delete(id, userId);
  }

  buildAttemptIndex(items = [], idKey = "questionId") {
    const map = new Map();
    for (const item of items) {
      if (!item || !item[idKey]) continue;
      map.set(String(item[idKey]), item);
    }
    return map;
  }

  areEquivalentAnswers(left, right) {
    const normalize = (value) =>
      String(value || "")
        .trim()
        .toLowerCase();

    return normalize(left) && normalize(left) === normalize(right);
  }

  scoreDevelopmentQuestion(answerText, referenceAnswer, maxPoints) {
    const answer = String(answerText || "")
      .toLowerCase()
      .trim();
    const reference = String(referenceAnswer || "")
      .toLowerCase()
      .trim();

    if (!answer) return 0;

    const tokenize = (text) =>
      text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 4);

    const referenceTokens = Array.from(new Set(tokenize(reference))).slice(
      0,
      25,
    );
    const answerTokens = new Set(tokenize(answer));

    if (referenceTokens.length === 0) {
      const lengthFactor = Math.min(answer.length / 220, 1);
      return Number((maxPoints * lengthFactor * 0.6).toFixed(2));
    }

    const matched = referenceTokens.filter((token) =>
      answerTokens.has(token),
    ).length;
    const coverage = matched / referenceTokens.length;
    const lengthFactor = Math.min(answer.length / 260, 1);
    const raw =
      maxPoints * Math.min(1, coverage * 1.2) * (0.5 + 0.5 * lengthFactor);

    return Number(Math.max(0, Math.min(maxPoints, raw)).toFixed(2));
  }

  async scoreDevelopmentWithAi(questions = [], devAnswers = new Map()) {
    const baseBreakdown = (questions || []).map((question) => {
      const answer = devAnswers.get(String(question.id));
      const submittedText = String(answer?.answer || "").trim();
      const maxPoints = Number(question.max_points || 10);
      const fallbackPoints = this.scoreDevelopmentQuestion(
        submittedText,
        question.reference_answer,
        maxPoints,
      );

      return {
        questionId: question.id,
        submittedText,
        maxPoints,
        points: fallbackPoints,
        criteria: question.evaluation_criteria || null,
        gradingSource: "heuristic",
      };
    });

    const aiCandidates = baseBreakdown
      .filter((item) => item.submittedText.length > 0)
      .map((item) => {
        const question = (questions || []).find(
          (candidate) => String(candidate.id) === String(item.questionId),
        );

        return {
          questionId: String(item.questionId),
          prompt: String(question?.prompt || ""),
          referenceAnswer: String(question?.reference_answer || ""),
          evaluationCriteria: String(question?.evaluation_criteria || ""),
          submittedText: item.submittedText,
          maxPoints: item.maxPoints,
        };
      });

    if (aiCandidates.length === 0) {
      return baseBreakdown;
    }

    try {
      const aiResults =
        await this.examSimulationGenerationService.evaluateDevelopmentAnswers(
          aiCandidates,
        );
      const aiMap = new Map(
        (aiResults || []).map((item) => [String(item.questionId), item]),
      );

      return baseBreakdown.map((item) => {
        const ai = aiMap.get(String(item.questionId));
        if (!ai) return item;

        return {
          ...item,
          points: Number(ai.points ?? item.points),
          aiFeedback: ai.feedback || null,
          missingConcepts: ai.missingConcepts || [],
          strengths: ai.strengths || [],
          gradingSource: "ai",
        };
      });
    } catch (error) {
      console.warn(
        `ExamSimulationService: AI grading failed, fallback heuristic (${error.message})`,
      );
      return baseBreakdown;
    }
  }

  async submitSimulation(simulationId, userId, payload = {}) {
    const simulation = await this.getSimulationById(simulationId, userId);

    const tfAnswers = this.buildAttemptIndex(payload.trueFalseAnswers || []);
    const mcAnswers = this.buildAttemptIndex(
      payload.multipleChoiceAnswers || [],
    );
    const devAnswers = this.buildAttemptIndex(payload.developmentAnswers || []);

    const tfBreakdown = (simulation.trueFalseQuestions || []).map(
      (question) => {
        const answer = tfAnswers.get(String(question.id));
        const submitted =
          typeof answer?.answer === "boolean" ? answer.answer : null;
        const isCorrect = submitted === question.is_true;

        return {
          questionId: question.id,
          submitted,
          expected: question.is_true,
          correct: isCorrect,
          points: isCorrect ? 1 : 0,
          maxPoints: 1,
        };
      },
    );

    const developmentBreakdown = await this.scoreDevelopmentWithAi(
      simulation.developmentQuestions || [],
      devAnswers,
    );

    const multipleChoiceBreakdown = (
      simulation.multipleChoiceQuestions || []
    ).map((question) => {
      const answer = mcAnswers.get(String(question.id));
      const submitted = String(answer?.answer || "").trim() || null;
      const expected = String(question.correct_answer || "").trim();
      const isCorrect = submitted
        ? this.areEquivalentAnswers(submitted, expected)
        : false;

      return {
        questionId: question.id,
        submitted,
        expected,
        correct: isCorrect,
        points: isCorrect ? 1 : 0,
        maxPoints: 1,
      };
    });

    const totalPoints =
      tfBreakdown.reduce((acc, item) => acc + item.maxPoints, 0) +
      multipleChoiceBreakdown.reduce((acc, item) => acc + item.maxPoints, 0) +
      developmentBreakdown.reduce((acc, item) => acc + item.maxPoints, 0);

    const earnedPoints =
      tfBreakdown.reduce((acc, item) => acc + item.points, 0) +
      multipleChoiceBreakdown.reduce((acc, item) => acc + item.points, 0) +
      developmentBreakdown.reduce((acc, item) => acc + item.points, 0);

    const scorePercent =
      totalPoints > 0
        ? Number(((earnedPoints / totalPoints) * 100).toFixed(2))
        : 0;

    const attempt = await this.examSimulationRepository.createAttempt({
      userId,
      simulationId,
      score: scorePercent,
      totalPoints,
      detail: {
        earnedPoints,
        tfBreakdown,
        multipleChoiceBreakdown,
        developmentBreakdown,
      },
    });

    return {
      attemptId: attempt.id,
      simulationId,
      score: scorePercent,
      earnedPoints,
      totalPoints,
      trueFalse: tfBreakdown,
      multipleChoice: multipleChoiceBreakdown,
      development: developmentBreakdown,
    };
  }
}

module.exports = ExamSimulationService;

const { ValidationError } = require("../../../shared/errors/AppError");

class ExamSimulationDto {
  static normalizeTrueFalseQuestion(item, orderIndex = 0) {
    const statement = String(item?.statement || "").trim();
    const explanation = String(item?.explanation || "").trim();
    const isTrue =
      typeof item?.is_true === "boolean"
        ? item.is_true
        : typeof item?.isTrue === "boolean"
          ? item.isTrue
          : null;

    if (!statement || typeof isTrue !== "boolean") {
      throw new ValidationError(
        "Cada pregunta V/F debe incluir statement e is_true (boolean)",
      );
    }

    return {
      statement,
      is_true: isTrue,
      explanation: explanation || null,
      order_index: Number.isInteger(orderIndex) ? orderIndex : 0,
    };
  }

  static normalizeDevelopmentQuestion(item, orderIndex = 0) {
    const prompt = String(item?.prompt || "").trim();
    const referenceAnswer = String(
      item?.reference_answer || item?.referenceAnswer || "",
    ).trim();
    const criteria = String(
      item?.evaluation_criteria || item?.evaluationCriteria || "",
    ).trim();
    const maxPointsRaw = Number(item?.max_points ?? item?.maxPoints ?? 10);
    const maxPoints = Number.isFinite(maxPointsRaw)
      ? Math.min(Math.max(maxPointsRaw, 1), 20)
      : 10;

    if (!prompt) {
      throw new ValidationError(
        "Cada pregunta de desarrollo debe incluir prompt",
      );
    }

    return {
      prompt,
      reference_answer: referenceAnswer || null,
      evaluation_criteria: criteria || null,
      max_points: maxPoints,
      order_index: Number.isInteger(orderIndex) ? orderIndex : 0,
    };
  }

  static normalizeMultipleChoiceQuestion(item, orderIndex = 0) {
    const question = String(item?.question || "").trim();
    const options = Array.isArray(item?.options)
      ? item.options.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    const correctAnswer = String(
      item?.correct_answer || item?.correctAnswer || "",
    ).trim();
    const explanation = String(item?.explanation || "").trim();

    if (!question || options.length < 2 || !correctAnswer) {
      throw new ValidationError(
        "Cada pregunta de alternativas debe incluir question, options y correct_answer",
      );
    }

    const hasCorrectAnswer = options.some(
      (option) => option.toLowerCase() === correctAnswer.toLowerCase(),
    );

    if (!hasCorrectAnswer) {
      throw new ValidationError(
        "La respuesta correcta debe estar incluida dentro de options",
      );
    }

    const canonicalCorrect =
      options.find(
        (option) => option.toLowerCase() === correctAnswer.toLowerCase(),
      ) || correctAnswer;

    return {
      question,
      options,
      correct_answer: canonicalCorrect,
      explanation: explanation || null,
      order_index: Number.isInteger(orderIndex) ? orderIndex : 0,
    };
  }

  static normalizeCreatePayload(input = {}) {
    const title = String(input.title || "").trim();
    const description = String(input.description || "").trim();
    const categoryId = String(
      input.categoryId || input.category_id || "",
    ).trim();
    const durationRaw = Number(
      input.durationMinutes ?? input.duration_minutes ?? 45,
    );
    const durationMinutes = Number.isFinite(durationRaw)
      ? Math.min(Math.max(durationRaw, 10), 300)
      : 45;

    if (!title) throw new ValidationError("El titulo es obligatorio");
    if (!categoryId) throw new ValidationError("La categoria es obligatoria");

    const trueFalseQuestions = Array.isArray(input.trueFalseQuestions)
      ? input.trueFalseQuestions
      : Array.isArray(input.true_false_questions)
        ? input.true_false_questions
        : [];

    const developmentQuestions = Array.isArray(input.developmentQuestions)
      ? input.developmentQuestions
      : Array.isArray(input.development_questions)
        ? input.development_questions
        : [];

    const multipleChoiceQuestions = Array.isArray(input.multipleChoiceQuestions)
      ? input.multipleChoiceQuestions
      : Array.isArray(input.multiple_choice_questions)
        ? input.multiple_choice_questions
        : [];

    const normalizedTrueFalse = trueFalseQuestions.map((item, index) =>
      this.normalizeTrueFalseQuestion(item, index),
    );

    const normalizedDevelopment = developmentQuestions.map((item, index) =>
      this.normalizeDevelopmentQuestion(item, index),
    );

    const normalizedMultipleChoice = multipleChoiceQuestions.map(
      (item, index) => this.normalizeMultipleChoiceQuestion(item, index),
    );

    if (
      normalizedTrueFalse.length === 0 &&
      normalizedMultipleChoice.length === 0 &&
      normalizedDevelopment.length === 0
    ) {
      throw new ValidationError(
        "La simulacion debe incluir al menos una pregunta (V/F, alternativas o desarrollo)",
      );
    }

    return {
      title,
      description: description || null,
      categoryId,
      durationMinutes,
      trueFalseQuestions: normalizedTrueFalse,
      multipleChoiceQuestions: normalizedMultipleChoice,
      developmentQuestions: normalizedDevelopment,
    };
  }
}

module.exports = ExamSimulationDto;

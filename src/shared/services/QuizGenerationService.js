const GroqService = require("./GroqService");
const TextDeduplication = require("../utils/TextDeduplication");

/**
 * Service for AI-based quiz generation using Groq.
 * Extends GroqService to reuse the base Groq client and shared helpers.
 * Single Responsibility: only concerns itself with quiz (multiple-choice) generation logic.
 */
class QuizGenerationService extends GroqService {
  constructor(apiKey) {
    super(apiKey);
  }

  isUsefulExplanation(explanation) {
    if (!explanation) return false;
    const text = String(explanation).trim();
    const words = text.split(/\s+/).filter(Boolean);
    const genericPatterns = [
      /porque si/i,
      /es la correcta\.?$/i,
      /es correcto\.?$/i,
      /opcion correcta\.?$/i,
      /^correcto\.?$/i,
    ];

    return (
      text.length >= 60 &&
      words.length >= 12 &&
      !genericPatterns.some((pattern) => pattern.test(text))
    );
  }

  async enhanceQuizExplanations(content, questions) {
    if (!Array.isArray(questions) || questions.length === 0) return questions;

    try {
      const response = await this.createChatCompletion({
        messages: [
          {
            role: "system",
            content: `Eres un docente experto. Mejora explicaciones de preguntas de opcion multiple.

REGLAS OBLIGATORIAS:
1. Devuelve SOLO JSON valido con esta forma exacta: {"questions":[{"index":0,"explanation":"..."}]}.
2. Mantén los mismos indices recibidos y no inventes indices nuevos.
3. Cada explanation debe tener entre 40 y 90 palabras.
4. Cada explanation debe: justificar por que la respuesta correcta lo es, aportar contexto conceptual y aclarar al menos una confusion comun.
5. Basate SOLO en el material y en los datos de cada pregunta.
6. Espanol neutro, preciso y didactico.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              material: content.slice(0, 1500),
              questions: questions.map((q, index) => ({
                index,
                question: q.question,
                options: q.options,
                correct_answer: q.correct_answer,
                explanation: q.explanation || "",
              })),
            }),
          },
        ],
        preferredModel: this.fastModel,
        fallbackModel: this.fastModel,
        temperature: 0.25,
        max_completion_tokens: 2000,
        responseFormat: { type: "json_object" },
        stream: false,
      });

      const payload = this.parseJsonPayload(
        response.choices[0].message.content,
      );
      const improvedItems = Array.isArray(payload?.questions)
        ? payload.questions
        : [];

      const byIndex = new Map();
      for (const item of improvedItems) {
        const idx = Number(item?.index);
        const explanation = String(item?.explanation || "").trim();
        if (!Number.isInteger(idx) || idx < 0 || idx >= questions.length)
          continue;
        if (!this.isUsefulExplanation(explanation)) continue;
        byIndex.set(idx, explanation);
      }

      return questions.map((q, index) => ({
        ...q,
        explanation: byIndex.get(index) || q.explanation,
      }));
    } catch (error) {
      const message = String(error?.message || "");
      const isSizeError =
        message.includes("Please reduce the length") ||
        message.includes("request_too_large") ||
        message.includes("Request Entity Too Large");

      if (isSizeError) {
        console.info(
          "QuizGenerationService: mejora de explicaciones omitida por tamaño de payload; se usa versión original.",
        );
      } else {
        console.warn(
          `QuizGenerationService: no se pudieron mejorar explicaciones, usando version original (${error.message}).`,
        );
      }
      return questions;
    }
  }

  buildQuizGenerationMessages(content, quantity, excluded = [], options = {}) {
    const conciseMode = Boolean(options.conciseMode);
    const explanationRules = conciseMode
      ? `4. Incluye explanation breve (maximo 18 palabras). Si no es posible, usa una cadena vacia "".
5. Prioriza variedad y precision de preguntas sobre longitud de explicaciones.`
      : `4. Incluye una explicacion (explanation) util y sustantiva de 40 a 90 palabras.
5. La explicacion debe incluir: fundamento conceptual, por que la opcion correcta es correcta y una confusion comun a evitar.`;

    const excludedBlock =
      excluded.length > 0
        ? `\n\nPREGUNTAS PROHIBIDAS (no repetir):\n${excluded
            .slice(0, 20)
            .map((question, index) => `${index + 1}. ${question}`)
            .join("\n")}`
        : "";

    return [
      {
        role: "system",
        content: `Eres un pedagogo experto en crear preguntas de multiple opcion de alta calidad en espanol neutro.

REGLAS OBLIGATORIAS:
1. Devuelve SOLO un objeto JSON valido con la forma {"questions": [...] }.
2. Cada pregunta debe tener exactamente 4 opciones distintas, claras y plausibles.
3. La respuesta correcta (correct_answer) DEBE ser una de las 4 opciones exactamente como aparece en el array options.
${explanationRules}
6. Las preguntas deben evaluar comprension conceptual: definiciones, causas, efectos, comparaciones, procesos.
7. No inventes informacion que no se deduzca claramente del material.
8. Evita preguntas triviales, repetidas o ambiguas.
9. No preguntes sobre metadatos: autor, ISBN, editorial, ano de edicion, portada.
10. Escribe en espanol neutro. No agregues nada fuera del JSON.`,
      },
      {
        role: "user",
        content: `Material de estudio:\n${content}\n\nGenera ${quantity} preguntas de multiple opcion distintas basadas en el contenido academico.${excludedBlock}\n\nIMPORTANTE: ignora cualquier metadato editorial o bibliografico si aparece en el texto.\n\nDevuelve el JSON con esta forma exacta:\n{"questions":[{"question":"...","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}]}`,
      },
    ];
  }

  sanitizeQuizQuestions(rawQuestions, quantity) {
    const normalized = [];
    const seenQuestions = new Set();

    for (const item of rawQuestions) {
      if (!item) continue;

      const question = String(item.question || "").trim();
      const options = Array.isArray(item.options)
        ? item.options.map((o) => String(o).trim()).filter(Boolean)
        : [];
      const correctAnswer = String(item.correct_answer || "").trim();
      const explanation = String(item.explanation || "").trim();

      if (!question || options.length < 2) continue;
      if (!correctAnswer) continue;
      if (seenQuestions.has(question.toLowerCase())) continue;

      const normalize = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
      const letterPrefix = (letter, opt) =>
        new RegExp(`^${letter.toUpperCase()}[).\\-]`).test(opt.trimStart());
      const letterIndex =
        correctAnswer.length === 1
          ? "ABCDEFGH".indexOf(correctAnswer.toUpperCase())
          : -1;

      const resolvedAnswer =
        options.find((o) => o === correctAnswer) ||
        options.find((o) => normalize(o) === normalize(correctAnswer)) ||
        (correctAnswer.length === 1
          ? options.find((o) => letterPrefix(correctAnswer, o))
          : null) ||
        (letterIndex >= 0 && letterIndex < options.length
          ? options[letterIndex]
          : null);

      if (!resolvedAnswer) continue;

      seenQuestions.add(question.toLowerCase());
      normalized.push({
        question,
        options,
        correct_answer: resolvedAnswer,
        explanation: explanation || undefined,
      });

      if (normalized.length === quantity) break;
    }

    if (normalized.length === 0) {
      throw new Error("La IA no devolvió preguntas de cuestionario válidas.");
    }

    return normalized;
  }

  async generateQuizQuestions(content, existingQuestions = [], quantity = 5) {
    console.log(
      `QuizGenerationService: generateQuizQuestions quantity=${quantity}, existingQuestions=${existingQuestions.length}`,
    );

    const existingQuestionTexts = existingQuestions
      .slice(0, 30)
      .map((q) => q.question || q)
      .filter(Boolean);

    const targetBatchSize = 10;

    const requestBatch = async (requestQty, excluded, temperature = 0.6) => {
      const response = await this.createChatCompletion({
        messages: this.buildQuizGenerationMessages(
          content,
          requestQty,
          excluded,
        ),
        preferredModel: this.fastModel,
        fallbackModel: this.fastModel,
        temperature,
        max_completion_tokens: 2200,
        frequency_penalty: 0.3,
        responseFormat: { type: "json_object" },
        stream: false,
      });
      const payload = this.parseJsonPayload(
        response.choices[0].message.content,
      );
      const rawItems = Array.isArray(payload)
        ? payload
        : payload.questions || [payload];
      return this.sanitizeQuizQuestions(rawItems, requestQty);
    };

    const collected = [];
    const seenQuestions = new Set();

    const normalizeQuestion = (text) =>
      String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const addBatch = (batch, useSemanticDedup = true) => {
      for (const item of batch) {
        const key = normalizeQuestion(item.question);
        if (!key) continue;
        if (seenQuestions.has(key)) continue;

        if (useSemanticDedup) {
          const existingThreshold = quantity >= 8 ? 95 : 92;
          const collectedThreshold = quantity >= 8 ? 94 : 90;
          const similarToExisting = existingQuestionTexts.some((ex) =>
            TextDeduplication.isSimilar(item.question, ex, existingThreshold),
          );
          const similarToCollected = collected.some((q) =>
            TextDeduplication.isSimilar(
              item.question,
              q.question,
              collectedThreshold,
            ),
          );

          if (similarToExisting || similarToCollected) {
            console.debug(
              `QuizGenerationService: descartada pregunta similar: "${item.question}"`,
            );
            continue;
          }
        }

        seenQuestions.add(key);
        collected.push(item);
        if (collected.length >= quantity) break;
      }
    };

    const buildExcluded = () =>
      collected
        .map((q) => q.question)
        .concat(existingQuestionTexts)
        .slice(0, 30);

    const maxAttempts = 2;

    for (
      let attempt = 1;
      attempt <= maxAttempts && collected.length < quantity;
      attempt += 1
    ) {
      const remaining = quantity - collected.length;
      const excluded = buildExcluded();

      try {
        const requestQty = Math.min(remaining + 2, targetBatchSize);
        const batch = await requestBatch(
          requestQty,
          excluded,
          attempt === 1 ? 0.55 : 0.65,
        );
        addBatch(batch, true);
      } catch (err) {
        console.warn(
          `QuizGenerationService: intento ${attempt} falló (${err.message}).`,
        );
      }
    }

    // Last resort: if strict semantic dedup leaves a short result, fill remaining
    // with exact-dedup-only questions to avoid front-end failures.
    for (
      let fillAttempt = 1;
      fillAttempt <= 1 && collected.length < quantity;
      fillAttempt += 1
    ) {
      const remaining = quantity - collected.length;
      const excluded = buildExcluded();

      console.warn(
        `QuizGenerationService: fill ${fillAttempt}/1 para completar ${remaining} preguntas (dedup semántica relajada).`,
      );

      try {
        const requestQty = Math.min(remaining + 3, targetBatchSize);
        const batch = await requestBatch(requestQty, excluded, 0.8);
        addBatch(batch, false);
      } catch (err) {
        console.warn(
          `QuizGenerationService: fill ${fillAttempt} falló (${err.message}).`,
        );
      }
    }

    if (collected.length === 0) {
      throw new Error("No se pudieron generar preguntas válidas.");
    }
    if (collected.length < quantity) {
      console.warn(
        `QuizGenerationService: se generaron ${collected.length}/${quantity} preguntas.`,
      );
    }

    const finalQuestions = collected.slice(0, quantity);
    return finalQuestions;
  }
}

module.exports = QuizGenerationService;

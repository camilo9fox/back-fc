const GroqService = require("./GroqService");

/**
 * Service for AI-based quiz generation using Groq.
 * Extends GroqService to reuse the base Groq client and shared helpers.
 * Single Responsibility: only concerns itself with quiz (multiple-choice) generation logic.
 */
class QuizGenerationService extends GroqService {
  constructor(apiKey) {
    super(apiKey);
  }

  buildQuizGenerationMessages(content, quantity) {
    return [
      {
        role: "system",
        content: `Eres un pedagogo experto en crear preguntas de multiple opcion de alta calidad en espanol neutro.

REGLAS OBLIGATORIAS:
1. Devuelve SOLO un objeto JSON valido con la forma {"questions": [...] }.
2. Cada pregunta debe tener exactamente 4 opciones distintas, claras y plausibles.
3. La respuesta correcta (correct_answer) DEBE ser una de las 4 opciones exactamente como aparece en el array options.
4. Incluye una explicacion (explanation) MUY BREVE: MÁXIMO 20 palabras.
5. Las preguntas deben evaluar comprension conceptual: definiciones, causas, efectos, comparaciones, procesos.
6. No inventes informacion que no se deduzca claramente del material.
7. Evita preguntas triviales, repetidas o ambiguas.
8. No preguntes sobre metadatos: autor, ISBN, editorial, ano de edicion, portada.
9. Escribe en espanol neutro. No agregues nada fuera del JSON.`,
      },
      {
        role: "user",
        content: `Material de estudio:\n${content}\n\nGenera ${quantity} preguntas de multiple opcion distintas basadas en el contenido academico.\n\nDevuelve el JSON con esta forma exacta:\n{"questions":[{"question":"...","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}]}`,
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

  async generateQuizQuestions(content, quantity = 5) {
    console.log(
      `QuizGenerationService: generateQuizQuestions model=${this.qualityModel}, quantity=${quantity}`,
    );

    const collected = [];
    const seenQuestions = new Set();

    for (
      let attempt = 1;
      attempt <= this.MAX_GENERATION_ATTEMPTS && collected.length < quantity;
      attempt += 1
    ) {
      const remaining = quantity - collected.length;
      const requestQuantity = Math.min(remaining + 2, 5);

      const response = await this.createChatCompletion({
        messages: this.buildQuizGenerationMessages(content, requestQuantity),
        preferredModel: this.qualityModel,
        fallbackModel: this.fastModel,
        temperature: attempt === 1 ? 0.55 : 0.7,
        max_completion_tokens: 3000,
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

      let batch = [];
      try {
        batch = this.sanitizeQuizQuestions(rawItems, requestQuantity);
      } catch (err) {
        console.warn(
          `QuizGenerationService: intento ${attempt} sin preguntas quiz válidas, reintentando...`,
        );
        console.warn(`QuizGenerationService: error sanitize → ${err.message}`);
        console.warn(
          `QuizGenerationService: rawItems[0] →`,
          JSON.stringify(rawItems[0], null, 2),
        );
        continue;
      }

      for (const item of batch) {
        const key = item.question.toLowerCase();
        if (seenQuestions.has(key)) continue;
        seenQuestions.add(key);
        collected.push(item);
        if (collected.length >= quantity) break;
      }
    }

    if (collected.length < quantity) {
      throw new Error(
        `No se pudieron generar ${quantity} preguntas válidas. Se generaron ${collected.length}.`,
      );
    }

    return collected.slice(0, quantity);
  }
}

module.exports = QuizGenerationService;

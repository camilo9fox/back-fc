const TextDeduplication = require("../utils/TextDeduplication");
const logger = require("../config/logger");

class FlashcardGenerationService {
  constructor(groqService, contentSafetyService) {
    this.groqService = groqService;
    this.contentSafetyService = contentSafetyService;

    this.IRRELEVANT_CARD_PATTERNS = [
      /\bautor(?:a|es)?\b/i,
      /\btraductor(?:a|es)?\b/i,
      /\beditorial\b/i,
      /\bisbn\b/i,
      /\bt[ií]tulo\s+completo\b/i,
      /\bpr[oó]logo\b/i,
      /\bprefacio\b/i,
      /\bdedicatoria\b/i,
      /\bagradecimientos\b/i,
      /\bpublicado por\b/i,
      /\bcopyright\b/i,
      /\bedici[oó]n\b/i,
    ];
  }

  buildFlashcardGenerationMessages(documentContent, quantity, excluded = []) {
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
        content: `Eres un pedagogo experto en crear flashcards de estudio de alta calidad en espanol neutro.

REGLAS OBLIGATORIAS:
1. Devuelve SOLO un objeto JSON valido con la forma {"flashcards": [...] }.
2. Cada question debe estar muy bien redactada, ser precisa, autoexplicativa y sonar natural.
3. Cada answer debe ser directa y concisa: MÁXIMO 25 palabras. Sin explicaciones largas.
4. Evita preguntas repetidas, triviales o ambiguas.
5. Prioriza definiciones, relaciones causa-efecto, comparaciones, procesos, ejemplos y aplicaciones.
6. No inventes informacion que no aparezca o no se deduzca claramente del material.
7. Mantén variedad entre preguntas.
8. No agregues explicaciones fuera del JSON.
9. NO preguntes sobre metadatos editoriales: autor, traductor, ISBN, editorial, ano de edicion, portada, prologo, prefacio, dedicatoria, agradecimientos, titulo del libro.
10. Las preguntas deben evaluar comprension del contenido conceptual del material (ideas, teorias, procesos, relaciones, argumentos, evidencia, aplicaciones).
11. Varía las respuestas entre preguntas: no repitas la misma respuesta para diferentes preguntas.
12. Si el material proporcionado es breve, genera SOLO preguntas sobre lo que el texto menciona explicitamente. No inventes conceptos que no aparezcan.`,
      },
      {
        role: "user",
        content: `Material de estudio:\n${documentContent}\n\nGenera ${quantity} flashcards distintas enfocadas en contenido academico util para estudiar.${excludedBlock}\n\nIMPORTANTE: ignora cualquier metadato editorial o bibliografico si aparece en el texto.\n\nDevuelve el JSON con esta forma exacta:\n{"flashcards":[{"question":"...","answer":"..."}]}`,
      },
    ];
  }

  isRelevantFlashcard(card) {
    const text = `${card.question || ""} ${card.answer || ""}`;
    return !this.IRRELEVANT_CARD_PATTERNS.some((pattern) => pattern.test(text));
  }

  sanitizeFlashcards(flashcards, quantity) {
    const normalized = [];
    const seenQuestions = new Set();

    for (const card of flashcards) {
      if (!card) continue;

      const question = String(card.question || "").trim();
      const answer = String(card.answer || "").trim();

      if (!question || !answer) continue;
      if (seenQuestions.has(question.toLowerCase())) continue;
      if (!this.isRelevantFlashcard({ question, answer })) continue;

      seenQuestions.add(question.toLowerCase());
      normalized.push({
        question: question.endsWith("?") ? question : `${question}?`,
        answer,
      });

      if (normalized.length === quantity) break;
    }

    if (normalized.length === 0) {
      throw new Error("La IA no devolvió flashcards válidas.");
    }

    return normalized;
  }

  async generateFlashCards(
    documentContent,
    existingQuestions = [],
    quantity = 1,
  ) {
    logger.info(
      `FlashcardGenerationService: generateFlashCards model=${this.groqService.qualityModel}, quantity=${quantity}, existingQuestions=${existingQuestions.length}`,
    );

    const collected = [];
    const seenQuestions = new Set();
    const maxAttempts = quantity >= 8 ? 2 : 3;

    const existingQuestionTexts = existingQuestions
      .slice(0, 20)
      .map((q) => q.question || q)
      .filter(Boolean);

    for (
      let attempt = 1;
      attempt <= maxAttempts && collected.length < quantity;
      attempt += 1
    ) {
      const remaining = quantity - collected.length;
      const requestQuantity = Math.min(remaining + 1, 10);
      const excluded = Array.from(seenQuestions).concat(existingQuestionTexts);

      let normalizedBatch = [];
      try {
        const response = await this.groqService.createChatCompletion({
          messages: this.buildFlashcardGenerationMessages(
            documentContent,
            requestQuantity,
            excluded,
          ),
          preferredModel: this.groqService.fastModel,
          fallbackModel: this.groqService.fastModel,
          temperature: attempt === 1 ? 0.7 : 0.75,
          max_completion_tokens: 2200,
          frequency_penalty: 0.5,
          presence_penalty: 0.25,
          responseFormat: { type: "json_object" },
          stream: false,
        });
        const payload = this.groqService.parseJsonPayload(
          response.choices[0].message.content,
        );
        const rawFlashcards = Array.isArray(payload)
          ? payload
          : payload.flashcards || [payload];
        normalizedBatch = this.sanitizeFlashcards(
          rawFlashcards,
          requestQuantity,
        );
      } catch (error) {
        logger.warn(
          `FlashcardGenerationService: intento ${attempt} falló (${error.message}), continuando...`,
        );
        continue;
      }

      for (const flashcard of normalizedBatch) {
        const key = flashcard.question.toLowerCase();
        if (seenQuestions.has(key)) continue;

        if (
          existingQuestionTexts.some((existing) =>
            TextDeduplication.isSimilar(flashcard.question, existing, 92),
          )
        ) {
          logger.debug(
            `FlashcardGenerationService: descartada pregunta similar a existente: "${flashcard.question}"`,
          );
          continue;
        }

        const duplicateAnswer = collected.some(
          (q) =>
            flashcard.answer.toLowerCase().trim() ===
              q.answer.toLowerCase().trim() &&
            TextDeduplication.isSimilar(flashcard.question, q.question, 85),
        );
        if (duplicateAnswer) {
          logger.debug(
            `FlashcardGenerationService: descartada respuesta duplicada: "${flashcard.answer}"`,
          );
          continue;
        }

        seenQuestions.add(key);
        collected.push(flashcard);

        if (collected.length >= quantity) break;
      }
    }

    if (collected.length === 0 && existingQuestionTexts.length > 0) {
      logger.warn(
        `FlashcardGenerationService: todas las preguntas fueron filtradas. Ejecutando intento final sin filtro de similitud...`,
      );
      try {
        const response = await this.groqService.createChatCompletion({
          messages: this.buildFlashcardGenerationMessages(
            documentContent,
            quantity,
            existingQuestionTexts,
          ),
          preferredModel: this.groqService.fastModel,
          fallbackModel: this.groqService.fastModel,
          temperature: 0.85,
          max_completion_tokens: 3000,
          frequency_penalty: 0.6,
          presence_penalty: 0.4,
          responseFormat: { type: "json_object" },
          stream: false,
        });
        const payload = this.groqService.parseJsonPayload(
          response.choices[0].message.content,
        );
        const rawFlashcards = Array.isArray(payload)
          ? payload
          : payload.flashcards || [payload];
        const lastResort = this.sanitizeFlashcards(rawFlashcards, quantity);
        collected.push(...lastResort);
      } catch (err) {
        logger.warn(
          `FlashcardGenerationService: intento final también falló (${err.message}).`,
        );
      }
    }

    if (collected.length === 0) {
      throw new Error(
        `No se pudieron generar flashcards válidas tras 3 intentos.`,
      );
    }

    const safeCards = await this.contentSafetyService.checkBatch(
      collected.slice(0, quantity),
      (card) => `${card.question} ${card.answer}`,
    );

    if (safeCards.length === 0) {
      throw new Error(
        `No se pudieron generar flashcards válidas tras 3 intentos.`,
      );
    }

    return safeCards;
  }

  async generateFlashCard(documentContent) {
    const flashcards = await this.generateFlashCards(documentContent, [], 1);
    return flashcards[0];
  }
}

module.exports = FlashcardGenerationService;

const GroqService = require("./GroqService");
const TextDeduplication = require("../utils/TextDeduplication");

/**
 * Service for AI-based flashcard generation using Groq.
 * Extends GroqService to reuse the base Groq client and shared helpers.
 * Single Responsibility: only concerns itself with flashcard generation logic.
 */
class FlashcardGenerationService extends GroqService {
  constructor(apiKey) {
    super(apiKey);

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
10. Las preguntas deben evaluar comprension del contenido conceptual del material (ideas, teorias, procesos, relaciones, argumentos, evidencia, aplicaciones).`,
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
    console.log(
      `FlashcardGenerationService: generateFlashCards model=${this.qualityModel}, quantity=${quantity}, existingQuestions=${existingQuestions.length}`,
    );

    const collected = [];
    const seenQuestions = new Set();
    const maxAttempts = quantity >= 8 ? 2 : this.MAX_GENERATION_ATTEMPTS;

    // Extract question texts from existing questions (max 20 to avoid prompt bloat)
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
        const response = await this.createChatCompletion({
          messages: this.buildFlashcardGenerationMessages(
            documentContent,
            requestQuantity,
            excluded,
          ),
          preferredModel: this.fastModel,
          fallbackModel: this.fastModel,
          temperature: attempt === 1 ? 0.55 : 0.7,
          max_completion_tokens: 2200,
          frequency_penalty: 0.4,
          presence_penalty: 0.25,
          responseFormat: { type: "json_object" },
          stream: false,
        });
        const payload = this.parseJsonPayload(
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
        console.warn(
          `FlashcardGenerationService: intento ${attempt} falló (${error.message}), continuando...`,
        );
        continue;
      }

      for (const flashcard of normalizedBatch) {
        const key = flashcard.question.toLowerCase();
        if (seenQuestions.has(key)) continue;

        // Additional deduplication check against existing questions
        if (
          existingQuestionTexts.some((existing) =>
            TextDeduplication.isSimilar(flashcard.question, existing, 92),
          )
        ) {
          console.debug(
            `FlashcardGenerationService: descartada pregunta similar a existente: "${flashcard.question}"`,
          );
          continue;
        }

        seenQuestions.add(key);
        collected.push(flashcard);

        if (collected.length >= quantity) break;
      }
    }

    // Last resort: if everything was filtered as similar, run one final attempt
    // without the similarity filter so we always return something.
    if (collected.length === 0 && existingQuestionTexts.length > 0) {
      console.warn(
        `FlashcardGenerationService: todas las preguntas fueron filtradas. Ejecutando intento final sin filtro de similitud...`,
      );
      try {
        const response = await this.createChatCompletion({
          messages: this.buildFlashcardGenerationMessages(
            documentContent,
            quantity,
            existingQuestionTexts,
          ),
          preferredModel: this.fastModel,
          fallbackModel: this.fastModel,
          temperature: 0.85,
          max_completion_tokens: 3000,
          frequency_penalty: 0.6,
          presence_penalty: 0.4,
          responseFormat: { type: "json_object" },
          stream: false,
        });
        const payload = this.parseJsonPayload(
          response.choices[0].message.content,
        );
        const rawFlashcards = Array.isArray(payload)
          ? payload
          : payload.flashcards || [payload];
        const lastResort = this.sanitizeFlashcards(rawFlashcards, quantity);
        collected.push(...lastResort);
      } catch (err) {
        console.warn(
          `FlashcardGenerationService: intento final también falló (${err.message}).`,
        );
      }
    }

    if (collected.length === 0) {
      throw new Error(
        `No se pudieron generar flashcards válidas tras ${this.MAX_GENERATION_ATTEMPTS} intentos.`,
      );
    }

    return collected.slice(0, quantity);
  }

  async generateFlashCard(documentContent) {
    const flashcards = await this.generateFlashCards(documentContent, [], 1);
    return flashcards[0];
  }
}

module.exports = FlashcardGenerationService;

const { Groq } = require("groq-sdk");

/**
 * Service class for interacting with Groq AI
 * Follows Single Responsibility Principle - handles only Groq operations
 */
class GroqService {
  constructor(apiKey) {
    this.groq = new Groq({
      apiKey: apiKey,
    });
    this.fastModel = process.env.GROQ_FAST_MODEL || "llama-3.1-8b-instant";
    this.qualityModel =
      process.env.GROQ_QUALITY_MODEL || "llama-3.1-8b-instant";
    this.MAX_GENERATION_ATTEMPTS = 3;
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
3. Cada answer debe ser breve pero completa.
4. options debe contener exactamente 3 opciones unicas, incluyendo answer exactamente una vez.
5. Evita preguntas repetidas, triviales o ambiguas.
6. Prioriza definiciones, relaciones causa-efecto, comparaciones, procesos, ejemplos y aplicaciones.
7. No inventes informacion que no aparezca o no se deduzca claramente del material.
8. Los distractores deben ser plausibles y cercanos al tema, no absurdos.
9. Mantén variedad entre preguntas.
10. No agregues explicaciones fuera del JSON.
11. NO preguntes sobre metadatos editoriales: autor, traductor, ISBN, editorial, ano de edicion, portada, prologo, prefacio, dedicatoria, agradecimientos, titulo del libro.
12. Las preguntas deben evaluar comprension del contenido conceptual del material (ideas, teorias, procesos, relaciones, argumentos, evidencia, aplicaciones).`,
      },
      {
        role: "user",
        content: `Material de estudio:\n${documentContent}\n\nGenera ${quantity} flashcards distintas enfocadas en contenido académico útil para estudiar.${excludedBlock}\n\nIMPORTANTE: ignora cualquier metadato editorial o bibliográfico si aparece en el texto.\n\nDevuelve el JSON con esta forma exacta:\n{"flashcards":[{"question":"...","answer":"...","options":["...","...","..."]}]}`,
      },
    ];
  }

  isRelevantFlashcard(card) {
    const text = `${card.question || ""} ${card.answer || ""}`;
    return !this.IRRELEVANT_CARD_PATTERNS.some((pattern) => pattern.test(text));
  }

  async createChatCompletion({
    messages,
    responseFormat,
    preferredModel,
    fallbackModel,
    ...options
  }) {
    const models = [preferredModel, fallbackModel].filter(Boolean);
    let lastError = null;

    for (const model of models) {
      try {
        return await this.groq.chat.completions.create({
          messages,
          model,
          ...(responseFormat ? { response_format: responseFormat } : {}),
          ...options,
        });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  parseJsonPayload(content) {
    if (!content || typeof content !== "string") {
      throw new Error("La respuesta del modelo llegó vacía.");
    }

    const trimmed = content.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;

    try {
      return JSON.parse(candidate);
    } catch (error) {
      const objectStart = candidate.indexOf("{");
      const arrayStart = candidate.indexOf("[");
      const start =
        objectStart === -1
          ? arrayStart
          : arrayStart === -1
            ? objectStart
            : Math.min(objectStart, arrayStart);
      const objectEnd = candidate.lastIndexOf("}");
      const arrayEnd = candidate.lastIndexOf("]");
      const end = Math.max(objectEnd, arrayEnd);

      if (start !== -1 && end !== -1 && end > start) {
        return JSON.parse(candidate.slice(start, end + 1));
      }

      throw error;
    }
  }

  sanitizeFlashcards(flashcards, quantity) {
    const normalized = [];
    const seenQuestions = new Set();

    for (const card of flashcards) {
      if (!card) continue;

      const question = String(card.question || "").trim();
      const answer = String(card.answer || "").trim();
      const options = Array.isArray(card.options)
        ? Array.from(
            new Set(
              card.options
                .map((option) => String(option || "").trim())
                .filter(Boolean),
            ),
          )
        : [];

      if (!question || !answer) continue;
      if (seenQuestions.has(question.toLowerCase())) continue;

      if (!this.isRelevantFlashcard({ question, answer })) {
        continue;
      }

      if (!options.includes(answer)) {
        options.push(answer);
      }

      const distractors = options.filter((option) => option !== answer);
      if (distractors.length < 2) {
        continue;
      }

      const normalizedOptions = [answer, distractors[0], distractors[1]];

      seenQuestions.add(question.toLowerCase());
      normalized.push({
        question: question.endsWith("?") ? question : `${question}?`,
        answer,
        options: normalizedOptions,
      });

      if (normalized.length === quantity) {
        break;
      }
    }

    if (normalized.length === 0) {
      throw new Error("La IA no devolvió flashcards válidas.");
    }

    return normalized;
  }

  /**
   * Generates flashcards based on document content
   * @param {string} documentContent - The text content from the document
   * @param {number} quantity - Number of flashcards to generate
   * @returns {Promise<Array<Object>>} Array of flashcard data
   */
  async generateFlashCards(documentContent, quantity = 1) {
    console.log(
      `GroqService: generateFlashCards model=${this.qualityModel}, quantity=${quantity}`,
    );

    const collected = [];
    const seenQuestions = new Set();

    for (
      let attempt = 1;
      attempt <= this.MAX_GENERATION_ATTEMPTS && collected.length < quantity;
      attempt += 1
    ) {
      const remaining = quantity - collected.length;
      const requestQuantity = Math.min(remaining + 2, 10);
      const excluded = Array.from(seenQuestions);

      const response = await this.createChatCompletion({
        messages: this.buildFlashcardGenerationMessages(
          documentContent,
          requestQuantity,
          excluded,
        ),
        preferredModel: this.qualityModel,
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

      let normalizedBatch = [];
      try {
        normalizedBatch = this.sanitizeFlashcards(
          rawFlashcards,
          requestQuantity,
        );
      } catch (error) {
        console.warn(
          `GroqService: intento ${attempt} sin flashcards válidas, reintentando...`,
        );
        continue;
      }

      for (const flashcard of normalizedBatch) {
        const key = flashcard.question.toLowerCase();
        if (seenQuestions.has(key)) {
          continue;
        }

        seenQuestions.add(key);
        collected.push(flashcard);

        if (collected.length >= quantity) {
          break;
        }
      }
    }

    if (collected.length < quantity) {
      throw new Error(
        `No se pudieron generar ${quantity} flashcards válidas. Se generaron ${collected.length}.`,
      );
    }

    return collected.slice(0, quantity);
  }

  /**
   * Generates a single flashcard (legacy method, now uses generateFlashCards)
   * @param {string} documentContent - The text content from the document
   * @returns {Promise<Object>} Flashcard data
   */
  async generateFlashCard(documentContent) {
    const flashcards = await this.generateFlashCards(documentContent, 1);
    return flashcards[0];
  }

  async summarizeChunk(chunk) {
    console.log(`GroqService: summarizeChunk model=${this.fastModel}`);
    const response = await this.createChatCompletion({
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente que resume contenido técnico en español. Extrae los puntos clave en un párrafo muy conciso.",
        },
        {
          role: "user",
          content: `Resume el siguiente texto en pocas frases manteniendo solo las ideas más importantes:\n\n${chunk}`,
        },
      ],
      preferredModel: this.fastModel,
      temperature: 0.0,
      max_completion_tokens: 64,
      top_p: 1,
      stream: false,
    });

    return response.choices[0].message.content.trim();
  }

  async summarizeSummary(text) {
    console.log(`GroqService: summarizeSummary model=${this.fastModel}`);
    const response = await this.createChatCompletion({
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente que comprime resúmenes en un texto más corto manteniendo los puntos clave.",
        },
        {
          role: "user",
          content: `Reduce el siguiente resumen a un tamaño más pequeño, manteniendo solo las ideas principales:\n\n${text}`,
        },
      ],
      preferredModel: this.fastModel,
      temperature: 0.0,
      max_completion_tokens: 64,
      top_p: 1,
      stream: false,
    });

    return response.choices[0].message.content.trim();
  }

  async extractStudyNotes(chunk, { index, totalChunks }) {
    console.log(
      `GroqService: extractStudyNotes model=${this.fastModel}, chunk=${index + 1}/${totalChunks}`,
    );
    const response = await this.createChatCompletion({
      messages: [
        {
          role: "system",
          content:
            'Extrae conocimiento util para estudio y devuelvelo SOLO como JSON con esta forma: {"keyPoints":[],"definitions":[],"facts":[],"examples":[]}. Limita cada lista a maximo 4 items y cada item a una sola frase clara en espanol.',
        },
        {
          role: "user",
          content: `Fragmento ${index + 1} de ${totalChunks}:\n\n${chunk}`,
        },
      ],
      preferredModel: this.fastModel,
      temperature: 0.1,
      max_completion_tokens: 260,
      responseFormat: { type: "json_object" },
      stream: false,
    });

    const payload = this.parseJsonPayload(response.choices[0].message.content);
    return {
      keyPoints: Array.isArray(payload.keyPoints) ? payload.keyPoints : [],
      definitions: Array.isArray(payload.definitions)
        ? payload.definitions
        : [],
      facts: Array.isArray(payload.facts) ? payload.facts : [],
      examples: Array.isArray(payload.examples) ? payload.examples : [],
    };
  }

  async compressKnowledgeContext(text, maxLength) {
    const response = await this.createChatCompletion({
      messages: [
        {
          role: "system",
          content:
            "Comprime notas de estudio sin perder informacion clave. Devuelve texto plano compacto, claro y en espanol.",
        },
        {
          role: "user",
          content: `Reduce estas notas a menos de ${maxLength} caracteres manteniendo conceptos, definiciones y relaciones importantes:\n\n${text}`,
        },
      ],
      preferredModel: this.fastModel,
      temperature: 0.0,
      max_completion_tokens: 900,
      stream: false,
    });

    return response.choices[0].message.content.trim();
  }
}

module.exports = GroqService;

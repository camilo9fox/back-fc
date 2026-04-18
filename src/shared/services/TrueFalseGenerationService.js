const GroqService = require("./GroqService");

/**
 * Service for AI-based true/false statement generation using Groq.
 * Extends GroqService to reuse the base Groq client and shared helpers.
 * Single Responsibility: only concerns itself with true/false generation logic.
 */
class TrueFalseGenerationService extends GroqService {
  constructor(apiKey) {
    super(apiKey);
  }

  buildTrueFalseGenerationMessages(content, quantity) {
    return [
      {
        role: "system",
        content: `Eres un pedagogo experto en crear afirmaciones de verdadero o falso de alta calidad en espanol neutro.

REGLAS OBLIGATORIAS:
1. Devuelve SOLO un objeto JSON valido con la forma {"questions": [...] }.
2. Cada afirmacion (statement) debe ser clara, concisa y no ambigua.
3. El campo is_true debe ser un booleano (true o false), nunca un string.
4. Incluye una explicacion (explanation) MUY BREVE: MÁXIMO 20 palabras.
5. Equilibra la cantidad de afirmaciones verdaderas y falsas.
6. Basa las afirmaciones solo en el contenido del material proporcionado.
7. Evita afirmaciones triviales u obviamente verdaderas/falsas sin contexto.
8. No inventes informacion que no se deduzca claramente del material.
9. Escribe en espanol neutro. No agregues nada fuera del JSON.`,
      },
      {
        role: "user",
        content: `Material de estudio:\n${content}\n\nGenera ${quantity} afirmaciones de verdadero o falso basadas en el contenido academico.\n\nDevuelve el JSON con esta forma exacta:\n{"questions":[{"statement":"...","is_true":true,"explanation":"..."}]}`,
      },
    ];
  }

  sanitizeTrueFalseStatements(rawQuestions, quantity) {
    const normalized = [];
    const seenStatements = new Set();

    for (const item of rawQuestions) {
      if (!item) continue;

      const statement = String(item.statement || "").trim();
      const explanation = String(item.explanation || "").trim();

      if (!statement) continue;
      if (typeof item.is_true !== "boolean") continue;
      if (seenStatements.has(statement.toLowerCase())) continue;

      seenStatements.add(statement.toLowerCase());
      normalized.push({
        statement,
        is_true: item.is_true,
        explanation: explanation || undefined,
      });

      if (normalized.length === quantity) break;
    }

    if (normalized.length === 0) {
      throw new Error(
        "La IA no devolvió afirmaciones de verdadero/falso válidas.",
      );
    }

    return normalized;
  }

  async generateTrueFalseStatements(content, quantity = 10) {
    console.log(
      `TrueFalseGenerationService: generateTrueFalseStatements model=${this.qualityModel}, quantity=${quantity}`,
    );

    const collected = [];
    const seenStatements = new Set();

    for (
      let attempt = 1;
      attempt <= this.MAX_GENERATION_ATTEMPTS && collected.length < quantity;
      attempt += 1
    ) {
      const remaining = quantity - collected.length;
      const requestQuantity = Math.min(remaining + 2, 5);

      const response = await this.createChatCompletion({
        messages: this.buildTrueFalseGenerationMessages(
          content,
          requestQuantity,
        ),
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
        batch = this.sanitizeTrueFalseStatements(rawItems, requestQuantity);
      } catch {
        console.warn(
          `TrueFalseGenerationService: intento ${attempt} sin afirmaciones válidas, reintentando...`,
        );
        continue;
      }

      for (const item of batch) {
        const key = item.statement.toLowerCase();
        if (seenStatements.has(key)) continue;
        seenStatements.add(key);
        collected.push(item);
        if (collected.length >= quantity) break;
      }
    }

    if (collected.length < quantity) {
      throw new Error(
        `No se pudieron generar ${quantity} afirmaciones válidas. Se generaron ${collected.length}.`,
      );
    }

    return collected.slice(0, quantity);
  }
}

module.exports = TrueFalseGenerationService;

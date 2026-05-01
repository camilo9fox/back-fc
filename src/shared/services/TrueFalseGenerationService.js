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

  isUsefulExplanation(explanation) {
    if (!explanation) return false;
    const text = String(explanation).trim();
    const words = text.split(/\s+/).filter(Boolean);
    const genericPatterns = [
      /porque si/i,
      /es verdadero\.?$/i,
      /es falso\.?$/i,
      /^verdadero\.?$/i,
      /^falso\.?$/i,
    ];

    return (
      text.length >= 60 &&
      words.length >= 12 &&
      !genericPatterns.some((pattern) => pattern.test(text))
    );
  }

  async enhanceTrueFalseExplanations(content, statements) {
    if (!Array.isArray(statements) || statements.length === 0)
      return statements;

    try {
      const response = await this.createChatCompletion({
        messages: [
          {
            role: "system",
            content: `Eres un docente experto. Mejora explicaciones de afirmaciones de verdadero/falso.

REGLAS OBLIGATORIAS:
1. Devuelve SOLO JSON valido con esta forma exacta: {"questions":[{"index":0,"explanation":"..."}]}.
2. Mantén los mismos indices recibidos y no inventes indices nuevos.
3. Cada explanation debe tener entre 40 y 90 palabras.
4. Cada explanation debe: justificar la veracidad/falsedad, aportar contexto conceptual y corregir una confusion frecuente.
5. Basate SOLO en el material y en los datos de cada afirmacion.
6. Espanol neutro, preciso y didactico.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              material: content,
              questions: statements.map((s, index) => ({
                index,
                statement: s.statement,
                is_true: s.is_true,
                explanation: s.explanation || "",
              })),
            }),
          },
        ],
        preferredModel: this.qualityModel,
        fallbackModel: this.fastModel,
        temperature: 0.25,
        max_completion_tokens: 3500,
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
        if (!Number.isInteger(idx) || idx < 0 || idx >= statements.length)
          continue;
        if (!this.isUsefulExplanation(explanation)) continue;
        byIndex.set(idx, explanation);
      }

      return statements.map((s, index) => ({
        ...s,
        explanation: byIndex.get(index) || s.explanation,
      }));
    } catch (error) {
      console.warn(
        `TrueFalseGenerationService: no se pudieron mejorar explicaciones, usando version original (${error.message}).`,
      );
      return statements;
    }
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
4. Incluye una explicacion (explanation) util y sustantiva de 40 a 90 palabras.
5. La explicacion debe incluir: fundamento conceptual, por que la afirmacion es verdadera/falsa y una confusion comun a evitar.
6. Equilibra la cantidad de afirmaciones verdaderas y falsas.
7. Basa las afirmaciones solo en el contenido del material proporcionado.
8. Evita afirmaciones triviales u obviamente verdaderas/falsas sin contexto.
9. No inventes informacion que no se deduzca claramente del material.
10. Escribe en espanol neutro. No agregues nada fuera del JSON.`,
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

    const finalStatements = collected.slice(0, quantity);
    return this.enhanceTrueFalseExplanations(content, finalStatements);
  }
}

module.exports = TrueFalseGenerationService;

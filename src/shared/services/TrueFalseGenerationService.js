const TextDeduplication = require("../utils/TextDeduplication");
const logger = require("../config/logger");

class TrueFalseGenerationService {
  constructor(groqService, contentSafetyService) {
    this.groqService = groqService;
    this.contentSafetyService = contentSafetyService;
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
      const response = await this.groqService.createChatCompletion({
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
              material: content.slice(0, 1500),
              questions: statements.map((s, index) => ({
                index,
                statement: s.statement,
                is_true: s.is_true,
                explanation: s.explanation || "",
              })),
            }),
          },
        ],
        preferredModel: this.groqService.fastModel,
        fallbackModel: this.groqService.fastModel,
        temperature: 0.25,
        max_completion_tokens: 2000,
        responseFormat: { type: "json_object" },
        stream: false,
      });

      const payload = this.groqService.parseJsonPayload(
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
      logger.warn(
        `TrueFalseGenerationService: no se pudieron mejorar explicaciones, usando version original (${error.message}).`,
      );
      return statements;
    }
  }

  buildTrueFalseGenerationMessages(content, quantity, excluded = []) {
    const excludedBlock =
      excluded.length > 0
        ? `\n\nAFIRMACIONES PROHIBIDAS (no repetir):\n${excluded
            .slice(0, 20)
            .map((statement, index) => `${index + 1}. ${statement}`)
            .join("\n")}`
        : "";

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
        content: `Material de estudio:\n${content}\n\nGenera ${quantity} afirmaciones de verdadero o falso basadas en el contenido academico.${excludedBlock}\n\nIMPORTANTE: ignora cualquier metadato editorial o bibliografico si aparece en el texto.\n\nDevuelve el JSON con esta forma exacta:\n{"questions":[{"statement":"...","is_true":true,"explanation":"..."}]}`,
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

  async generateTrueFalseStatements(
    content,
    existingStatements = [],
    quantity = 10,
  ) {
    logger.info(
      `TrueFalseGenerationService: generateTrueFalseStatements model=${this.groqService.qualityModel}, quantity=${quantity}, existingStatements=${existingStatements.length}`,
    );

    const collected = [];
    const seenStatements = new Set();
    const maxAttempts = quantity >= 8 ? 2 : 3;

    const existingStatementTexts = existingStatements
      .slice(0, 20)
      .map((s) => s.statement || s)
      .filter(Boolean);

    for (
      let attempt = 1;
      attempt <= maxAttempts && collected.length < quantity;
      attempt += 1
    ) {
      const remaining = quantity - collected.length;
      const requestQuantity = Math.min(remaining + 1, 10);
      const excluded = Array.from(seenStatements).concat(
        existingStatementTexts,
      );

      let batch = [];
      try {
        const response = await this.groqService.createChatCompletion({
          messages: this.buildTrueFalseGenerationMessages(
            content,
            requestQuantity,
            excluded,
          ),
          preferredModel: this.groqService.fastModel,
          fallbackModel: this.groqService.fastModel,
          temperature: attempt === 1 ? 0.55 : 0.7,
          max_completion_tokens: 2200,
          frequency_penalty: 0.3,
          responseFormat: { type: "json_object" },
          stream: false,
        });
        const payload = this.groqService.parseJsonPayload(
          response.choices[0].message.content,
        );
        const rawItems = Array.isArray(payload)
          ? payload
          : payload.questions || [payload];
        batch = this.sanitizeTrueFalseStatements(rawItems, requestQuantity);
      } catch (err) {
        logger.warn(
          `TrueFalseGenerationService: intento ${attempt} falló (${err.message}), continuando...`,
        );
        continue;
      }

      for (const item of batch) {
        const key = item.statement.toLowerCase();
        if (seenStatements.has(key)) continue;

        if (
          existingStatementTexts.some((existing) =>
            TextDeduplication.isSimilar(item.statement, existing, 92),
          )
        ) {
          logger.debug(
            `TrueFalseGenerationService: descartada afirmación similar a existente: "${item.statement}"`,
          );
          continue;
        }

        seenStatements.add(key);
        collected.push(item);
        if (collected.length >= quantity) break;
      }
    }

    if (collected.length === 0 && existingStatementTexts.length > 0) {
      logger.warn(
        `TrueFalseGenerationService: todas las afirmaciones fueron filtradas. Ejecutando intento final sin filtro de similitud...`,
      );
      try {
        const response = await this.groqService.createChatCompletion({
          messages: this.buildTrueFalseGenerationMessages(
            content,
            quantity,
            existingStatementTexts,
          ),
          preferredModel: this.groqService.fastModel,
          fallbackModel: this.groqService.fastModel,
          temperature: 0.85,
          max_completion_tokens: 3000,
          frequency_penalty: 0.5,
          responseFormat: { type: "json_object" },
          stream: false,
        });
        const payload = this.groqService.parseJsonPayload(
          response.choices[0].message.content,
        );
        const rawItems = Array.isArray(payload)
          ? payload
          : payload.questions || [payload];
        const lastResort = this.sanitizeTrueFalseStatements(rawItems, quantity);
        collected.push(...lastResort);
      } catch (err) {
        logger.warn(
          `TrueFalseGenerationService: intento final también falló (${err.message}).`,
        );
      }
    }

    if (collected.length === 0) {
      throw new Error(
        `No se pudieron generar afirmaciones válidas tras 3 intentos.`,
      );
    }

    const finalStatements = collected.slice(0, quantity);

    const safeStatements = await this.contentSafetyService.checkBatch(
      finalStatements,
      (s) => `${s.statement} ${s.explanation || ""}`,
    );

    if (safeStatements.length === 0) {
      throw new Error(
        `No se pudieron generar afirmaciones válidas tras 3 intentos.`,
      );
    }
    if (safeStatements.length < quantity) {
      logger.warn(
        `TrueFalseGenerationService: ${safeStatements.length}/${quantity} afirmaciones tras filtro de seguridad.`,
      );
    }

    if (safeStatements.length <= 6) {
      return this.enhanceTrueFalseExplanations(content, safeStatements);
    }
    return safeStatements;
  }
}

module.exports = TrueFalseGenerationService;

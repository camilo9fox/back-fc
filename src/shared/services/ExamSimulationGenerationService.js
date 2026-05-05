const GroqService = require("./GroqService");

class ExamSimulationGenerationService extends GroqService {
  constructor(apiKey) {
    super(apiKey);
  }

  async evaluateDevelopmentAnswers(items = []) {
    const normalizedItems = (Array.isArray(items) ? items : [])
      .map((item) => {
        const questionId = String(item?.questionId || "").trim();
        const prompt = String(item?.prompt || "").trim();
        const referenceAnswer = String(item?.referenceAnswer || "").trim();
        const criteria = String(item?.evaluationCriteria || "").trim();
        const submittedText = String(item?.submittedText || "").trim();
        const maxPointsRaw = Number(item?.maxPoints ?? 10);
        const maxPoints = Number.isFinite(maxPointsRaw)
          ? Math.min(Math.max(maxPointsRaw, 1), 20)
          : 10;

        if (!questionId || !prompt) return null;

        return {
          questionId,
          prompt,
          referenceAnswer,
          criteria,
          submittedText,
          maxPoints,
        };
      })
      .filter(Boolean);

    if (normalizedItems.length === 0) return [];

    const response = await this.createChatCompletion({
      messages: [
        {
          role: "system",
          content: `Eres un evaluador academico riguroso pero justo para respuestas de desarrollo.
Devuelve SOLO JSON valido con la forma exacta: {"results":[{"questionId":"...","points":0,"feedback":"...","missingConcepts":["..."],"strengths":["..."]}]}

REGLAS:
1. Evalua comparando submittedText contra referenceAnswer y criteria.
      2. Penaliza respuestas irrelevantes, relleno o divagacion.
      3. Si submittedText esta vacio o no responde la consigna, points = 0.
4. points debe estar en [0, maxPoints].
5. feedback breve (1-3 frases), sin markdown.
      6. missingConcepts y strengths deben ser arrays de frases cortas.
      7. Otorga credito parcial cuando haya conceptos correctos, aunque la respuesta no sea perfecta.
      8. NO asignes 0 si la respuesta contiene elementos correctos relevantes a la consigna.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            items: normalizedItems.map((item) => ({
              questionId: item.questionId,
              prompt: item.prompt,
              referenceAnswer: item.referenceAnswer,
              evaluationCriteria: item.criteria,
              submittedText: item.submittedText,
              maxPoints: item.maxPoints,
            })),
          }),
        },
      ],
      preferredModel: this.fastModel,
      fallbackModel: this.fastModel,
      temperature: 0.1,
      max_completion_tokens: 2800,
      responseFormat: { type: "json_object" },
      stream: false,
    });

    const payload = this.parseJsonPayload(response.choices[0].message.content);
    const rawResults = Array.isArray(payload) ? payload : payload.results || [];
    const byId = new Map(
      normalizedItems.map((item) => [item.questionId, item]),
    );

    return rawResults
      .map((result) => {
        const questionId = String(result?.questionId || "").trim();
        const source = byId.get(questionId);
        if (!source) return null;

        const pointsRaw = Number(result?.points ?? 0);
        const safePoints = Number.isFinite(pointsRaw)
          ? Math.min(Math.max(pointsRaw, 0), source.maxPoints)
          : 0;

        return {
          questionId,
          points: Number(safePoints.toFixed(2)),
          feedback: String(result?.feedback || "").trim() || null,
          missingConcepts: Array.isArray(result?.missingConcepts)
            ? result.missingConcepts
                .map((item) => String(item || "").trim())
                .filter(Boolean)
                .slice(0, 5)
            : [],
          strengths: Array.isArray(result?.strengths)
            ? result.strengths
                .map((item) => String(item || "").trim())
                .filter(Boolean)
                .slice(0, 5)
            : [],
        };
      })
      .filter(Boolean);
  }

  async generateDevelopmentQuestions(content, quantity = 4) {
    const safeQuantity = Math.min(Math.max(Number(quantity) || 4, 1), 10);

    const response = await this.createChatCompletion({
      messages: [
        {
          role: "system",
          content: `Eres un docente universitario experto en evaluacion formativa.
Generas preguntas de desarrollo con enfoque academico.

REGLAS OBLIGATORIAS:
1. Responde SOLO con JSON valido: {"questions":[...]}.
2. Cada item debe tener EXACTAMENTE: prompt, reference_answer, evaluation_criteria, max_points.
3. prompt debe ser claro y accionable.
4. reference_answer debe ser una guia breve (3-6 lineas) para correccion.
5. evaluation_criteria debe resumir que se evaluara.
6. max_points entre 5 y 20.
7. Espanol neutro, sin markdown ni texto extra.`,
        },
        {
          role: "user",
          content: `Material de estudio:\n${content}\n\nGenera ${safeQuantity} preguntas de desarrollo exigentes pero justas.`,
        },
      ],
      preferredModel: this.fastModel,
      fallbackModel: this.fastModel,
      temperature: 0.5,
      max_completion_tokens: 2200,
      responseFormat: { type: "json_object" },
      stream: false,
    });

    const payload = this.parseJsonPayload(response.choices[0].message.content);
    const rawItems = Array.isArray(payload) ? payload : payload.questions || [];

    const normalized = [];
    for (const item of rawItems) {
      const prompt = String(item?.prompt || "").trim();
      const referenceAnswer = String(item?.reference_answer || "").trim();
      const criteria = String(item?.evaluation_criteria || "").trim();
      const maxPointsRaw = Number(item?.max_points ?? 10);
      const maxPoints = Number.isFinite(maxPointsRaw)
        ? Math.min(Math.max(maxPointsRaw, 5), 20)
        : 10;

      if (!prompt) continue;

      normalized.push({
        prompt,
        reference_answer: referenceAnswer || null,
        evaluation_criteria: criteria || null,
        max_points: maxPoints,
      });

      if (normalized.length >= safeQuantity) break;
    }

    if (normalized.length === 0) {
      throw new Error(
        "La IA no devolvio preguntas de desarrollo validas para la simulacion.",
      );
    }

    return normalized;
  }
}

module.exports = ExamSimulationGenerationService;

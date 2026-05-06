const GroqService = require("./GroqService");

class ExamSimulationGenerationService extends GroqService {
  constructor(apiKey) {
    super(apiKey);
  }

  normalizeText(value = "") {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  isWeakGeneratedDevelopmentItem(item = {}) {
    const prompt = String(item.prompt || "").trim();
    const reference = String(item.reference_answer || "").trim();
    const criteria = String(item.evaluation_criteria || "").trim();
    if (!prompt) return true;

    const promptNormalized = this.normalizeText(prompt);
    const referenceNormalized = this.normalizeText(reference);
    const criteriaNormalized = this.normalizeText(criteria);

    const asksImpact = /(como\s+afecta|impacta|influye|consecuencia)/.test(
      promptNormalized,
    );
    const referenceMentionsImpact =
      /(afecta|impacta|influye|consecuencia|aumenta|disminuye|perdida)/.test(
        referenceNormalized,
      );

    return (
      reference.length < 150 ||
      criteria.length < 80 ||
      !/(debe incluir|incluye|evalua|criterio)/.test(criteriaNormalized) ||
      (asksImpact && !referenceMentionsImpact)
    );
  }

  async repairDevelopmentItems(questions = []) {
    const indexed = (Array.isArray(questions) ? questions : []).map(
      (item, index) => ({ index, ...item }),
    );

    const weakItems = indexed.filter((item) =>
      this.isWeakGeneratedDevelopmentItem(item),
    );

    if (weakItems.length === 0) return questions;

    try {
      const response = await this.createChatCompletion({
        messages: [
          {
            role: "system",
            content:
              'Eres un corrector academico. Mejora SOLO reference_answer y evaluation_criteria para que sean completos y justos. Devuelve SOLO JSON con forma {"repairs":[{"index":0,"reference_answer":"...","evaluation_criteria":"..."}]}. Reglas: reference_answer debe responder toda la consigna (definicion + mecanismo + impacto cuando aplique), 6-10 lineas. evaluation_criteria debe ser verificable y explicita, con formato: "Debe incluir: ..." enumerando 3-6 criterios.',
          },
          {
            role: "user",
            content: JSON.stringify({
              weakItems: weakItems.map((item) => ({
                index: item.index,
                prompt: item.prompt,
                reference_answer: item.reference_answer,
                evaluation_criteria: item.evaluation_criteria,
                max_points: item.max_points,
              })),
            }),
          },
        ],
        preferredModel: this.fastModel,
        fallbackModel: this.fastModel,
        temperature: 0.2,
        max_completion_tokens: 2200,
        responseFormat: { type: "json_object" },
        stream: false,
      });

      const payload = this.parseJsonPayload(
        response.choices[0].message.content,
      );
      const repairs = Array.isArray(payload?.repairs) ? payload.repairs : [];
      const repairMap = new Map(
        repairs
          .map((item) => {
            const idx = Number(item?.index);
            if (!Number.isInteger(idx)) return null;
            return [idx, item];
          })
          .filter(Boolean),
      );

      return indexed.map((item) => {
        const repair = repairMap.get(item.index);
        if (!repair) return questions[item.index];

        const referenceAnswer = String(repair.reference_answer || "").trim();
        const criteria = String(repair.evaluation_criteria || "").trim();

        return {
          ...questions[item.index],
          reference_answer:
            referenceAnswer || questions[item.index].reference_answer || null,
          evaluation_criteria:
            criteria || questions[item.index].evaluation_criteria || null,
        };
      });
    } catch (error) {
      console.warn(
        `ExamSimulationGenerationService: repairDevelopmentItems fallback (${error.message})`,
      );
      return questions;
    }
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
      1. Evalua primero contra la consigna (prompt) y criterios; usa referenceAnswer solo como guia, no como techo.
      2. Penaliza respuestas irrelevantes, relleno o divagacion.
      3. Si submittedText esta vacio o no responde la consigna, points = 0.
4. points debe estar en [0, maxPoints].
5. feedback breve (1-3 frases), sin markdown.
      6. missingConcepts y strengths deben ser arrays de frases cortas.
      7. Otorga credito parcial cuando haya conceptos correctos, aunque la respuesta no sea perfecta.
        8. NO asignes 0 si la respuesta contiene elementos correctos relevantes a la consigna.
        9. Si submittedText es mas completo/correcto que referenceAnswer, NO penalices por exceder la referencia.
        10. Solo incluye en missingConcepts elementos realmente ausentes en submittedText.`,
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
      4. reference_answer debe ser completa y util para correccion (6-10 lineas), respondiendo TODAS las partes de la consigna.
      5. evaluation_criteria debe ser verificable y explicita, iniciando con "Debe incluir:" y listando 3-6 criterios observables.
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

    return this.repairDevelopmentItems(normalized);
  }
}

module.exports = ExamSimulationGenerationService;

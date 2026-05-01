const GroqService = require("./GroqService");

/**
 * Service for AI-based study guide generation using Groq.
 * Extends GroqService to reuse the base Groq client and shared helpers.
 * Single Responsibility: only concerns itself with structured Markdown guide generation.
 */
class StudyGuideGenerationService extends GroqService {
  constructor(apiKey) {
    super(apiKey);
  }

  isPayloadTooLargeError(error) {
    const msg = String(error?.message || "").toLowerCase();
    return (
      error?.status === 413 ||
      msg.includes("request_too_large") ||
      msg.includes("context_length_exceeded") ||
      msg.includes("maximum context") ||
      msg.includes("too many tokens") ||
      msg.includes("input is too long")
    );
  }

  trimAtSentence(content, maxChars) {
    const text = String(content || "").trim();
    if (text.length <= maxChars) return text;

    let sliced = text.slice(0, maxChars);
    const lastSentenceBreak = Math.max(
      sliced.lastIndexOf("."),
      sliced.lastIndexOf("!"),
      sliced.lastIndexOf("?"),
    );

    if (lastSentenceBreak > maxChars * 0.7) {
      sliced = sliced.slice(0, lastSentenceBreak + 1);
    }

    return sliced.trim();
  }

  buildFallbackScale(scale = {}, ratio = 1) {
    const boundedRatio = Math.max(0.45, Math.min(1, ratio));
    const fallbackMin = (value, floor) =>
      Math.max(floor, Math.round((value || floor) * boundedRatio));

    return {
      ...scale,
      maxCompletionTokens: fallbackMin(scale.maxCompletionTokens, 4200),
      targetWordsMin: fallbackMin(scale.targetWordsMin, 700),
      targetWordsMax: fallbackMin(scale.targetWordsMax, 1200),
      conceptsMin: fallbackMin(scale.conceptsMin, 8),
      termsMin: fallbackMin(scale.termsMin, 12),
      mainPointsMin: fallbackMin(scale.mainPointsMin, 12),
      contextMaxLength: fallbackMin(scale.contextMaxLength, 7000),
    };
  }

  _buildMessages(content, scale = {}) {
    const {
      estimatedPages = 1,
      summaryParagraphs = "4-6",
      conceptsMin = 10,
      termsMin = 15,
      mainPointsMin = 15,
      reviewQuestionsRange = "8-12",
      targetWordsMin = 900,
      targetWordsMax = 1400,
    } = scale;

    return [
      {
        role: "system",
        content: `Eres un experto pedagogo que crea guias de estudio exhaustivas, detalladas y completas en espanol neutro.
Tu objetivo es que el estudiante pueda estudiar UNICAMENTE con la guia, sin necesidad de releer el material original.
El documento de origen tiene aproximadamente ${estimatedPages} paginas equivalentes.

REGLAS OBLIGATORIAS:
1. Devuelve SOLO texto en formato Markdown valido. No envuelvas la respuesta en bloques de codigo.
2. Estructura la guia con las siguientes secciones en este orden exacto:
   - ## Resumen Ejecutivo
   - ## Conceptos Clave
   - ## Terminos Importantes
   - ## Puntos Principales
   - ## Preguntas de Repaso
3. Usa encabezados (##, ###), listas (-), y negrita (**texto**) correctamente.
4. EXTENSION MINIMA POR SECCION:
   - Resumen Ejecutivo: ${summaryParagraphs} parrafos que cubran TODOS los temas, subtemas y conexiones del material.
   - Conceptos Clave: minimo ${conceptsMin} entradas. Cada una con 3-5 lineas explicando el MECANISMO o RELACION CAUSAL (por que ocurre, como funciona, que implica). NO uses abreviaturas como entradas aqui.
   - Terminos Importantes: minimo ${termsMin} entradas en formato **termino**: definicion de 1-2 lineas. Incluye EXCLUSIVAMENTE: abreviaturas/siglas, nombres de equipos, nombres de farmacos, nombres de procedimientos y vocabulario tecnico puntual. PROHIBIDO repetir entradas ya explicadas en Conceptos Clave.
   - Puntos Principales: minimo ${mainPointsMin} puntos organizados con subsecciones (###). Incluye: valores numericos especificos (temperaturas, porcentajes, tiempos), protocolos paso a paso, comparaciones, indicaciones/contraindicaciones, medidas preventivas. PROHIBIDO repetir listas de conceptos o terminos.
   - Preguntas de Repaso: entre ${reviewQuestionsRange} preguntas abiertas que cubran todos los temas.
5. COBERTURA: NO omitas ningun tema, subtema, protocolo o valor especifico mencionado en el material.
6. No inventes informacion que no se deduzca del material.
7. Escribe en espanol neutro, sin jerga regional.
8. No incluyas metadatos del documento (autor, ISBN, editorial).
9. DIFERENCIACION ESTRICTA ENTRE SECCIONES — cada seccion debe aportar informacion NUEVA:
   - Conceptos Clave = IDEAS y MECANISMOS con explicacion profunda (fisiopatologia, clasificaciones, causa-efecto).
   - Terminos Importantes = VOCABULARIO puntual: abreviaciones, siglas, equipos, farmacos, procedimientos — definicion breve. Ningun item debe aparecer tambien en Conceptos Clave.
   - Puntos Principales = DATOS CLINICOS CONCRETOS: valores, rangos, pasos, comparaciones, protocolos. No repite conceptos ni glosario.
10. REDACCION:
   - Frases claras, precisas y naturales.
   - Evita frases vacias y repeticiones literales entre secciones.
   - Mantén coherencia terminologica.
11. LONGITUD GLOBAL OBJETIVO: entre ${targetWordsMin} y ${targetWordsMax} palabras.`,
      },
      {
        role: "user",
        content: `Material de estudio:\n${content}\n\nGenera una guia de estudio EXHAUSTIVA y DETALLADA. Cubre TODOS los temas, protocolos, valores especificos y subtemas. Las tres secciones centrales deben ser completamente distintas entre si: Conceptos Clave explica mecanismos, Terminos Importantes lista vocabulario tecnico/abreviaturas, Puntos Principales desarrolla datos clinicos concretos.`,
      },
    ];
  }

  extractCoverageWindow(content, index, total, maxChars) {
    const text = String(content || "").trim();
    if (!text) return "";
    if (text.length <= maxChars) return text;

    const safeMax = Math.max(1800, maxChars);
    const stride = Math.max(1, total);
    const start = Math.floor((text.length * index) / stride);
    const end = Math.min(text.length, start + safeMax);
    const raw = text.slice(start, end);
    return this.trimAtSentence(raw, safeMax);
  }

  async generateGuideBySections(content, scale = {}) {
    const {
      estimatedPages = 1,
      summaryParagraphs = "8-11",
      conceptsMin = 18,
      termsMin = 26,
      mainPointsMin = 28,
      reviewQuestionsRange = "16-22",
    } = scale;

    const sections = [
      {
        key: "Resumen Ejecutivo",
        tokens: 760,
        prompt: `Escribe SOLO la sección ## Resumen Ejecutivo en Markdown.
Debe tener ${summaryParagraphs} párrafos y cubrir objetivos, temas y conexiones centrales del material.`,
      },
      {
        key: "Conceptos Clave",
        tokens: 900,
        prompt: `Escribe SOLO la sección ## Conceptos Clave en Markdown.
Incluye al menos ${conceptsMin} conceptos con explicación útil y evita duplicar definiciones del glosario.`,
      },
      {
        key: "Terminos Importantes",
        tokens: 850,
        prompt: `Escribe SOLO la sección ## Terminos Importantes en Markdown.
Incluye al menos ${termsMin} términos en formato **término**: definición, sin repetir explicaciones completas de Conceptos Clave.`,
      },
      {
        key: "Puntos Principales",
        tokens: 1000,
        prompt: `Escribe SOLO la sección ## Puntos Principales en Markdown.
Incluye al menos ${mainPointsMin} puntos, organizados por subtemas usando ###.`,
      },
      {
        key: "Preguntas de Repaso",
        tokens: 700,
        prompt: `Escribe SOLO la sección ## Preguntas de Repaso en Markdown.
Incluye entre ${reviewQuestionsRange} preguntas abiertas que evalúen comprensión profunda.`,
      },
    ];

    const total = sections.length;
    const builtSections = [];

    for (let i = 0; i < sections.length; i += 1) {
      const section = sections[i];
      const window = this.extractCoverageWindow(content, i, total, 5600);
      const response = await this.createChatCompletion({
        messages: [
          {
            role: "system",
            content: `Eres un pedagogo experto en redactar guías de estudio en español neutro.
Debes cubrir el material con precisión, sin inventar datos y sin repetir contenido innecesario.
Devuelve SOLO Markdown de la sección solicitada.`,
          },
          {
            role: "user",
            content: `${section.prompt}

Contexto del documento (${estimatedPages} páginas estimadas):
${window}`,
          },
        ],
        preferredModel: this.qualityModel,
        fallbackModel: this.fastModel,
        max_completion_tokens: section.tokens,
        temperature: 0.3,
      });

      const sectionText = response.choices?.[0]?.message?.content?.trim();
      if (sectionText) {
        builtSections.push(sectionText);
      }
    }

    if (builtSections.length === 0) {
      throw new Error(
        "No se pudieron generar secciones de la guía de estudio.",
      );
    }

    return builtSections.join("\n\n").trim();
  }

  async refineGuideQuality(guideMarkdown, scale = {}) {
    try {
      // With low TPM accounts, refining very long outputs in a second call can
      // exceed limits; skip refinement for large guides to prioritize success.
      if (String(guideMarkdown || "").length > 7000) {
        return guideMarkdown;
      }

      const {
        targetWordsMin = 900,
        targetWordsMax = 1400,
        conceptsMin = 10,
        termsMin = 15,
        mainPointsMin = 15,
      } = scale;

      const response = await this.createChatCompletion({
        messages: [
          {
            role: "system",
            content: `Eres un editor academico experto en mejorar guias de estudio en Markdown.

OBJETIVOS:
1. Eliminar redundancias entre secciones (especialmente Conceptos Clave vs Terminos Importantes).
2. Mejorar claridad, fluidez y precision de redaccion.
3. Mantener o aumentar cobertura, nunca reducirla de forma significativa.
4. Preservar exactamente la estructura principal de secciones (## Resumen Ejecutivo, ## Conceptos Clave, ## Terminos Importantes, ## Puntos Principales, ## Preguntas de Repaso).
5. Mantener al menos estos minimos: ${conceptsMin} conceptos, ${termsMin} terminos, ${mainPointsMin} puntos.
6. Mantener longitud total entre ${targetWordsMin} y ${targetWordsMax} palabras cuando sea posible.
7. Devuelve SOLO Markdown final, sin comentarios extra.`,
          },
          {
            role: "user",
            content:
              "Reescribe y mejora esta guia cumpliendo las reglas anteriores:\n\n" +
              guideMarkdown,
          },
        ],
        preferredModel: this.qualityModel,
        fallbackModel: this.fastModel,
        max_completion_tokens: Math.min(
          1100,
          Math.max(500, Math.floor((scale.maxCompletionTokens || 2400) * 0.4)),
        ),
        temperature: 0.2,
      });

      const refined = response.choices?.[0]?.message?.content?.trim();
      return refined || guideMarkdown;
    } catch (error) {
      console.warn(
        `StudyGuideGenerationService: no se pudo refinar la guía (${error.message}).`,
      );
      return guideMarkdown;
    }
  }

  async generateGuide(content, scale = {}) {
    console.log(
      `StudyGuideGenerationService: generateGuide model=${this.qualityModel}`,
    );

    const shouldUseSectionMode = (scale.estimatedPages || 1) > 120;
    if (shouldUseSectionMode) {
      const guideBySections = await this.generateGuideBySections(
        content,
        scale,
      );
      return this.refineGuideQuality(guideBySections, scale);
    }

    // Cap first attempt at a safe value for 6000-TPM accounts:
    // ~9000-char context ≈ 2250 input tokens → leaves ~3500 for output.
    // Subsequent fallbacks progressively reduce both context and output.
    const baseOut = Math.min(scale.maxCompletionTokens || 3000, 3000);
    const attempts = [
      { ratio: 1, contentRatio: 1, outputTokens: baseOut, hardChars: 9000 },
      {
        ratio: 0.8,
        contentRatio: 0.78,
        outputTokens: Math.round(baseOut * 0.78),
        hardChars: 7600,
      },
      {
        ratio: 0.65,
        contentRatio: 0.62,
        outputTokens: Math.round(baseOut * 0.62),
        hardChars: 6200,
      },
      {
        ratio: 0.5,
        contentRatio: 0.5,
        outputTokens: Math.round(baseOut * 0.5),
        hardChars: 5000,
      },
      {
        ratio: 0.45,
        contentRatio: 0.42,
        outputTokens: Math.round(baseOut * 0.42),
        hardChars: 4200,
      },
    ];

    let lastError = null;

    for (const attempt of attempts) {
      try {
        const scaled = this.buildFallbackScale(scale, attempt.ratio);
        const sourceLength = String(content || "").length;
        const maxCharsByRatio = Math.round(sourceLength * attempt.contentRatio);
        const boundedChars = Math.max(
          2200,
          Math.min(attempt.hardChars, maxCharsByRatio),
        );
        const scopedContent = this.trimAtSentence(content, boundedChars);
        const messages = this._buildMessages(scopedContent, scaled);

        const response = await this.createChatCompletion({
          messages,
          preferredModel: this.qualityModel,
          fallbackModel: this.fastModel,
          max_completion_tokens: Math.max(
            500,
            Math.min(attempt.outputTokens, scaled.maxCompletionTokens || 1200),
          ),
          temperature: 0.4,
        });

        const text = response.choices?.[0]?.message?.content?.trim();
        if (!text) {
          throw new Error(
            "La IA no devolvió contenido para la guía de estudio.",
          );
        }

        const refined = await this.refineGuideQuality(text, scaled);
        return refined;
      } catch (error) {
        lastError = error;
        if (!this.isPayloadTooLargeError(error)) {
          throw error;
        }

        console.warn(
          `StudyGuideGenerationService: payload grande, reintentando con contexto más compacto (${error.message}).`,
        );
      }
    }

    if (this.isPayloadTooLargeError(lastError)) {
      throw new Error(
        "El documento es demasiado extenso para generarlo en una sola pasada con la configuración actual. Intenta dividir el material por capítulos o secciones.",
      );
    }

    throw lastError;
  }
}

module.exports = StudyGuideGenerationService;

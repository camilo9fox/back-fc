const { checkLocalPatterns } = require("../utils/ContentSafetyPatterns");
const { ContentSafetyError } = require("../errors/AppError");
const logger = require("../config/logger");

const SAFETY_GUARD_MODEL = "meta-llama/llama-prompt-guard-2-86m";

const UNSAFE_CATEGORY_MESSAGES = {
  profanity: "El contenido contiene lenguaje ofensivo o vulgar.",
  slurs: "El contenido contiene insultos discriminatorios.",
  hate_speech: "El contenido contiene discurso de odio.",
  hate_speech_targeted: "El contenido contiene ataques dirigidos a un grupo protegido.",
  sexual_minors: "El contenido contiene referencias inapropiadas a menores.",
  self_harm: "El contenido contiene referencias a autolesión o suicidio.",
  violence_graphic: "El contenido contiene violencia gráfica o explícita.",
  terrorism: "El contenido contiene referencias a terrorismo o fabricación de explosivos.",
  drugs_hard: "El contenido contiene instrucciones para fabricación de drogas duras.",
  sexual_content: "El contenido incluye material sexual explícito.",
  violent_crimes: "El contenido describe crímenes violentos.",
  non_violent_crimes: "El contenido describe actividades ilegales.",
  hate: "El contenido contiene discurso de odio o discriminación.",
  self_harm_instructions: "El contenido contiene instrucciones de autolesión.",
  weapons: "El contenido incluye instrucciones sobre fabricación de armas.",
};

class ContentSafetyService {
  constructor(groqService, config = {}) {
    this.groqService = groqService;
    this.enabled = config.enabled !== false;
    this.strictMode = config.strictMode === true;
    this.localOnly = config.localOnly === true;
    this.mode = this.strictMode ? "strict" : "moderate";

    logger.info(
      `ContentSafetyService: inicializado (enabled=${this.enabled}, mode=${this.mode}, localOnly=${this.localOnly})`
    );
  }

  _shouldSkip() {
    return !this.enabled;
  }

  _userMessage(category) {
    return UNSAFE_CATEGORY_MESSAGES[category] || "El contenido infringe las políticas de seguridad.";
  }

  async checkContent(text) {
    if (this._shouldSkip()) {
      return { safe: true };
    }

    const trimmed = String(text || "").trim();
    if (!trimmed) {
      return { safe: true };
    }

    const localResult = checkLocalPatterns(trimmed, this.mode);

    if (!localResult.safe) {
      const category = localResult.flagged[0];
      logger.warn(
        `ContentSafetyService: bloqueado por filtro local (${category}). Texto: "${trimmed.slice(0, 100)}..."`
      );
      throw new ContentSafetyError(this._userMessage(category), category);
    }

    if (this.localOnly) {
      return { safe: true };
    }

    logger.info("ContentSafetyService: pasando a Llama Guard...");

    const guardResult = await this._classifyWithGuard(trimmed);

    if (!guardResult.safe) {
      const category = guardResult.category || "unknown";
      logger.warn(
        `ContentSafetyService: bloqueado por Llama Guard (${category}, confidence=${guardResult.confidence})`
      );
      throw new ContentSafetyError(this._userMessage(category), category);
    }

    return { safe: true };
  }

  async checkLocalOnly(text) {
    if (this._shouldSkip()) {
      return { safe: true };
    }

    const trimmed = String(text || "").trim();
    if (!trimmed) {
      return { safe: true };
    }

    const result = checkLocalPatterns(trimmed, this.mode);

    if (!result.safe) {
      const category = result.flagged[0];
      logger.warn(
        `ContentSafetyService: bloqueado por filtro local (${category})`
      );
      throw new ContentSafetyError(this._userMessage(category), category);
    }

    return { safe: true };
  }

  async checkBatch(items = [], extractFieldText) {
    if (this._shouldSkip()) {
      return items;
    }

    if (!Array.isArray(items) || items.length === 0) {
      return items;
    }

    if (typeof extractFieldText !== "function") {
      return items;
    }

    const safeItems = [];

    for (const item of items) {
      try {
        const text = extractFieldText(item);
        await this.checkContent(text);
        safeItems.push(item);
      } catch (error) {
        if (error instanceof ContentSafetyError) {
          logger.warn(
            `ContentSafetyService: item filtrado de batch (${error.category})`
          );
          continue;
        }
        throw error;
      }
    }

    return safeItems;
  }

  async _classifyWithGuard(text) {
    try {
      const safeText = String(text || "").slice(0, 6000);

      const response = await Promise.race([
        this.groqService.createChatCompletion({
          messages: [{ role: "user", content: safeText }],
          preferredModel: SAFETY_GUARD_MODEL,
          fallbackModel: SAFETY_GUARD_MODEL,
          temperature: 0,
          max_completion_tokens: 128,
          stream: false,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("guard timeout")), 5000),
        ),
      ]);

      const rawContent = response.choices?.[0]?.message?.content || "";
      return this._parseGuardResponse(rawContent);
    } catch (error) {
      logger.warn(
        `ContentSafetyService: Llama Guard falló (${error.message}). Fail-open: permitiendo contenido.`
      );
      return { safe: true };
    }
  }

  _parseGuardResponse(content) {
    const trimmed = String(content || "").trim().toLowerCase();

    if (trimmed.includes("unsafe") || trimmed.includes("s1") || trimmed.includes("s2") || trimmed.includes("s3")) {
      if (trimmed.includes("violent_crimes") || trimmed.includes("s1") && trimmed.includes("v")) return { safe: false, category: "violent_crimes", confidence: 0.9 };
      if (trimmed.includes("non_violent_crimes") || trimmed.includes("s2")) return { safe: false, category: "non_violent_crimes", confidence: 0.9 };
      if (trimmed.includes("sexual_content") || trimmed.includes("s3")) return { safe: false, category: "sexual_content", confidence: 0.9 };
      if (trimmed.includes("hate")) return { safe: false, category: "hate", confidence: 0.9 };
      if (trimmed.includes("self_harm")) return { safe: false, category: "self_harm", confidence: 0.9 };
      if (trimmed.includes("weapons")) return { safe: false, category: "weapons", confidence: 0.9 };
      return { safe: false, category: "unknown", confidence: 0.85 };
    }

    if (trimmed.includes("safe")) {
      return { safe: true };
    }

    return { safe: true };
  }
}

module.exports = ContentSafetyService;

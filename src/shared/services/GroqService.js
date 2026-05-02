const { Groq } = require("groq-sdk");
const logger = require("../config/logger");

// Circuit breaker states
const CB_CLOSED = "CLOSED"; // Normal operation
const CB_OPEN = "OPEN"; // Failing — reject calls immediately
const CB_HALF_OPEN = "HALF_OPEN"; // Testing if service recovered

// Ordered from most efficient/available pool to least efficient.
const DEFAULT_GROQ_MODEL_CHAIN = [
  "allam-2-7b",
  "groq/compound",
  "groq/compound-mini",
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-prompt-guard-2-22m",
  "meta-llama/llama-prompt-guard-2-86m",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-safeguard-20b",
  "qwen/qwen3-32b",
];

const DEFAULT_RATE_LIMIT_RETRIES_PER_MODEL = 1;

class GroqService {
  constructor(apiKey) {
    this.groq = new Groq({ apiKey });
    this.fastModel = process.env.GROQ_FAST_MODEL || "llama-3.1-8b-instant";
    this.qualityModel =
      process.env.GROQ_QUALITY_MODEL || "llama-3.3-70b-versatile";
    this.MAX_GENERATION_ATTEMPTS = 3;
    this.RATE_LIMIT_RETRIES_PER_MODEL = Math.max(
      1,
      Number(process.env.GROQ_RATE_LIMIT_RETRIES_PER_MODEL) ||
        DEFAULT_RATE_LIMIT_RETRIES_PER_MODEL,
    );
    this.modelFallbackChain = this._buildConfiguredModelChain();

    // Circuit breaker state
    this._cb = {
      state: CB_CLOSED,
      failures: 0,
      lastFailureAt: null,
      FAILURE_THRESHOLD: 5, // failures before opening
      COOLDOWN_MS: 60_000, // 1 min open before trying again
    };

    logger.info(
      `GroqService model fallback chain inicializada (${this.modelFallbackChain.length} modelos): ${this.modelFallbackChain.join(" -> ")}`,
    );
  }

  _uniqueDefined(items = []) {
    const seen = new Set();
    const unique = [];

    for (const raw of items) {
      const value = String(raw || "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      unique.push(value);
    }

    return unique;
  }

  _parseModelList(rawList) {
    if (!rawList || typeof rawList !== "string") return [];
    return this._uniqueDefined(rawList.split(",").map((item) => item.trim()));
  }

  _buildConfiguredModelChain() {
    const fromEnv = this._parseModelList(process.env.GROQ_MODEL_CHAIN);
    const base = fromEnv.length > 0 ? fromEnv : DEFAULT_GROQ_MODEL_CHAIN;

    // Ensure explicit fast/quality models remain available even if custom chain omits them.
    return this._uniqueDefined([this.fastModel, this.qualityModel, ...base]);
  }

  _buildOrderedAttemptChain(preferredModel, fallbackModel) {
    const base = this.modelFallbackChain;
    if (!Array.isArray(base) || base.length === 0) {
      return this._uniqueDefined([
        preferredModel,
        fallbackModel,
        this.qualityModel,
        this.fastModel,
      ]);
    }

    const preferred = String(preferredModel || "").trim();
    const fallback = String(fallbackModel || "").trim();
    let ordered;

    if (preferred) {
      const startIndex = base.indexOf(preferred);
      ordered =
        startIndex >= 0
          ? [...base.slice(startIndex), ...base.slice(0, startIndex)]
          : [preferred, ...base];
    } else {
      ordered = [...base];
    }

    // Backward compatibility: if fallback is custom and not present, try it early.
    if (fallback && !ordered.includes(fallback)) {
      if (preferred && ordered[0] === preferred) {
        ordered = [ordered[0], fallback, ...ordered.slice(1)];
      } else {
        ordered = [fallback, ...ordered];
      }
    }

    return this._uniqueDefined(ordered);
  }

  _isRateLimitError(error) {
    const message = String(error?.message || "").toLowerCase();
    const status = Number(error?.status || error?.statusCode || 0);

    return (
      status === 429 ||
      message.includes("429") ||
      message.includes("rate limit") ||
      message.includes("rate_limit") ||
      message.includes("quota") ||
      message.includes("tokens per minute") ||
      message.includes("requests per minute")
    );
  }

  _getRateLimitBackoffMs(error, attemptIndex) {
    const message = String(error?.message || "");
    const secondsMatch = message.match(/try again in\s*([\d.]+)s/i);
    if (secondsMatch) {
      return Math.ceil(parseFloat(secondsMatch[1]) * 1000) + 200;
    }

    const millisecondsMatch = message.match(/try again in\s*([\d.]+)ms/i);
    if (millisecondsMatch) {
      return Math.ceil(parseFloat(millisecondsMatch[1])) + 200;
    }

    const base = (attemptIndex + 1) * 1200;
    const jitter = Math.floor(Math.random() * 250);
    return base + jitter;
  }

  // ── Circuit breaker helpers ─────────────────────────────────────────────────
  _cbIsOpen() {
    const cb = this._cb;
    if (cb.state === CB_OPEN) {
      const elapsed = Date.now() - cb.lastFailureAt;
      if (elapsed >= cb.COOLDOWN_MS) {
        cb.state = CB_HALF_OPEN;
        logger.info(
          "GroqService circuit breaker: HALF_OPEN — probando recuperación",
        );
        return false;
      }
      return true;
    }
    return false;
  }

  _cbRecordSuccess() {
    const cb = this._cb;
    if (cb.state !== CB_CLOSED) {
      logger.info("GroqService circuit breaker: CLOSED — servicio recuperado");
    }
    cb.state = CB_CLOSED;
    cb.failures = 0;
    cb.lastFailureAt = null;
  }

  _cbRecordFailure(error) {
    const cb = this._cb;
    // Don't trip the breaker on rate-limit (429) or client errors — only on
    // server errors and network failures that indicate Groq is unavailable.
    const is429 = this._isRateLimitError(error);
    if (is429) return;

    const isClientError = error?.status >= 400 && error?.status < 500 && !is429;
    if (isClientError) return;

    cb.failures += 1;
    cb.lastFailureAt = Date.now();
    if (cb.failures >= cb.FAILURE_THRESHOLD && cb.state === CB_CLOSED) {
      cb.state = CB_OPEN;
      logger.warn(
        `GroqService circuit breaker: OPEN después de ${cb.failures} fallos. Cooldown ${cb.COOLDOWN_MS / 1000}s.`,
      );
    }
  }

  async createChatCompletion({
    messages,
    responseFormat,
    preferredModel,
    fallbackModel,
    ...options
  }) {
    // Fail fast if circuit is open
    if (this._cbIsOpen()) {
      throw new Error(
        "El servicio de IA no está disponible temporalmente. Por favor inténtalo en unos minutos.",
      );
    }

    const models = this._buildOrderedAttemptChain(
      preferredModel,
      fallbackModel,
    );
    if (models.length === 0) {
      throw new Error(
        "No hay modelos disponibles para completar la solicitud.",
      );
    }

    let lastError = null;

    for (const model of models) {
      // Retry a small number of times per model on rate-limit errors.
      for (
        let attempt = 0;
        attempt < this.RATE_LIMIT_RETRIES_PER_MODEL;
        attempt++
      ) {
        try {
          const result = await this.groq.chat.completions.create({
            messages,
            model,
            ...(responseFormat ? { response_format: responseFormat } : {}),
            ...options,
          });

          logger.info(`Groq completion OK con modelo=${model}`);
          this._cbRecordSuccess();
          return result;
        } catch (error) {
          const isRateLimit = this._isRateLimitError(error);

          if (!isRateLimit) {
            this._cbRecordFailure(error);
            throw error;
          }

          lastError = error;
          const hasAnotherRetryOnSameModel =
            attempt < this.RATE_LIMIT_RETRIES_PER_MODEL - 1;

          if (!hasAnotherRetryOnSameModel) {
            logger.warn(
              `Groq rate-limit con modelo=${model}. Probando siguiente modelo en la cadena...`,
            );
            break;
          }

          const waitMs = this._getRateLimitBackoffMs(error, attempt);
          logger.warn(
            `Groq rate-limit (${model}, intento ${attempt + 1}/${this.RATE_LIMIT_RETRIES_PER_MODEL}). Reintentando en ${waitMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }
    }

    this._cbRecordFailure(lastError);

    if (this._isRateLimitError(lastError)) {
      const chain = models.join(" -> ");
      throw new Error(
        `Todos los modelos de la cadena alcanzaron limite temporal. Modelos probados: ${chain}. Ultimo error: ${lastError?.message || "rate limit"}`,
      );
    }

    throw lastError;
  }

  parseJsonPayload(content) {
    if (!content || typeof content !== "string") {
      throw new Error("La respuesta del modelo llego vacia.");
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

  async summarizeChunk(chunk) {
    const response = await this.createChatCompletion({
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente que resume contenido en espanol. Extrae los puntos clave en un parrafo muy conciso.",
        },
        {
          role: "user",
          content:
            "Resume el siguiente texto en pocas frases manteniendo solo las ideas mas importantes:\n\n" +
            chunk,
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
    const response = await this.createChatCompletion({
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente que comprime resumenes en un texto mas corto manteniendo los puntos clave.",
        },
        {
          role: "user",
          content:
            "Reduce el siguiente resumen a un tamano mas pequeno, manteniendo solo las ideas principales:\n\n" +
            text,
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
    const response = await this.createChatCompletion({
      messages: [
        {
          role: "system",
          content:
            'Extrae conocimiento util para estudio y devuelvelo SOLO como JSON con esta forma: {"keyPoints":[],"definitions":[],"facts":[],"examples":[]}. Limita cada lista a maximo 4 items y cada item a una sola frase clara en espanol.',
        },
        {
          role: "user",
          content:
            "Fragmento " + (index + 1) + " de " + totalChunks + ":\n\n" + chunk,
        },
      ],
      preferredModel: this.fastModel,
      temperature: 0.1,
      max_completion_tokens: 600,
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

  async cleanOcrText(rawText) {
    const response = await this.createChatCompletion({
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente que limpia y reestructura texto extraido por OCR de documentos academicos. " +
            "Recibiras texto con posibles errores, palabras cortadas o ruido. " +
            "Devuelve SOLO el texto corregido, legible y en espanol, sin comentarios ni explicaciones. " +
            "Conserva todos los conceptos, definiciones y datos importantes del contenido original.",
        },
        {
          role: "user",
          content:
            "Limpia y corrige el siguiente texto OCR para que sea legible y coherente:\n\n" +
            rawText,
        },
      ],
      preferredModel: this.fastModel,
      temperature: 0.1,
      max_completion_tokens: 1500,
      stream: false,
    });
    return response.choices[0].message.content.trim();
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
          content:
            "Reduce estas notas a menos de " +
            maxLength +
            " caracteres manteniendo conceptos, definiciones y relaciones importantes:\n\n" +
            text,
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

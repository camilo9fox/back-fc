const { Groq } = require("groq-sdk");
const logger = require("../config/logger");

// Circuit breaker states
const CB_CLOSED = "CLOSED"; // Normal operation
const CB_OPEN = "OPEN"; // Failing — reject calls immediately
const CB_HALF_OPEN = "HALF_OPEN"; // Testing if service recovered

class GroqService {
  constructor(apiKey) {
    this.groq = new Groq({ apiKey });
    this.fastModel = process.env.GROQ_FAST_MODEL || "llama-3.1-8b-instant";
    this.qualityModel =
      process.env.GROQ_QUALITY_MODEL || "llama-3.3-70b-versatile";
    this.MAX_GENERATION_ATTEMPTS = 3;

    // Circuit breaker state
    this._cb = {
      state: CB_CLOSED,
      failures: 0,
      lastFailureAt: null,
      FAILURE_THRESHOLD: 5, // failures before opening
      COOLDOWN_MS: 60_000, // 1 min open before trying again
    };
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
    const is429 = error?.status === 429 || error?.message?.includes("429");
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

    const models = [preferredModel, fallbackModel].filter(Boolean);
    let lastError = null;
    for (const model of models) {
      // Retry up to 3 times on 429 rate-limit errors with backoff
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await this.groq.chat.completions.create({
            messages,
            model,
            ...(responseFormat ? { response_format: responseFormat } : {}),
            ...options,
          });
          this._cbRecordSuccess();
          return result;
        } catch (error) {
          const is429 =
            error?.status === 429 ||
            (error?.message && error.message.includes("429"));
          if (!is429 || attempt === 2) {
            lastError = error;
            break;
          }
          // Parse retryDelay from error message if available
          const retryMatch = error.message?.match(/try again in ([\d.]+)s/i);
          const waitMs = retryMatch
            ? Math.ceil(parseFloat(retryMatch[1]) * 1000) + 200
            : (attempt + 1) * 3000;
          logger.warn(
            `Groq rate limit (${model}, attempt ${attempt + 1}/3). Retrying in ${waitMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }
      if (lastError === null) break; // success on this model
    }
    this._cbRecordFailure(lastError);
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

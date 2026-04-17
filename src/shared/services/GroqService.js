const { Groq } = require("groq-sdk");

class GroqService {
  constructor(apiKey) {
    this.groq = new Groq({ apiKey });
    this.fastModel = process.env.GROQ_FAST_MODEL || "llama-3.1-8b-instant";
    this.qualityModel = process.env.GROQ_QUALITY_MODEL || "llama-3.1-8b-instant";
    this.MAX_GENERATION_ATTEMPTS = 3;
  }

  async createChatCompletion({ messages, responseFormat, preferredModel, fallbackModel, ...options }) {
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
      throw new Error("La respuesta del modelo llego vacia.");
    }
    const trimmed = content.trim();
    const fencedMatch = trimmed.match(/ + '`' + (?:json)?\s*([\s\S]*?) + '`' + /i);
    const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
    try {
      return JSON.parse(candidate);
    } catch (error) {
      const objectStart = candidate.indexOf("{");
      const arrayStart = candidate.indexOf("[");
      const start = objectStart === -1 ? arrayStart : arrayStart === -1 ? objectStart : Math.min(objectStart, arrayStart);
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
        { role: "system", content: "Eres un asistente que resume contenido en espanol. Extrae los puntos clave en un parrafo muy conciso." },
        { role: "user", content: "Resume el siguiente texto en pocas frases manteniendo solo las ideas mas importantes:\n\n" + chunk },
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
        { role: "system", content: "Eres un asistente que comprime resumenes en un texto mas corto manteniendo los puntos clave." },
        { role: "user", content: "Reduce el siguiente resumen a un tamano mas pequeno, manteniendo solo las ideas principales:\n\n" + text },
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
        { role: "system", content: 'Extrae conocimiento util para estudio y devuelvelo SOLO como JSON con esta forma: {"keyPoints":[],"definitions":[],"facts":[],"examples":[]}. Limita cada lista a maximo 4 items y cada item a una sola frase clara en espanol.' },
        { role: "user", content: "Fragmento " + (index + 1) + " de " + totalChunks + ":\n\n" + chunk },
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
      definitions: Array.isArray(payload.definitions) ? payload.definitions : [],
      facts: Array.isArray(payload.facts) ? payload.facts : [],
      examples: Array.isArray(payload.examples) ? payload.examples : [],
    };
  }

  async compressKnowledgeContext(text, maxLength) {
    const response = await this.createChatCompletion({
      messages: [
        { role: "system", content: "Comprime notas de estudio sin perder informacion clave. Devuelve texto plano compacto, claro y en espanol." },
        { role: "user", content: "Reduce estas notas a menos de " + maxLength + " caracteres manteniendo conceptos, definiciones y relaciones importantes:\n\n" + text },
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
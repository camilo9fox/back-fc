const { Groq } = require("groq-sdk");

/**
 * Service class for interacting with Groq AI
 * Follows Single Responsibility Principle - handles only Groq operations
 */
class GroqService {
  constructor(apiKey) {
    this.groq = new Groq({
      apiKey: apiKey,
    });
    this.model = "groq/compound-mini";
  }

  /**
   * Generates a flashcard based on document content
   * @param {string} documentContent - The text content from the document
   * @returns {Promise<Object>} Flashcard data
   */
  async generateFlashCard(documentContent) {
    console.log(`GroqService: generateFlashCard model=${this.model}`);
    const response = await this.groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            'Eres un asistente que crea flashcards en español. Responde sólo con JSON válido: {"question": "...", "answer": "...", "options": ["...", "...", "..."]}',
        },
        {
          role: "user",
          content: `Documento: ${documentContent}\n\nGenera una pregunta, respuesta y 3 opciones basadas en este texto.`,
        },
      ],
      model: this.model,
      temperature: 0.3,
      max_completion_tokens: 256,
      top_p: 1,
      stream: false,
    });

    return JSON.parse(response.choices[0].message.content);
  }

  async summarizeChunk(chunk) {
    console.log(`GroqService: summarizeChunk model=${this.model}`);
    const response = await this.groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente que resume contenido técnico en español. Extrae los puntos clave en un párrafo muy conciso.",
        },
        {
          role: "user",
          content: `Resume el siguiente texto en pocas frases manteniendo solo las ideas más importantes:\n\n${chunk}`,
        },
      ],
      model: this.model,
      temperature: 0.0,
      max_completion_tokens: 64,
      top_p: 1,
      stream: false,
    });

    return response.choices[0].message.content.trim();
  }

  async summarizeSummary(text) {
    console.log(`GroqService: summarizeSummary model=${this.model}`);
    const response = await this.groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente que comprime resúmenes en un texto más corto manteniendo los puntos clave.",
        },
        {
          role: "user",
          content: `Reduce el siguiente resumen a un tamaño más pequeño, manteniendo solo las ideas principales:\n\n${text}`,
        },
      ],
      model: this.model,
      temperature: 0.0,
      max_completion_tokens: 64,
      top_p: 1,
      stream: false,
    });

    return response.choices[0].message.content.trim();
  }
}

module.exports = GroqService;

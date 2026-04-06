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
    this.model = "llama-3.1-8b-instant";
  }

  /**
   * Generates flashcards based on document content
   * @param {string} documentContent - The text content from the document
   * @param {number} quantity - Number of flashcards to generate
   * @returns {Promise<Array<Object>>} Array of flashcard data
   */
  async generateFlashCards(documentContent, quantity = 1) {
    console.log(
      `GroqService: generateFlashCards model=${this.model}, quantity=${quantity}`,
    );
    const response = await this.groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Eres un experto pedagogo. Tu tarea es generar flashcards educativas de alta calidad en JSON.
  
            REGLAS CRÍTICAS:
            1. Cada "question" debe ser una oración completa y profesional.
            2. La "answer" debe ser la respuesta correcta exacta.
            3. El array "options" DEBE contener 3 elementos: la respuesta correcta (idéntica a "answer") y 2 distractores incorrectos.
            4. NUNCA repitas el tema de una pregunta en la misma tanda.
            
            FORMATO ESPERADO PARA MÚLTIPLES FLASHCARDS:
            [
              {
                "question": "¿Cuál es la función principal de las mitocondrias en la célula?",
                "answer": "Producir energía en forma de ATP",
                "options": ["Sintetizar proteínas", "Producir energía en forma de ATP", "Almacenar material genético"]
              },
              {
                "question": "¿Otra pregunta diferente?",
                "answer": "Respuesta correcta",
                "options": ["Opción incorrecta 1", "Respuesta correcta", "Opción incorrecta 2"]
              }
        ]
            `,
        },
        {
          role: "user",
          content: `Documento: ${documentContent}\n\n Genera ${quantity} preguntas diferentes con su respuesta y 3 opciones cada una basadas en este texto. Una de las opciones debe ser la respuesta correcta. Las preguntas deben ser únicas y no repetirse entre sí. Asegúrate de que las preguntas sean claras, las respuestas correctas y las opciones plausibles. Responde solo con el JSON array sin texto adicional.`,
        },
      ],
      model: this.model,
      temperature: 0.6,
      max_completion_tokens: 2048,
      frequency_penalty: 0.5,
      presence_penalty: 0.3,
      response_format: { type: "json_object" },
      stream: false,
    });
    const result = JSON.parse(response.choices[0].message.content.trim());
    return Array.isArray(result) ? result : [result];
  }

  /**
   * Generates a single flashcard (legacy method, now uses generateFlashCards)
   * @param {string} documentContent - The text content from the document
   * @returns {Promise<Object>} Flashcard data
   */
  async generateFlashCard(documentContent) {
    const flashcards = await this.generateFlashCards(documentContent, 1);
    return flashcards[0];
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

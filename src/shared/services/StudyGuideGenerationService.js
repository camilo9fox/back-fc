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

  _buildMessages(content) {
    return [
      {
        role: "system",
        content: `Eres un experto pedagogo que crea guias de estudio estructuradas, claras y completas en espanol neutro.

REGLAS OBLIGATORIAS:
1. Devuelve SOLO texto en formato Markdown valido. No envuelvas la respuesta en bloques de codigo.
2. Estructura la guia con las siguientes secciones en este orden exacto:
   - ## Resumen Ejecutivo
   - ## Conceptos Clave
   - ## Terminos Importantes
   - ## Puntos Principales
   - ## Preguntas de Repaso
3. Usa encabezados (##, ###), listas (-), y negrita (**texto**) correctamente.
4. Los Terminos Importantes deben estar en formato de glosario: **termino**: definicion.
5. Las Preguntas de Repaso deben ser entre 5 y 8 preguntas abiertas que promuevan reflexion.
6. No inventes informacion que no se deduzca del material.
7. Escribe en espanol neutro, sin jerga regional.
8. No incluyas metadatos del documento (autor, ISBN, editorial).`,
      },
      {
        role: "user",
        content: `Material de estudio:\n${content}\n\nGenera una guia de estudio estructurada y completa basada en este material.`,
      },
    ];
  }

  async generateGuide(content) {
    console.log(
      `StudyGuideGenerationService: generateGuide model=${this.qualityModel}`,
    );

    const messages = this._buildMessages(content);

    const response = await this.createChatCompletion({
      messages,
      preferredModel: this.qualityModel,
      fallbackModel: this.fastModel,
      max_completion_tokens: 6000,
      temperature: 0.4,
    });

    const text = response.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("La IA no devolvió contenido para la guía de estudio.");
    }

    return text;
  }
}

module.exports = StudyGuideGenerationService;

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
        content: `Eres un experto pedagogo que crea guias de estudio exhaustivas, detalladas y completas en espanol neutro.
Tu objetivo es que el estudiante pueda estudiar UNICAMENTE con la guia, sin necesidad de releer el material original.

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
   - Resumen Ejecutivo: 4-6 parrafos que cubran todos los temas del material.
   - Conceptos Clave: minimo 10 conceptos, cada uno con su explicacion de 2-4 lineas.
   - Terminos Importantes: minimo 15 terminos en formato glosario **termino**: definicion completa.
   - Puntos Principales: minimo 15 puntos concretos organizados por subtema con subsecciones (###).
   - Preguntas de Repaso: entre 8 y 12 preguntas abiertas que cubran todos los temas.
5. COBERTURA: NO omitas ningun tema, subtema o concepto mencionado en el material. Sé exhaustivo.
6. No inventes informacion que no se deduzca del material.
7. Escribe en espanol neutro, sin jerga regional.
8. No incluyas metadatos del documento (autor, ISBN, editorial).`,
      },
      {
        role: "user",
        content: `Material de estudio:\n${content}\n\nGenera una guia de estudio EXHAUSTIVA y DETALLADA basada en este material. Asegurate de cubrir TODOS los conceptos, temas y subtemas presentes. No omitas ninguna idea importante. La guia debe ser lo suficientemente completa como para que el estudiante no necesite releer el material original.`,
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

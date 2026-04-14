const pdfParse = require("pdf-parse");
const config = require("../../../shared/config/config");

/**
 * Service class for file processing operations
 * Handles file validation and text extraction
 */
class FileService {
  constructor() {
    this.MAX_FILE_SIZE = config.limits.fileSizeLimit;
    this.SUPPORTED_TYPES = config.limits.allowedFileTypes;
  }

  /**
   * Validates if the file type is supported
   * @param {string} mimetype - MIME type of the file
   * @returns {boolean} True if supported
   */
  isSupportedFileType(mimetype) {
    return this.SUPPORTED_TYPES.includes(mimetype);
  }

  /**
   * Validates file size
   * @param {number} size - File size in bytes
   * @returns {boolean} True if size is acceptable
   */
  isValidFileSize(size) {
    return size <= this.MAX_FILE_SIZE;
  }

  /**
   * Extracts text content from a file
   * @param {Object} file - File object with buffer and mimetype
   * @returns {Promise<string>} Extracted text
   */
  async extractText(file) {
    if (!this.isSupportedFileType(file.mimetype)) {
      throw new Error("Tipo de archivo no soportado. Solo PDF o TXT");
    }

    if (!this.isValidFileSize(file.size)) {
      throw new Error(
        `Archivo demasiado grande. Máximo ${Math.round(this.MAX_FILE_SIZE / (1024 * 1024))}MB permitido.`,
      );
    }

    if (file.mimetype === "application/pdf") {
      return await this.extractTextFromPdf(file.buffer);
    } else if (file.mimetype === "text/plain") {
      return this.extractTextFromTxt(file.buffer);
    }
  }

  /**
   * Extracts text from PDF buffer
   * @param {Buffer} buffer - PDF file buffer
   * @returns {Promise<string>} Extracted text
   */
  async extractTextFromPdf(buffer) {
    const data = await pdfParse(buffer);
    const extractedText = typeof data.text === "string" ? data.text.trim() : "";

    console.log(
      `PDF extraction: pages=${data.numpages}, textLength=${extractedText.length}`,
    );

    if (!extractedText) {
      throw new Error(
        "No se pudo extraer texto del PDF. Asegúrate de que no sea un PDF escaneado o basado en imágenes.",
      );
    }

    return extractedText;
  }

  /**
   * Extracts text from TXT buffer
   * @param {Buffer} buffer - TXT file buffer
   * @returns {string} Extracted text
   */
  extractTextFromTxt(buffer) {
    return buffer.toString("utf-8");
  }
}

module.exports = FileService;

const path = require("path");
const { Worker } = require("worker_threads");
const config = require("../config/config");

/**
 * Service class for file processing operations
 * Handles file validation and text extraction
 */
class FileService {
  constructor(pdfRendererService = null, ocrService = null) {
    this.MAX_FILE_SIZE = config.limits.fileSizeLimit;
    this.SUPPORTED_TYPES = config.limits.allowedFileTypes;
    this.pdfRendererService = pdfRendererService;
    this.ocrService = ocrService;
    this.pdfParseWorkerPath = path.join(
      __dirname,
      "..",
      "workers",
      "pdfParseWorker.js",
    );
  }

  parsePdfInWorker(buffer) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.pdfParseWorkerPath, {
        workerData: {
          buffer,
        },
      });

      worker.once("message", (payload) => {
        if (payload?.error) {
          reject(new Error(payload.error));
          return;
        }

        resolve(payload);
      });

      worker.once("error", reject);

      worker.once("exit", (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `El worker de PDF terminó de forma inesperada (${code}).`,
            ),
          );
        }
      });
    });
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
    const { text } = await this.extractTextWithMeta(file);
    return text;
  }

  /**
   * Extracts text content and metadata from a file
   * @param {Object} file - File object with buffer and mimetype
   * @returns {Promise<{text: string, pageCount: number|null}>}
   */
  async extractTextWithMeta(file) {
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
      return { text: this.extractTextFromTxt(file.buffer), pageCount: null };
    }
  }

  /**
   * Extracts text from PDF buffer
   * @param {Buffer} buffer - PDF file buffer
   * @returns {Promise<string>} Extracted text
   */
  async extractTextFromPdf(buffer) {
    const { text: extractedText, pageCount } =
      await this.parsePdfInWorker(buffer);

    console.log(
      `PDF extraction: pages=${pageCount}, textLength=${extractedText.length}`,
    );

    if (extractedText) {
      return { text: extractedText, pageCount };
    }

    // Scanned / image-based PDF — delegate to Tesseract OCR
    if (!this.pdfRendererService || !this.ocrService) {
      throw new Error(
        "No se pudo extraer texto del PDF. Asegúrate de que no sea un PDF escaneado o basado en imágenes.",
      );
    }

    console.log("PDF has no selectable text — using OCR...");
    const { pageCount: analyzedPageCount } =
      await this.pdfRendererService.analyzeDocument(buffer);
    const { pageCount: pages, renderPage } =
      await this.pdfRendererService.createPageRenderer(
        buffer,
        analyzedPageCount,
      );
    const ocrText = await this.ocrService.extractTextInterleaved(
      pages,
      renderPage,
    );

    if (!ocrText) {
      throw new Error(
        "No se pudo extraer texto del PDF, ni siquiera con OCR. Verifica que el archivo sea legible.",
      );
    }

    console.log(`OCR completado: ${ocrText.length} caracteres extraídos.`);
    return { text: ocrText, pageCount: analyzedPageCount || pageCount };
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

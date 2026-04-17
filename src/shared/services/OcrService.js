const { createWorker, OEM, PSM } = require("tesseract.js");

// 1 worker = secuencial, no paralelo → CPU nunca al 100% sostenido
const WORKER_COUNT = 1;

class OcrService {
  constructor() {
    this._worker = null;
  }

  async _getWorker() {
    if (!this._worker) {
      this._worker = await createWorker("spa+eng", OEM.LSTM_ONLY, {
        // Suprime logs de Tesseract en consola
        logger: () => {},
        errorHandler: () => {},
      });
      await this._worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
      });
    }
    return this._worker;
  }

  /**
   * Extracts text from an array of PNG image buffers (one per PDF page).
   * Pages are processed sequentially to keep CPU load low.
   * @param {Buffer[]} pageImageBuffers
   * @returns {Promise<string>}
   */
  async extractTextFromImages(pageImageBuffers) {
    const worker = await this._getWorker();
    const parts = [];

    for (const imgBuffer of pageImageBuffers) {
      const { data } = await worker.recognize(imgBuffer);
      const cleaned = this._cleanOcrOutput(data.text);
      if (cleaned) parts.push(cleaned);
    }

    return parts.join("\n\n");
  }

  /**
   * Removes OCR noise: very short lines, non-alphanumeric garbage,
   * control characters and duplicate consecutive lines.
   * @param {string} text
   * @returns {string}
   */
  _cleanOcrOutput(text) {
    if (!text) return "";

    // Strip control characters except newlines and tabs
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

    // Rejoin words broken across lines by OCR (hyphen at end of line)
    text = text.replace(/-\n/g, "");

    // Collapse 3+ consecutive newlines to 2
    text = text.replace(/\n{3,}/g, "\n\n");

    // Collapse multiple spaces/tabs to single space
    text = text.replace(/[ \t]{2,}/g, " ");

    const seen = new Set();
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((line) => {
        if (line.length < 4) return false;
        // Drop lines that are mostly non-alphanumeric (symbols, dashes, underscores)
        const alphanumRatio =
          (line.match(/[a-z0-9áéíóúüñ]/gi) || []).length / line.length;
        if (alphanumRatio < 0.35) return false;
        // Drop lines that are only numbers (page numbers, footnote markers)
        if (/^\d+\.?\s*$/.test(line)) return false;
        // Drop duplicate lines (headers/footers repeated on every page)
        if (seen.has(line.toLowerCase())) return false;
        seen.add(line.toLowerCase());
        return true;
      });

    return lines.join("\n");
  }

  /**
   * Extracts text from an async generator of PNG buffers (one per page).
   * Pipelines render + OCR: while Tesseract processes page N in its worker
   * thread, the event loop advances the generator to render page N+1.
   * @param {AsyncGenerator<Buffer>} pageStream
   * @returns {Promise<string>}
   */
  async extractTextPipelined(pageStream) {
    const worker = await this._getWorker();
    const parts = [];

    // Eagerly request the first page from the generator
    let next = pageStream.next();

    while (true) {
      const { value: imageBuffer, done } = await next;
      if (done) break;

      // Kick off the next render immediately — it will run on the event loop
      // while Tesseract occupies its own worker thread below
      next = pageStream.next();

      const { data } = await worker.recognize(imageBuffer);
      const cleaned = this._cleanOcrOutput(data.text);
      if (cleaned) parts.push(cleaned);
    }

    return parts.join("\n\n");
  }

  async terminate() {
    if (this._worker) {
      await this._worker.terminate();
      this._worker = null;
    }
  }
}

module.exports = OcrService;

const { createWorker, OEM, PSM } = require("tesseract.js");

// 3 workers = OCR paralelo en tríos de páginas → mejora marginal sobre 2 workers
// sin riesgo de saturar CPU porque el render (pdfjs) sigue siendo secuencial
const WORKER_COUNT = 3;

class OcrService {
  constructor() {
    this._workers = [];
  }

  async _getWorkers() {
    if (this._workers.length === WORKER_COUNT) return this._workers;

    const pending = [];
    for (let i = this._workers.length; i < WORKER_COUNT; i++) {
      pending.push(
        createWorker("spa+eng", OEM.LSTM_ONLY, {
          logger: () => {},
          errorHandler: () => {},
        }).then(async (w) => {
          await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
          return w;
        }),
      );
    }
    const created = await Promise.all(pending);
    this._workers.push(...created);
    return this._workers;
  }

  /**
   * Extracts text from an array of PNG image buffers (one per PDF page).
   * Pages are processed sequentially to keep CPU load low.
   * @param {Buffer[]} pageImageBuffers
   * @returns {Promise<string>}
   */
  async extractTextFromImages(pageImageBuffers) {
    const workers = await this._getWorkers();
    const parts = new Array(pageImageBuffers.length).fill("");

    // Distribute pages across workers in round-robin, run each worker's
    // pages sequentially to avoid conflicts within a worker
    const workerJobs = workers.map(() => []);
    pageImageBuffers.forEach((buf, i) =>
      workerJobs[i % workers.length].push({ buf, i }),
    );

    await Promise.all(
      workerJobs.map(async (jobs, wi) => {
        const w = workers[wi];
        for (const { buf, i } of jobs) {
          const { data } = await w.recognize(buf);
          parts[i] = this._cleanOcrOutput(data.text);
        }
      }),
    );

    return parts.filter(Boolean).join("\n\n");
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
  /**
   * Extracts text from PDF pages with a 1-page render lookahead.
   *
   * Safety guarantee: render(N+1) is only started AFTER render(N) has fully
   * resolved, so pdfjs never has two concurrent renders. The overlap is only
   * between pdfjs (idle, render done) and the Tesseract worker thread (OCR),
   * which use completely separate resources.
   *
   * @param {number} pageCount
   * @param {(index: number) => Promise<Buffer>} renderPage - must be called sequentially
   * @returns {Promise<string>}
   */
  async extractTextInterleaved(pageCount, renderPage) {
    if (pageCount === 0) return "";
    const workers = await this._getWorkers();
    const parts = new Array(pageCount).fill("");

    // Render all pages sequentially (pdfjs constraint) into a buffer array,
    // then distribute OCR across both workers in round-robin.
    // Render and the first OCR batch overlap: while worker0 OCRs page 0,
    // we continue rendering pages 1..N sequentially.
    const buffers = new Array(pageCount);
    buffers[0] = await renderPage(0);

    // Kick off OCR for page 0 on worker 0 immediately
    const ocrPromises = new Array(pageCount);
    ocrPromises[0] = workers[0].recognize(buffers[0]);

    for (let i = 1; i < pageCount; i++) {
      // Render page i (sequential — pdfjs safe)
      buffers[i] = await renderPage(i);
      // Assign to a worker in round-robin and start OCR immediately
      ocrPromises[i] = workers[i % workers.length].recognize(buffers[i]);
    }

    // Collect results in order
    for (let i = 0; i < pageCount; i++) {
      const { data } = await ocrPromises[i];
      parts[i] = this._cleanOcrOutput(data.text);
    }

    return parts.filter(Boolean).join("\n\n");
  }

  async terminate() {
    await Promise.all(this._workers.map((w) => w.terminate()));
    this._workers = [];
  }
}

module.exports = OcrService;

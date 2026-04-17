// Scale 1.0x = ~96 DPI — low enough to keep CPU load down,
// high enough for Tesseract to read text reliably.
const RENDER_SCALE = 1.0;
const MAX_PAGES = 50;

let pdfjsLib = null;

function _loadPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
    pdfjsLib.GlobalWorkerOptions.workerSrc = false;
  }
  return pdfjsLib;
}

class PdfRendererService {
  /**
   * Checks whether a PDF has selectable text or is image-based.
   * @param {Buffer} buffer
   * @returns {Promise<{isScanned: boolean, pageCount: number}>}
   */
  async analyzeDocument(buffer) {
    const pdfjs = _loadPdfjs();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) })
      .promise;
    const pageCount = pdf.numPages;
    const pagesToCheck = Math.min(pageCount, 3);

    let totalChars = 0;
    for (let i = 1; i <= pagesToCheck; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      totalChars += content.items.reduce(
        (sum, item) => sum + (item.str || "").length,
        0,
      );
    }

    return { isScanned: totalChars < 20, pageCount };
  }

  /**
   * Renders PDF pages to PNG Buffers for OCR.
   * Processes only up to MAX_PAGES pages.
   * @param {Buffer} buffer
   * @param {number} totalPages
   * @returns {Promise<Buffer[]>}
   */
  async renderPages(buffer, totalPages) {
    const { createCanvas } = require("canvas");
    const pdfjs = _loadPdfjs();

    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) })
      .promise;
    const pagesToRender = Math.min(totalPages, MAX_PAGES);
    const images = [];

    for (let i = 1; i <= pagesToRender; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: RENDER_SCALE });

      const canvas = createCanvas(
        Math.round(viewport.width),
        Math.round(viewport.height),
      );
      const ctx = canvas.getContext("2d");

      await page.render({
        canvasContext: ctx,
        viewport,
        canvasFactory: {
          create: (w, h) => {
            const c = createCanvas(w, h);
            return { canvas: c, context: c.getContext("2d") };
          },
          reset: (item, w, h) => {
            item.canvas.width = w;
            item.canvas.height = h;
          },
          destroy: () => {},
        },
      }).promise;

      images.push(canvas.toBuffer("image/png"));
    }

    return images;
  }

  /**
   * Async generator that yields one PNG Buffer per page.
   * Allows the caller to start OCR-ing page N while page N+1 is being rendered.
   * @param {Buffer} buffer
   * @param {number} totalPages
   * @yields {Buffer} PNG image buffer
   */
  async *renderPagesStream(buffer, totalPages) {
    const { createCanvas } = require("canvas");
    const pdfjs = _loadPdfjs();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) })
      .promise;
    const pagesToRender = Math.min(totalPages, MAX_PAGES);

    for (let i = 1; i <= pagesToRender; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: RENDER_SCALE });

      const canvas = createCanvas(
        Math.round(viewport.width),
        Math.round(viewport.height),
      );
      const ctx = canvas.getContext("2d");

      await page.render({
        canvasContext: ctx,
        viewport,
        canvasFactory: {
          create: (w, h) => {
            const c = createCanvas(w, h);
            return { canvas: c, context: c.getContext("2d") };
          },
          reset: (item, w, h) => {
            item.canvas.width = w;
            item.canvas.height = h;
          },
          destroy: () => {},
        },
      }).promise;

      yield canvas.toBuffer("image/png");
    }
  }
}

module.exports = PdfRendererService;

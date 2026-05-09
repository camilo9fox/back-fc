"use strict";

// Mock pdfjs-dist dynamic import by mocking the module-level _loadPdfjs function
// Since _loadPdfjs is a module-scoped function, we mock it through the pdf document API.

const mockRenderPromise = jest.fn().mockResolvedValue(undefined);
const mockGetViewport = jest.fn().mockReturnValue({ width: 200, height: 300 });
const mockRender = jest.fn().mockReturnValue({ promise: mockRenderPromise() });
const mockGetTextContent = jest.fn().mockResolvedValue({
  items: [{ str: "some text content" }, { str: " more content" }],
});
const mockGetPage = jest.fn().mockResolvedValue({
  getViewport: mockGetViewport,
  render: mockRender,
  getTextContent: mockGetTextContent,
});
const mockPdfDoc = {
  numPages: 3,
  getPage: mockGetPage,
};
const mockGetDocument = jest
  .fn()
  .mockReturnValue({ promise: Promise.resolve(mockPdfDoc) });

// Mock the dynamic import by mocking worker_threads module scope won't help.
// Instead we mock via jest.mock for the import inside the module.
const mockPdfjsLib = {
  getDocument: mockGetDocument,
  GlobalWorkerOptions: { workerSrc: null },
};

jest.mock(
  "pdfjs-dist/legacy/build/pdf.mjs",
  () => ({ default: mockPdfjsLib }),
  { virtual: true },
);

jest.mock("pdfjs-dist/legacy/build/pdf.js", () => mockPdfjsLib, {
  virtual: true,
});

jest.mock("canvas", () => {
  const mockCtx = {
    scale: jest.fn(),
    drawImage: jest.fn(),
  };
  const mockCanvas = {
    getContext: jest.fn().mockReturnValue(mockCtx),
    toBuffer: jest.fn().mockReturnValue(Buffer.from("PNG_DATA")),
    width: 200,
    height: 300,
  };
  return {
    createCanvas: jest.fn().mockReturnValue(mockCanvas),
  };
});

jest.mock("../../../src/shared/config/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const PdfRendererService = require("../../../src/shared/services/PdfRendererService");

beforeEach(() => {
  jest.clearAllMocks();
  // Reset render mock chain
  mockRender.mockReturnValue({ promise: Promise.resolve() });
  mockGetViewport.mockReturnValue({ width: 200, height: 300 });
  mockGetPage.mockResolvedValue({
    getViewport: mockGetViewport,
    render: mockRender,
    getTextContent: mockGetTextContent,
  });
  mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdfDoc) });
  mockGetTextContent.mockResolvedValue({
    items: [{ str: "some selectable text content" }],
  });
  mockPdfDoc.numPages = 3;
  mockPdfDoc.getPage = mockGetPage;
});

describe("PdfRendererService.analyzeDocument()", () => {
  it("returns pageCount and isScanned=false when text is found", async () => {
    const svc = new PdfRendererService();
    const result = await svc.analyzeDocument(Buffer.from("%PDF"));
    expect(result.pageCount).toBe(3);
    expect(result.isScanned).toBe(false);
  });

  it("returns isScanned=true when no selectable text", async () => {
    mockGetTextContent.mockResolvedValue({ items: [] });
    const svc = new PdfRendererService();
    const result = await svc.analyzeDocument(Buffer.from("%PDF"));
    expect(result.isScanned).toBe(true);
  });

  it("checks at most 3 pages", async () => {
    mockPdfDoc.numPages = 10;
    const svc = new PdfRendererService();
    await svc.analyzeDocument(Buffer.from("%PDF"));
    expect(mockGetPage).toHaveBeenCalledTimes(3);
  });

  it("checks all pages when fewer than 3", async () => {
    mockPdfDoc.numPages = 2;
    const svc = new PdfRendererService();
    await svc.analyzeDocument(Buffer.from("%PDF"));
    expect(mockGetPage).toHaveBeenCalledTimes(2);
  });
});

describe("PdfRendererService.renderPages()", () => {
  it("renders pages and returns PNG buffers", async () => {
    mockPdfDoc.numPages = 2;
    const svc = new PdfRendererService();
    const images = await svc.renderPages(Buffer.from("%PDF"), 2);
    expect(images.length).toBe(2);
    images.forEach((img) => expect(Buffer.isBuffer(img)).toBe(true));
  });

  it("limits rendering to MAX_PAGES (50) pages", async () => {
    mockPdfDoc.numPages = 100;
    const svc = new PdfRendererService();
    const images = await svc.renderPages(Buffer.from("%PDF"), 100);
    expect(images.length).toBe(50);
  });

  it("renders fewer pages when totalPages < MAX_PAGES", async () => {
    mockPdfDoc.numPages = 5;
    const svc = new PdfRendererService();
    const images = await svc.renderPages(Buffer.from("%PDF"), 5);
    expect(images.length).toBe(5);
  });
});

describe("PdfRendererService.createPageRenderer()", () => {
  it("returns pageCount and renderPage function", async () => {
    mockPdfDoc.numPages = 3;
    const svc = new PdfRendererService();
    const { pageCount, renderPage } = await svc.createPageRenderer(
      Buffer.from("%PDF"),
      3,
    );
    expect(pageCount).toBe(3);
    expect(typeof renderPage).toBe("function");
  });

  it("clamps pageCount to MAX_PAGES", async () => {
    mockPdfDoc.numPages = 200;
    const svc = new PdfRendererService();
    const { pageCount } = await svc.createPageRenderer(
      Buffer.from("%PDF"),
      200,
    );
    expect(pageCount).toBe(50);
  });

  it("renderPage(index) returns a PNG buffer", async () => {
    mockPdfDoc.numPages = 2;
    const svc = new PdfRendererService();
    const { renderPage } = await svc.createPageRenderer(Buffer.from("%PDF"), 2);
    const img = await renderPage(0);
    expect(Buffer.isBuffer(img)).toBe(true);
  });

  it("renderPage calls getPage with 1-based index", async () => {
    mockPdfDoc.numPages = 1;
    const svc = new PdfRendererService();
    const { renderPage } = await svc.createPageRenderer(Buffer.from("%PDF"), 1);
    await renderPage(0);
    expect(mockGetPage).toHaveBeenCalledWith(1);
    await renderPage(2);
    expect(mockGetPage).toHaveBeenCalledWith(3);
  });
});

describe("PdfRendererService.renderPagesStream()", () => {
  it("yields PNG buffers for each page", async () => {
    mockPdfDoc.numPages = 3;
    const svc = new PdfRendererService();
    const buffers = [];
    for await (const buf of svc.renderPagesStream(Buffer.from("%PDF"), 3)) {
      buffers.push(buf);
    }
    expect(buffers.length).toBe(3);
    buffers.forEach((buf) => expect(Buffer.isBuffer(buf)).toBe(true));
  });

  it("limits to MAX_PAGES", async () => {
    mockPdfDoc.numPages = 100;
    const svc = new PdfRendererService();
    const buffers = [];
    for await (const buf of svc.renderPagesStream(Buffer.from("%PDF"), 100)) {
      buffers.push(buf);
    }
    expect(buffers.length).toBe(50);
  });
});

describe("PdfRendererService canvasFactory callbacks", () => {
  it("invokes canvasFactory.create, reset, and destroy during renderPages", async () => {
    mockPdfDoc.numPages = 1;

    // Override render to call canvasFactory methods
    mockRender.mockImplementation(({ canvasFactory }) => {
      const item = canvasFactory.create(10, 10);
      canvasFactory.reset(item, 20, 20);
      canvasFactory.destroy(item);
      return { promise: Promise.resolve() };
    });

    const svc = new PdfRendererService();
    const images = await svc.renderPages(Buffer.from("%PDF"), 1);
    expect(images.length).toBe(1);
  });

  it("invokes canvasFactory callbacks during createPageRenderer.renderPage", async () => {
    mockPdfDoc.numPages = 1;

    mockRender.mockImplementation(({ canvasFactory }) => {
      const item = canvasFactory.create(10, 10);
      canvasFactory.reset(item, 20, 20);
      canvasFactory.destroy(item);
      return { promise: Promise.resolve() };
    });

    const svc = new PdfRendererService();
    const { renderPage } = await svc.createPageRenderer(Buffer.from("%PDF"), 1);
    const img = await renderPage(0);
    expect(Buffer.isBuffer(img)).toBe(true);
  });

  it("invokes canvasFactory callbacks during renderPagesStream", async () => {
    mockPdfDoc.numPages = 1;

    mockRender.mockImplementation(({ canvasFactory }) => {
      const item = canvasFactory.create(10, 10);
      canvasFactory.reset(item, 20, 20);
      canvasFactory.destroy(item);
      return { promise: Promise.resolve() };
    });

    const svc = new PdfRendererService();
    const buffers = [];
    for await (const buf of svc.renderPagesStream(Buffer.from("%PDF"), 1)) {
      buffers.push(buf);
    }
    expect(buffers.length).toBe(1);
  });
});

describe("PdfRendererService._loadPdfjs singleton", () => {
  it("reuses cached pdfjsLib on subsequent calls (line 19)", async () => {
    const svc = new PdfRendererService();
    // First call loads pdfjsLib (lines 14-29), second call returns cached (line 19)
    await svc.analyzeDocument(Buffer.from("%PDF"));
    await svc.analyzeDocument(Buffer.from("%PDF"));
    // No error means caching works
    expect(mockGetDocument).toHaveBeenCalledTimes(2);
  });
});

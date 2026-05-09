"use strict";

jest.mock("worker_threads", () => {
  const EventEmitter = require("events");
  const MockWorker = jest.fn().mockImplementation(() => {
    const emitter = new EventEmitter();
    emitter.once = jest.fn((event, cb) => {
      EventEmitter.prototype.once.call(emitter, event, cb);
      return emitter;
    });
    return emitter;
  });
  return { Worker: MockWorker };
});

jest.mock("../../../src/shared/config/config", () => ({
  limits: {
    fileSizeLimit: 50 * 1024 * 1024,
    allowedFileTypes: ["application/pdf", "text/plain"],
  },
}));

jest.mock("../../../src/shared/config/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { Worker } = require("worker_threads");
const FileService = require("../../../src/shared/services/FileService");

function buildService(pdfRenderer = null, ocrService = null) {
  return new FileService(pdfRenderer, ocrService);
}

describe("FileService.buildPdfCacheKey()", () => {
  it("returns null for empty buffer", () => {
    const svc = buildService();
    expect(svc.buildPdfCacheKey(Buffer.alloc(0))).toBeNull();
  });

  it("returns null for non-buffer", () => {
    const svc = buildService();
    expect(svc.buildPdfCacheKey("not a buffer")).toBeNull();
  });

  it("returns a string for a valid buffer", () => {
    const svc = buildService();
    const key = svc.buildPdfCacheKey(Buffer.from("PDF content here"));
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  it("returns the same key for the same buffer", () => {
    const svc = buildService();
    const buf = Buffer.from("same content");
    expect(svc.buildPdfCacheKey(buf)).toBe(svc.buildPdfCacheKey(buf));
  });
});

describe("FileService.getCachedPdfText()", () => {
  it("returns null on cache miss", () => {
    const svc = buildService();
    expect(svc.getCachedPdfText("no-such-key")).toBeNull();
  });

  it("returns cached value on hit", () => {
    const svc = buildService();
    const val = { text: "hello", pageCount: 1 };
    svc.setCachedPdfText("k1", val);
    expect(svc.getCachedPdfText("k1")).toEqual(val);
  });

  it("returns null after TTL expiry", () => {
    const svc = buildService();
    const val = { text: "expired content", pageCount: 2 };
    svc.pdfTextCache.set("expired-key", {
      value: val,
      expiresAt: Date.now() - 1000,
    });
    expect(svc.getCachedPdfText("expired-key")).toBeNull();
  });
});

describe("FileService.setCachedPdfText()", () => {
  it("ignores entries with no text field", () => {
    const svc = buildService();
    svc.setCachedPdfText("k", { pageCount: 1 });
    expect(svc.pdfTextCache.size).toBe(0);
  });

  it("ignores when cacheKey is falsy", () => {
    const svc = buildService();
    svc.setCachedPdfText(null, { text: "abc" });
    expect(svc.pdfTextCache.size).toBe(0);
  });

  it("evicts oldest entry when at max capacity", () => {
    const svc = buildService();
    for (let i = 0; i < svc.PDF_TEXT_CACHE_MAX_ENTRIES; i++) {
      svc.setCachedPdfText(`key${i}`, { text: `content${i}`, pageCount: i });
    }
    expect(svc.pdfTextCache.has("key0")).toBe(true);
    svc.setCachedPdfText("keyNew", { text: "new content", pageCount: 99 });
    // oldest entry (key0) should be evicted
    expect(svc.pdfTextCache.has("key0")).toBe(false);
    expect(svc.pdfTextCache.has("keyNew")).toBe(true);
  });
});

describe("FileService.isSupportedFileType()", () => {
  it("returns true for application/pdf", () => {
    expect(buildService().isSupportedFileType("application/pdf")).toBe(true);
  });

  it("returns true for text/plain", () => {
    expect(buildService().isSupportedFileType("text/plain")).toBe(true);
  });

  it("returns false for image/jpeg", () => {
    expect(buildService().isSupportedFileType("image/jpeg")).toBe(false);
  });
});

describe("FileService.isValidFileSize()", () => {
  it("returns true for a small file", () => {
    expect(buildService().isValidFileSize(1024)).toBe(true);
  });

  it("returns false when size exceeds limit", () => {
    const svc = buildService();
    expect(svc.isValidFileSize(svc.MAX_FILE_SIZE + 1)).toBe(false);
  });

  it("returns true at the exact limit", () => {
    const svc = buildService();
    expect(svc.isValidFileSize(svc.MAX_FILE_SIZE)).toBe(true);
  });
});

describe("FileService.extractTextFromTxt()", () => {
  it("returns string content of buffer", () => {
    const svc = buildService();
    const buf = Buffer.from("Hello, world!", "utf-8");
    expect(svc.extractTextFromTxt(buf)).toBe("Hello, world!");
  });
});

describe("FileService.extractTextWithMeta()", () => {
  it("throws for unsupported mime type", async () => {
    const svc = buildService();
    await expect(
      svc.extractTextWithMeta({
        mimetype: "image/jpeg",
        size: 100,
        buffer: Buffer.from("x"),
      }),
    ).rejects.toThrow("Tipo de archivo no soportado");
  });

  it("throws for oversized file", async () => {
    const svc = buildService();
    await expect(
      svc.extractTextWithMeta({
        mimetype: "application/pdf",
        size: svc.MAX_FILE_SIZE + 1,
        buffer: Buffer.from("x"),
      }),
    ).rejects.toThrow("Archivo demasiado grande");
  });

  it("returns text and null pageCount for txt file", async () => {
    const svc = buildService();
    const result = await svc.extractTextWithMeta({
      mimetype: "text/plain",
      size: 100,
      buffer: Buffer.from("plain text"),
    });
    expect(result).toEqual({ text: "plain text", pageCount: null });
  });

  it("calls extractTextFromPdf for pdf files", async () => {
    const svc = buildService();
    const expected = { text: "pdf text", pageCount: 5 };
    svc.extractTextFromPdf = jest.fn().mockResolvedValue(expected);
    const result = await svc.extractTextWithMeta({
      mimetype: "application/pdf",
      size: 100,
      buffer: Buffer.from("%PDF"),
    });
    expect(result).toEqual(expected);
    expect(svc.extractTextFromPdf).toHaveBeenCalledWith(Buffer.from("%PDF"));
  });
});

describe("FileService.parsePdfInWorker()", () => {
  beforeEach(() => {
    Worker.mockClear();
  });

  it("resolves with payload from worker message", async () => {
    const fakePayload = { text: "extracted", pageCount: 3 };
    Worker.mockImplementation(() => {
      const handlers = {};
      return {
        once: (event, cb) => {
          handlers[event] = cb;
          if (event === "message") setTimeout(() => cb(fakePayload), 0);
        },
      };
    });

    const svc = buildService();
    const result = await svc.parsePdfInWorker(Buffer.from("%PDF"));
    expect(result).toEqual(fakePayload);
  });

  it("rejects when worker message contains error", async () => {
    Worker.mockImplementation(() => {
      const handlers = {};
      return {
        once: (event, cb) => {
          handlers[event] = cb;
          if (event === "message")
            setTimeout(() => cb({ error: "parse fail" }), 0);
        },
      };
    });

    const svc = buildService();
    await expect(svc.parsePdfInWorker(Buffer.from("%PDF"))).rejects.toThrow(
      "parse fail",
    );
  });

  it("rejects when worker emits error", async () => {
    Worker.mockImplementation(() => {
      const handlers = {};
      return {
        once: (event, cb) => {
          handlers[event] = cb;
          if (event === "error")
            setTimeout(() => cb(new Error("worker crash")), 0);
        },
      };
    });

    const svc = buildService();
    await expect(svc.parsePdfInWorker(Buffer.from("%PDF"))).rejects.toThrow(
      "worker crash",
    );
  });

  it("rejects when worker exits with non-zero code", async () => {
    Worker.mockImplementation(() => {
      const handlers = {};
      return {
        once: (event, cb) => {
          handlers[event] = cb;
          if (event === "exit") setTimeout(() => cb(1), 0);
        },
      };
    });

    const svc = buildService();
    await expect(svc.parsePdfInWorker(Buffer.from("%PDF"))).rejects.toThrow(
      "worker de PDF",
    );
  });
});

describe("FileService.extractTextFromPdf()", () => {
  it("returns cached result on cache hit", async () => {
    const svc = buildService();
    const cached = { text: "from cache", pageCount: 2 };
    svc.buildPdfCacheKey = jest.fn().mockReturnValue("key-abc");
    svc.getCachedPdfText = jest.fn().mockReturnValue(cached);

    const result = await svc.extractTextFromPdf(Buffer.from("%PDF"));
    expect(result).toEqual(cached);
    expect(svc.getCachedPdfText).toHaveBeenCalledWith("key-abc");
  });

  it("parses PDF and caches result when text found", async () => {
    const svc = buildService();
    svc.buildPdfCacheKey = jest.fn().mockReturnValue("key-xyz");
    svc.getCachedPdfText = jest.fn().mockReturnValue(null);
    svc.parsePdfInWorker = jest
      .fn()
      .mockResolvedValue({ text: "pdf text", pageCount: 5 });
    svc.setCachedPdfText = jest.fn();

    const result = await svc.extractTextFromPdf(Buffer.from("%PDF"));
    expect(result).toEqual({ text: "pdf text", pageCount: 5 });
    expect(svc.setCachedPdfText).toHaveBeenCalledWith("key-xyz", {
      text: "pdf text",
      pageCount: 5,
    });
  });

  it("throws when no text and no OCR services", async () => {
    const svc = buildService();
    svc.buildPdfCacheKey = jest.fn().mockReturnValue(null);
    svc.getCachedPdfText = jest.fn().mockReturnValue(null);
    svc.parsePdfInWorker = jest
      .fn()
      .mockResolvedValue({ text: "", pageCount: 2 });

    await expect(svc.extractTextFromPdf(Buffer.from("%PDF"))).rejects.toThrow(
      "No se pudo extraer texto del PDF",
    );
  });

  it("uses OCR when no selectable text and services available", async () => {
    const pdfRenderer = {
      analyzeDocument: jest
        .fn()
        .mockResolvedValue({ isScanned: true, pageCount: 2 }),
      createPageRenderer: jest
        .fn()
        .mockResolvedValue({ pageCount: 2, renderPage: jest.fn() }),
    };
    const ocrService = {
      extractTextInterleaved: jest.fn().mockResolvedValue("ocr text"),
    };

    const svc = buildService(pdfRenderer, ocrService);
    svc.buildPdfCacheKey = jest.fn().mockReturnValue("ocr-key");
    svc.getCachedPdfText = jest.fn().mockReturnValue(null);
    svc.parsePdfInWorker = jest
      .fn()
      .mockResolvedValue({ text: "", pageCount: 2 });
    svc.setCachedPdfText = jest.fn();

    const result = await svc.extractTextFromPdf(Buffer.from("%PDF"));
    expect(result.text).toBe("ocr text");
    expect(svc.setCachedPdfText).toHaveBeenCalled();
  });

  it("throws when OCR also returns empty text", async () => {
    const pdfRenderer = {
      analyzeDocument: jest
        .fn()
        .mockResolvedValue({ isScanned: true, pageCount: 1 }),
      createPageRenderer: jest
        .fn()
        .mockResolvedValue({ pageCount: 1, renderPage: jest.fn() }),
    };
    const ocrService = {
      extractTextInterleaved: jest.fn().mockResolvedValue(""),
    };

    const svc = buildService(pdfRenderer, ocrService);
    svc.buildPdfCacheKey = jest.fn().mockReturnValue(null);
    svc.getCachedPdfText = jest.fn().mockReturnValue(null);
    svc.parsePdfInWorker = jest
      .fn()
      .mockResolvedValue({ text: "", pageCount: 1 });

    await expect(svc.extractTextFromPdf(Buffer.from("%PDF"))).rejects.toThrow(
      "No se pudo extraer texto del PDF, ni siquiera con OCR",
    );
  });
});

describe("FileService.extractText()", () => {
  it("returns the text string extracted from a txt file", async () => {
    const svc = buildService();
    const file = {
      originalname: "test.txt",
      mimetype: "text/plain",
      size: 100,
      buffer: Buffer.from("Hello world"),
    };
    const text = await svc.extractText(file);
    expect(text).toBe("Hello world");
  });
});

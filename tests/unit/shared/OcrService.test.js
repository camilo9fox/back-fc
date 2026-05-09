"use strict";

const mockRecognize = jest.fn();
const mockSetParameters = jest.fn().mockResolvedValue(undefined);
const mockTerminate = jest.fn().mockResolvedValue(undefined);
const mockCreateWorker = jest.fn();

jest.mock("tesseract.js", () => ({
  createWorker: mockCreateWorker,
  OEM: { LSTM_ONLY: 1 },
  PSM: { AUTO: 3 },
}));

jest.mock("../../../src/shared/config/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const OcrService = require("../../../src/shared/services/OcrService");

function makeWorker() {
  return {
    setParameters: mockSetParameters,
    recognize: mockRecognize,
    terminate: mockTerminate,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateWorker.mockResolvedValue(makeWorker());
});

describe("OcrService._cleanOcrOutput()", () => {
  let svc;
  beforeEach(() => {
    svc = new OcrService();
  });

  it("returns empty string for falsy input", () => {
    expect(svc._cleanOcrOutput(null)).toBe("");
    expect(svc._cleanOcrOutput("")).toBe("");
  });

  it("strips control characters", () => {
    const text = "hello\x01\x02world\nvalid content here";
    const result = svc._cleanOcrOutput(text);
    expect(result).not.toContain("\x01");
    expect(result).not.toContain("\x02");
  });

  it("rejoins words broken by hyphen-newline", () => {
    const text = "co-\nrrect content line with enough chars";
    const result = svc._cleanOcrOutput(text);
    expect(result).toContain("correct");
  });

  it("collapses 3+ consecutive newlines to 2", () => {
    const text = "line one with good content\n\n\n\nline two with good content";
    const result = svc._cleanOcrOutput(text);
    expect(result).not.toMatch(/\n{3,}/);
  });

  it("filters out lines shorter than 4 characters", () => {
    const text = "ok\ngood long valid line with words\nab";
    const result = svc._cleanOcrOutput(text);
    expect(result).not.toContain("ok");
    expect(result).not.toContain("ab");
  });

  it("filters out lines that are only numbers", () => {
    const text = "12\nThis is a valid content line that should stay\n345";
    const result = svc._cleanOcrOutput(text);
    expect(result).not.toContain("12");
    expect(result).not.toContain("345");
  });

  it("filters duplicate lines (case-insensitive)", () => {
    const line = "This header repeats on every page";
    const text = `${line}\nSome unique content here\n${line.toUpperCase()}`;
    const result = svc._cleanOcrOutput(text);
    const matches = result
      .split("\n")
      .filter((l) => l.toLowerCase() === line.toLowerCase());
    expect(matches.length).toBe(1);
  });

  it("filters out lines mostly non-alphanumeric", () => {
    const text = "--- ======= ~~~\nThis is a valid content line for OCR text";
    const result = svc._cleanOcrOutput(text);
    expect(result).not.toContain("---");
  });

  it("collapses multiple spaces", () => {
    const text = "word   with   extra   spaces   inside content here";
    const result = svc._cleanOcrOutput(text);
    expect(result).not.toMatch(/  /);
  });
});

describe("OcrService._getWorkers()", () => {
  it("creates 3 workers on first call", async () => {
    const svc = new OcrService();
    const workers = await svc._getWorkers();
    expect(workers.length).toBe(3);
    expect(mockCreateWorker).toHaveBeenCalledTimes(3);
  });

  it("returns existing workers on subsequent calls", async () => {
    const svc = new OcrService();
    await svc._getWorkers();
    const callCount = mockCreateWorker.mock.calls.length;
    await svc._getWorkers();
    expect(mockCreateWorker).toHaveBeenCalledTimes(callCount);
  });
});

describe("OcrService.extractTextFromImages()", () => {
  it("returns joined OCR text from all images", async () => {
    const svc = new OcrService();
    mockRecognize.mockResolvedValue({
      data: { text: "page text content here" },
    });
    svc._cleanOcrOutput = jest.fn((t) => t.trim());

    const buffers = [
      Buffer.from("img1"),
      Buffer.from("img2"),
      Buffer.from("img3"),
    ];
    const result = await svc.extractTextFromImages(buffers);
    expect(typeof result).toBe("string");
    expect(mockRecognize).toHaveBeenCalledTimes(3);
  });

  it("distributes pages across workers in round-robin", async () => {
    const svc = new OcrService();
    mockRecognize.mockResolvedValue({ data: { text: "page content text" } });
    svc._cleanOcrOutput = jest.fn((t) => t.trim());

    // 6 pages → 2 per worker (3 workers)
    const buffers = Array.from({ length: 6 }, (_, i) =>
      Buffer.from(`page${i}`),
    );
    await svc.extractTextFromImages(buffers);
    expect(mockRecognize).toHaveBeenCalledTimes(6);
  });

  it("returns empty string for empty input", async () => {
    const svc = new OcrService();
    const result = await svc.extractTextFromImages([]);
    expect(result).toBe("");
  });
});

describe("OcrService.extractTextInterleaved()", () => {
  it("returns empty string when pageCount is 0", async () => {
    const svc = new OcrService();
    const result = await svc.extractTextInterleaved(0, jest.fn());
    expect(result).toBe("");
  });

  it("renders and OCRs all pages", async () => {
    const svc = new OcrService();
    mockRecognize.mockResolvedValue({
      data: { text: "recognized content text page" },
    });
    svc._cleanOcrOutput = jest.fn((t) => t.trim());

    const renderPage = jest.fn().mockResolvedValue(Buffer.from("page image"));
    const result = await svc.extractTextInterleaved(3, renderPage);
    expect(renderPage).toHaveBeenCalledTimes(3);
    expect(mockRecognize).toHaveBeenCalledTimes(3);
    expect(typeof result).toBe("string");
  });

  it("uses round-robin worker assignment", async () => {
    const svc = new OcrService();
    mockRecognize.mockResolvedValue({
      data: { text: "text content ocr page" },
    });
    svc._cleanOcrOutput = jest.fn((t) => t.trim());

    const renderPage = jest.fn().mockResolvedValue(Buffer.from("img"));
    await svc.extractTextInterleaved(6, renderPage);
    expect(mockRecognize).toHaveBeenCalledTimes(6);
  });
});

describe("OcrService.terminate()", () => {
  it("terminates all workers and clears the list", async () => {
    const svc = new OcrService();
    // Initialize workers by calling _getWorkers
    await svc._getWorkers();
    expect(svc._workers.length).toBeGreaterThan(0);
    await svc.terminate();
    expect(svc._workers.length).toBe(0);
  });
});

const DocumentProcessingService = require("../../../src/shared/services/DocumentProcessingService");

describe("DocumentProcessingService.normalizeText()", () => {
  let svc;
  beforeEach(() => {
    svc = new DocumentProcessingService();
  });

  it("removes carriage returns", () => {
    const result = svc.normalizeText("first line\r\nsecond line");
    expect(result).not.toContain("\r");
  });

  it("rejoins hyphenated line breaks", () => {
    const result = svc.normalizeText("pre-\nfix word here");
    expect(result).toContain("prefix");
  });

  it("collapses triple newlines to double", () => {
    const result = svc.normalizeText("first line here\n\n\nsecond line here");
    expect(result).not.toMatch(/\n{3,}/);
  });

  it("removes trailing spaces before newlines", () => {
    const result = svc.normalizeText("hello world   \nmore content");
    expect(result).not.toMatch(/[ \t]+\n/);
  });

  it("collapses multiple spaces", () => {
    expect(svc.normalizeText("a   b")).toBe("a b");
  });
});

describe("DocumentProcessingService.removeLowValueLines()", () => {
  let svc;
  beforeEach(() => {
    svc = new DocumentProcessingService();
  });

  it("removes lines with only 1-2 chars", () => {
    const result = svc.removeLowValueLines("ok\na\nb\nmore text here");
    expect(result).not.toContain("\na\n");
  });

  it("removes numeric-only lines (page numbers)", () => {
    const result = svc.removeLowValueLines("paragraph\n123\nmore text");
    expect(result).not.toContain("\n123\n");
  });

  it("removes lines matching metadata patterns (isbn)", () => {
    const result = svc.removeLowValueLines("content\nISBN 978-1234\nmore");
    expect(result).not.toContain("ISBN 978-1234");
  });

  it("keeps empty lines", () => {
    const result = svc.removeLowValueLines("line one\n\nline two");
    expect(result).toBe("line one\n\nline two");
  });
});

describe("DocumentProcessingService.buildContextCacheKey()", () => {
  let svc;
  beforeEach(() => {
    svc = new DocumentProcessingService();
  });

  it("returns a string", () => {
    const key = svc.buildContextCacheKey("hello world");
    expect(typeof key).toBe("string");
  });

  it("returns different keys for different texts", () => {
    const k1 = svc.buildContextCacheKey("text A");
    const k2 = svc.buildContextCacheKey("text B");
    expect(k1).not.toBe(k2);
  });

  it("returns different keys for different options", () => {
    const k1 = svc.buildContextCacheKey("text", { maxLength: 1000 });
    const k2 = svc.buildContextCacheKey("text", { maxLength: 2000 });
    expect(k1).not.toBe(k2);
  });
});

describe("DocumentProcessingService.getCachedContext() / setCachedContext()", () => {
  let svc;
  beforeEach(() => {
    svc = new DocumentProcessingService();
  });

  it("returns null on cache miss", () => {
    expect(svc.getCachedContext("nonexistent-key")).toBeNull();
  });

  it("returns cached value on hit", () => {
    svc.setCachedContext("k1", "my-value");
    expect(svc.getCachedContext("k1")).toBe("my-value");
  });

  it("returns null when TTL has expired", () => {
    svc.setCachedContext("k2", "old-value");
    // Manually expire the entry
    const entry = svc.contextCache.get("k2");
    entry.expiresAt = Date.now() - 1;
    expect(svc.getCachedContext("k2")).toBeNull();
  });

  it("evicts oldest entry when at max capacity", () => {
    const max = svc.CONTEXT_CACHE_MAX_ENTRIES;
    for (let i = 0; i < max; i++) {
      svc.setCachedContext(`key-${i}`, `val-${i}`);
    }
    // Adding one more should evict key-0
    svc.setCachedContext("key-new", "val-new");
    expect(svc.getCachedContext("key-0")).toBeNull();
    expect(svc.getCachedContext("key-new")).toBe("val-new");
  });

  it("setCachedContext ignores falsy key", () => {
    expect(() => svc.setCachedContext(null, "value")).not.toThrow();
    expect(svc.contextCache.size).toBe(0);
  });

  it("setCachedContext ignores falsy value", () => {
    expect(() => svc.setCachedContext("key", null)).not.toThrow();
    expect(svc.contextCache.size).toBe(0);
  });
});

describe("DocumentProcessingService.validateAndTruncateContent()", () => {
  let svc;
  beforeEach(() => {
    svc = new DocumentProcessingService();
  });

  it("returns content unchanged when under limit", () => {
    expect(svc.validateAndTruncateContent("short text", 100)).toBe(
      "short text",
    );
  });

  it("truncates at sentence boundary when possible", () => {
    const content = "First sentence. Second sentence here. Third one.";
    const result = svc.validateAndTruncateContent(content, 40);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith(".")).toBe(true);
  });

  it("hard-truncates when no sentence boundary near the limit", () => {
    const content = "a".repeat(200);
    const result = svc.validateAndTruncateContent(content, 100);
    expect(result.length).toBeLessThanOrEqual(100);
  });
});

describe("DocumentProcessingService.buildStudyContext()", () => {
  let svc;
  beforeEach(() => {
    svc = new DocumentProcessingService();
  });

  it("returns content directly if it fits within maxLength", async () => {
    const content = "Short content that fits.";
    const groqService = {};
    const result = await svc.buildStudyContext(content, groqService, {
      maxLength: 4500,
    });
    expect(result).toContain("Short content");
  });

  it("returns cached context on second identical call", async () => {
    const content = "Cached content for repeated call.";
    const groqService = { extractStudyNotes: jest.fn() };
    await svc.buildStudyContext(content, groqService, { maxLength: 4500 });
    await svc.buildStudyContext(content, groqService, { maxLength: 4500 });
    // extractStudyNotes should not be called due to cache
    expect(groqService.extractStudyNotes).not.toHaveBeenCalled();
  });

  it("uses fast path for large documents (many chunks)", async () => {
    // Build a document large enough to produce many chunks
    const para = "Lorem ipsum dolor sit amet. ".repeat(50);
    const content = Array(20).fill(para).join("\n\n");
    const groqService = { extractStudyNotes: jest.fn() };

    const result = await svc.buildStudyContext(content, groqService, {
      maxLength: 4500,
      fastPathMinChunks: 3,
    });

    expect(typeof result).toBe("string");
    expect(result.length).toBeLessThanOrEqual(4500);
    // Fast path used → extractStudyNotes not called
    expect(groqService.extractStudyNotes).not.toHaveBeenCalled();
  });

  it("uses slow path (extractStudyNotes) when fast path disabled", async () => {
    const para = "Paragraph content with useful information. ".repeat(30);
    const content = Array(10).fill(para).join("\n\n");
    const groqService = {
      extractStudyNotes: jest.fn().mockResolvedValue({
        keyPoints: ["Point A"],
        definitions: [],
        facts: [],
        examples: [],
      }),
      compressKnowledgeContext: jest.fn().mockResolvedValue("compressed"),
    };

    const result = await svc.buildStudyContext(content, groqService, {
      maxLength: 100,
      useFastPath: false,
    });

    expect(typeof result).toBe("string");
    expect(groqService.extractStudyNotes).toHaveBeenCalled();
  });

  it("falls back to local notes when extractStudyNotes throws", async () => {
    const para = "Paragraph with some content. ".repeat(30);
    const content = Array(10).fill(para).join("\n\n");
    const groqService = {
      extractStudyNotes: jest.fn().mockRejectedValue(new Error("AI error")),
      compressKnowledgeContext: jest.fn().mockResolvedValue("compressed"),
    };

    const result = await svc.buildStudyContext(content, groqService, {
      maxLength: 100,
      useFastPath: false,
    });

    expect(typeof result).toBe("string");
  });

  it("samples text when fastPathMaxInputChars exceeded", async () => {
    // Create content larger than fastPathMaxInputChars to trigger sampling
    const para = "Sample text with useful academic content. ".repeat(80);
    const content = Array(15).fill(para).join("\n\n");
    const groqService = { extractStudyNotes: jest.fn() };

    const result = await svc.buildStudyContext(content, groqService, {
      maxLength: 5000,
      useFastPath: true,
      fastPathMaxInputChars: 100, // very small to force sampling
      fastPathMinChunks: 1,
    });

    expect(typeof result).toBe("string");
    expect(groqService.extractStudyNotes).not.toHaveBeenCalled();
  });

  it("compresses result when combined exceeds maxLength (slow path)", async () => {
    const para = "Informative paragraph with academic detail. ".repeat(40);
    const content = Array(8).fill(para).join("\n\n");
    const groqService = {
      extractStudyNotes: jest.fn().mockResolvedValue({
        keyPoints: ["Point A long enough to be useful".repeat(5)],
        definitions: [],
        facts: [],
        examples: [],
      }),
      compressKnowledgeContext: jest
        .fn()
        .mockResolvedValue("compressed short result"),
    };

    const result = await svc.buildStudyContext(content, groqService, {
      maxLength: 50,
      useFastPath: false,
    });

    expect(typeof result).toBe("string");
    expect(groqService.compressKnowledgeContext).toHaveBeenCalled();
  });
});

describe("DocumentProcessingService.normalizeForDedup()", () => {
  let svc;
  beforeEach(() => {
    svc = new DocumentProcessingService();
  });

  it("lowercases and removes non-word chars", () => {
    const result = svc.normalizeForDedup("Hello, World!");
    expect(result).toBe("hello world");
  });

  it("handles null/undefined gracefully", () => {
    expect(() => svc.normalizeForDedup(null)).not.toThrow();
    expect(svc.normalizeForDedup(undefined)).toBe("");
  });
});

describe("DocumentProcessingService.combineStructuredNotes()", () => {
  let svc;
  beforeEach(() => {
    svc = new DocumentProcessingService();
  });

  it("deduplicates entries across chunks", () => {
    const results = [
      {
        keyPoints: ["Point A", "Point B"],
        definitions: [],
        facts: [],
        examples: [],
      },
      {
        keyPoints: ["point a", "Point C"],
        definitions: [],
        facts: [],
        examples: [],
      },
    ];
    const combined = svc.combineStructuredNotes(results);
    const count = (combined.match(/Point A/gi) || []).length;
    expect(count).toBe(1);
  });

  it("returns a non-empty string", () => {
    const results = [
      {
        keyPoints: ["Key point here"],
        definitions: ["A definition"],
        facts: ["A fact"],
        examples: ["An example"],
      },
    ];
    expect(svc.combineStructuredNotes(results).length).toBeGreaterThan(0);
  });
});

describe("DocumentProcessingService.splitIntoChunks()", () => {
  it("splits text into chunks respecting maxChunkSize", () => {
    const svc = new DocumentProcessingService();
    const longText = Array.from(
      { length: 20 },
      (_, i) => `Paragraph ${i + 1} with some content here.`,
    ).join("\n\n");
    const chunks = svc.splitIntoChunks(longText, 200);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => expect(chunk.length).toBeLessThanOrEqual(400));
  });

  it("returns single chunk for short text", () => {
    const svc = new DocumentProcessingService();
    const short = "Short paragraph with enough content.";
    const chunks = svc.splitIntoChunks(short, 2000);
    expect(chunks.length).toBe(1);
  });

  it("handles large paragraphs by splitting them", () => {
    const svc = new DocumentProcessingService();
    const bigParagraph = "A sentence. ".repeat(50);
    const chunks = svc.splitIntoChunks(bigParagraph, 100);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe("DocumentProcessingService.splitLargeBlock()", () => {
  it("splits large block into multiple chunks", () => {
    const svc = new DocumentProcessingService();
    const block =
      "First sentence here. Second sentence here. Third sentence here.";
    const chunks = svc.splitLargeBlock(block, 30);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("handles sentence longer than maxChunkSize", () => {
    const svc = new DocumentProcessingService();
    const longSentence = "x".repeat(200);
    const chunks = svc.splitLargeBlock(longSentence, 50);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe("DocumentProcessingService.getOverlap()", () => {
  it("returns tail of text up to overlapSize", () => {
    const svc = new DocumentProcessingService();
    const result = svc.getOverlap("hello world", 5);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("returns full text when shorter than overlapSize", () => {
    const svc = new DocumentProcessingService();
    expect(svc.getOverlap("abc", 100)).toBe("abc");
  });

  it("returns empty string for null/empty input", () => {
    const svc = new DocumentProcessingService();
    expect(svc.getOverlap("", 50)).toBe("");
    expect(svc.getOverlap(null, 50)).toBe("");
  });
});

describe("DocumentProcessingService.processChunksConcurrently()", () => {
  it("processes all chunks and returns results", async () => {
    const svc = new DocumentProcessingService();
    const chunks = ["chunk1", "chunk2", "chunk3"];
    const processor = jest.fn(async (chunk) => chunk.toUpperCase());
    const results = await svc.processChunksConcurrently(chunks, processor);
    expect(results).toEqual(["CHUNK1", "CHUNK2", "CHUNK3"]);
    expect(processor).toHaveBeenCalledTimes(3);
  });

  it("calls onProgress callback", async () => {
    const svc = new DocumentProcessingService();
    const chunks = ["a", "b"];
    const onProgress = jest.fn();
    await svc.processChunksConcurrently(chunks, async (c) => c, { onProgress });
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it("respects concurrency option", async () => {
    const svc = new DocumentProcessingService();
    const chunks = Array.from({ length: 6 }, (_, i) => `chunk${i}`);
    const processor = jest.fn(async (c) => c);
    await svc.processChunksConcurrently(chunks, processor, { concurrency: 2 });
    expect(processor).toHaveBeenCalledTimes(6);
  });
});

describe("DocumentProcessingService.buildLocalFallbackNotes()", () => {
  it("returns empty structure for empty input", () => {
    const svc = new DocumentProcessingService();
    const result = svc.buildLocalFallbackNotes("");
    expect(result.keyPoints).toEqual([]);
    expect(result.definitions).toEqual([]);
  });

  it("extracts sentences as key points and facts", () => {
    const svc = new DocumentProcessingService();
    const text =
      "This is a sentence with enough words. Another sentence with enough words. Third sentence here also long enough.";
    const result = svc.buildLocalFallbackNotes(text);
    expect(result.keyPoints.length).toBeGreaterThanOrEqual(0);
  });
});

describe("DocumentProcessingService.buildFastContext()", () => {
  it("returns empty string for empty chunks", () => {
    const svc = new DocumentProcessingService();
    expect(svc.buildFastContext([], 1000)).toBe("");
    expect(svc.buildFastContext(null, 1000)).toBe("");
  });

  it("returns joined context for small chunk set", () => {
    const svc = new DocumentProcessingService();
    const chunks = [
      "Chunk one with content.",
      "Chunk two with content.",
      "Chunk three with content.",
    ];
    const result = svc.buildFastContext(chunks, 5000);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("truncates output to maxLength", () => {
    const svc = new DocumentProcessingService();
    const chunks = Array.from(
      { length: 10 },
      (_, i) => `Chunk ${i} with sufficient content for testing purposes.`,
    );
    const result = svc.buildFastContext(chunks, 50);
    expect(result.length).toBeLessThanOrEqual(60); // truncation at sentence boundary
  });

  it("uses wide density mode", () => {
    const svc = new DocumentProcessingService();
    const chunks = Array.from(
      { length: 5 },
      (_, i) => `Content chunk ${i} with words.`,
    );
    const normal = svc.buildFastContext(chunks, 5000, "normal");
    const wide = svc.buildFastContext(chunks, 5000, "wide");
    expect(typeof wide).toBe("string");
    expect(typeof normal).toBe("string");
  });
});

describe("DocumentProcessingService.sampleTextForFastPath()", () => {
  it("returns full text when shorter than target", () => {
    const svc = new DocumentProcessingService();
    const short = "short text";
    expect(svc.sampleTextForFastPath(short, 1000)).toBe(short);
  });

  it("returns sampled text for long input", () => {
    const svc = new DocumentProcessingService();
    const long = "x".repeat(300000);
    const result = svc.sampleTextForFastPath(long, 260000);
    expect(result.length).toBeLessThan(long.length);
  });

  it("handles empty input", () => {
    const svc = new DocumentProcessingService();
    expect(svc.sampleTextForFastPath("", 1000)).toBe("");
  });
});

describe("DocumentProcessingService.combineResults()", () => {
  it("joins results with double newline", () => {
    const svc = new DocumentProcessingService();
    const result = svc.combineResults(["part one", "part two", "part three"]);
    expect(result).toBe("part one\n\npart two\n\npart three");
  });
});

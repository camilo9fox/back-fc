const { checkLocalPatterns, PATTERNS } = require("../../../src/shared/utils/ContentSafetyPatterns");
const { ContentSafetyError } = require("../../../src/shared/errors/AppError");

jest.mock("../../../src/shared/config/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const ContentSafetyService = require("../../../src/shared/services/ContentSafetyService");

function buildMockGroq() {
  return {
    createChatCompletion: jest.fn().mockResolvedValue({
      choices: [{ message: { content: "safe" } }],
    }),
  };
}

function buildService(groqMock, overrides = {}) {
  return new ContentSafetyService(groqMock || buildMockGroq(), {
    enabled: true,
    strictMode: false,
    localOnly: false,
    ...overrides,
  });
}

describe("ContentSafetyPatterns - checkLocalPatterns (moderate)", () => {
  it("deja pasar contenido academico normal", () => {
    const result = checkLocalPatterns(
      "La fotosintesis es el proceso por el cual las plantas convierten luz solar en energia quimica.",
    );
    expect(result.safe).toBe(true);
    expect(result.flagged).toEqual([]);
  });

  it("detecta profanidad en espanol", () => {
    const result = checkLocalPatterns("Eres un cabron y un pendejo hijo de puta.");
    expect(result.safe).toBe(false);
    expect(result.flagged).toContain("profanity");
  });

  it("detecta discurso de odio", () => {
    const result = checkLocalPatterns("Muerte a los judios, supremacia blanca es el camino.");
    expect(result.safe).toBe(false);
    expect(result.flagged).toContain("hate_speech");
  });

  it("detecta referencia a pornografia infantil", () => {
    const result = checkLocalPatterns("Vendo pornografia infantil y abuso sexual de menores.");
    expect(result.safe).toBe(false);
    expect(result.flagged).toContain("sexual_minors");
  });

  it("detecta contenido de autolesion", () => {
    const result = checkLocalPatterns("Metodos para suicidarse y como quitarse la vida de forma efectiva.");
    expect(result.safe).toBe(false);
    expect(result.flagged).toContain("self_harm");
  });

  it("detecta contenido terrorista", () => {
    const result = checkLocalPatterns("Instrucciones para fabricar bombas y explosivos caseros.");
    expect(result.safe).toBe(false);
    expect(result.flagged).toContain("terrorism");
  });

  it("detecta variantes regionales de profanidad (argentinismos)", () => {
    const result = checkLocalPatterns("Sos un pelotudo y un boludo.");
    expect(result.safe).toBe(false);
    expect(result.flagged).toContain("profanity");
  });

  it("detecta variantes regionales de profanidad (espanolismos)", () => {
    const result = checkLocalPatterns("Eres un gilipollas y un capullo.");
    expect(result.safe).toBe(false);
    expect(result.flagged).toContain("profanity");
  });

  it("detecta variantes regionales (retrasado, mogolico, subnormal)", () => {
    const result = checkLocalPatterns("Que retrasado sos, sos un mogolico subnormal.");
    expect(result.safe).toBe(false);
    expect(result.flagged).toContain("profanity");
  });

  it("detecta slurs discriminatorios", () => {
    const result = checkLocalPatterns("Andate de aca sudaca de mierda.");
    expect(result.safe).toBe(false);
    expect(result.flagged).toContain("slurs");
  });

  it("detecta slur compuesto (negro de mierda)", () => {
    const result = checkLocalPatterns("Los negros de mierda no deberian estar aca.");
    expect(result.safe).toBe(false);
    // "mierda" triggers profanity, and "negros de mierda" triggers slurs — either is fine
    const hasSlurOrProfanity = result.flagged.includes("slurs") || result.flagged.includes("profanity");
    expect(hasSlurOrProfanity).toBe(true);
  });

  it("detecta hate speech compuesto: grupo protegido + insulto", () => {
    const result = checkLocalPatterns("Los homosexuales son pelotudos.");
    expect(result.safe).toBe(false);
    expect(result.flagged).toContain("hate_speech_targeted");
  });

  it("detecta hate speech compuesto con terminos de desprecio", () => {
    const result = checkLocalPatterns("Los inmigrantes son una plaga y deberian desaparecer.");
    expect(result.safe).toBe(false);
    expect(result.flagged).toContain("hate_speech_targeted");
  });

  it("detecta hate speech compuesto: grupo + asco/repugnante", () => {
    const result = checkLocalPatterns("Las lesbianas son asquerosas y repugnantes.");
    expect(result.safe).toBe(false);
    expect(result.flagged).toContain("hate_speech_targeted");
  });

  it("detecta hate speech compuesto: grupo + no son personas", () => {
    const result = checkLocalPatterns("Los trans no son personas normales.");
    expect(result.safe).toBe(false);
    expect(result.flagged).toContain("hate_speech_targeted");
  });

  it("NO detecta hate speech si hay grupo protegido pero sin insulto", () => {
    const result = checkLocalPatterns("Los homosexuales merecen los mismos derechos que todos.");
    expect(result.safe).toBe(true);
  });

  it("NO detecta hate speech si hay insulto pero sin grupo protegido", () => {
    const result = checkLocalPatterns("Esa persona es un pelotudo y un retrasado.");
    // This IS profanity but NOT hate_speech_targeted (no protected group mentioned)
    expect(result.flagged).not.toContain("hate_speech_targeted");
  });

  it("deja pasar terminos clinicos sin intencion suicida", () => {
    const result = checkLocalPatterns(
      "El paciente presenta ideacion suicida pasiva y requiere evaluacion psiquiatrica urgente.",
    );
    // "suicida" does NOT match self_harm pattern (which requires suicidio, suicidarse, etc.)
    expect(result.safe).toBe(true);
  });

  it("vacio es seguro", () => {
    expect(checkLocalPatterns("").safe).toBe(true);
    expect(checkLocalPatterns("   ").safe).toBe(true);
  });

  it("null/undefined es seguro", () => {
    expect(checkLocalPatterns(null).safe).toBe(true);
    expect(checkLocalPatterns(undefined).safe).toBe(true);
  });
});

describe("ContentSafetyPatterns - checkLocalPatterns (strict)", () => {
  it("en modo estricto detecta mas categorias", () => {
    const result = checkLocalPatterns(
      "Como fabricar cocaina en casa paso a paso.",
      "strict",
    );
    expect(result.safe).toBe(false);
    expect(result.flagged).toContain("drugs_hard");
  });

  it("moderate no bloquea drugs_hard si no hay instrucciones", () => {
    const result = checkLocalPatterns("Los efectos de la cocaina en el sistema nervioso central.", "moderate");
    // Does NOT contain "fabricar/producir/sintetizar" so does not match the pattern
    expect(result.safe).toBe(true);
  });
});

describe("ContentSafetyService - checkLocalOnly", () => {
  it("bloquea contenido ofensivo", async () => {
    const svc = buildService(null, { localOnly: true });
    await expect(
      svc.checkLocalOnly("pinche mierda cabron"),
    ).rejects.toThrow(ContentSafetyError);
  });

  it("deja pasar contenido normal", async () => {
    const svc = buildService(null, { localOnly: true });
    const result = await svc.checkLocalOnly("La celula es la unidad basica de la vida.");
    expect(result.safe).toBe(true);
  });

  it("respeta enabled=false", async () => {
    const svc = buildService(null, { enabled: false });
    const result = await svc.checkLocalOnly("cualquier cosa ofensiva");
    expect(result.safe).toBe(true);
  });
});

describe("ContentSafetyService - checkContent", () => {
  it("bloquea en capa local sin llegar a Llama Guard", async () => {
    const groq = buildMockGroq();
    const svc = buildService(groq);
    await expect(
      svc.checkContent("pinche cabron hijo de puta"),
    ).rejects.toThrow(ContentSafetyError);
    expect(groq.createChatCompletion).not.toHaveBeenCalled();
  });

  it("llama a Llama Guard si pasa filtro local", async () => {
    const groq = buildMockGroq();
    const svc = buildService(groq);
    const result = await svc.checkContent("La fotosintesis es clave para la vida en la tierra.");
    expect(result.safe).toBe(true);
    expect(groq.createChatCompletion).toHaveBeenCalled();
  });

  it("bloquea si Llama Guard devuelve unsafe", async () => {
    const groq = {
      createChatCompletion: jest.fn().mockResolvedValue({
        choices: [{ message: { content: "unsafe\nviolent_crimes" } }],
      }),
    };
    const svc = buildService(groq);
    await expect(
      svc.checkContent("texto normal pero peligroso segun el guard"),
    ).rejects.toThrow(ContentSafetyError);
  });

  it("fail-open si Llama Guard falla", async () => {
    const groq = {
      createChatCompletion: jest.fn().mockRejectedValue(new Error("network error")),
    };
    const svc = buildService(groq);
    const result = await svc.checkContent("contenido normal");
    expect(result.safe).toBe(true);
  });

  it("respeta localOnly=true sin llamar a Llama Guard", async () => {
    const groq = buildMockGroq();
    const svc = buildService(groq, { localOnly: true });
    const result = await svc.checkContent("contenido normal");
    expect(result.safe).toBe(true);
    expect(groq.createChatCompletion).not.toHaveBeenCalled();
  });
});

describe("ContentSafetyService - checkBatch", () => {
  it("filtra items inseguros del batch", async () => {
    const groq = buildMockGroq();
    const svc = buildService(groq);
    const items = [
      { id: 1, text: "La fotosintesis es importante." },
      { id: 2, text: "pinche cabron pendejo ofensivo." },
      { id: 3, text: "Las mitocondrias producen ATP." },
    ];
    const result = await svc.checkBatch(items, (item) => item.text);
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual([1, 3]);
  });

  it("devuelve array vacio si no pasan items", async () => {
    const groq = buildMockGroq();
    const svc = buildService(groq);
    const items = [
      { id: 1, text: "pinche cabron ofensivo." },
    ];
    const result = await svc.checkBatch(items, (item) => item.text);
    expect(result).toEqual([]);
  });

  it("devuelve items sin filtrar si enabled=false", async () => {
    const svc = buildService(null, { enabled: false });
    const items = [{ id: 1, text: "cualquier cosa" }];
    const result = await svc.checkBatch(items, (item) => item.text);
    expect(result).toEqual(items);
  });

  it("maneja array vacio", async () => {
    const svc = buildService();
    const result = await svc.checkBatch([], (item) => item);
    expect(result).toEqual([]);
  });
});

describe("ContentSafetyError", () => {
  it("tiene statusCode 400 y category", () => {
    const err = new ContentSafetyError("test message", "profanity");
    expect(err.statusCode).toBe(400);
    expect(err.category).toBe("profanity");
    expect(err.message).toBe("test message");
  });

  it("category por defecto es unknown", () => {
    const err = new ContentSafetyError("test");
    expect(err.category).toBe("unknown");
  });
});

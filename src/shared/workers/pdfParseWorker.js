const { parentPort, workerData } = require("worker_threads");
const pdfParse = require("pdf-parse");

async function run() {
  const buffer = Buffer.from(workerData.buffer);
  const data = await pdfParse(buffer);
  const text = typeof data.text === "string" ? data.text.trim() : "";

  parentPort.postMessage({
    text,
    pageCount: data.numpages || null,
  });
}

run().catch((error) => {
  parentPort.postMessage({
    error: error?.message || "No se pudo procesar el PDF.",
  });
});

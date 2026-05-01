const { parentPort, workerData } = require('worker_threads');

async function extractWithMuPdf(buffer) {
  const { default: mupdf } = await import('mupdf');
  const doc = mupdf.Document.openDocument(buffer, 'application/pdf');
  const numPages = doc.countPages();
  const pageTexts = [];
  for (let i = 0; i < numPages; i++) {
    const page = doc.loadPage(i);
    const st = page.toStructuredText('preserve-whitespace');
    const pageText = st.asText().replace(/\s+/g, ' ').trim();
    if (pageText) pageTexts.push(pageText);
    st.destroy();
    page.destroy();
  }
  doc.destroy();
  return { text: pageTexts.join('\n\n').trim(), pageCount: numPages };
}

async function extractWithPdfParse(buffer) {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return { text: typeof data.text === 'string' ? data.text.trim() : '', pageCount: data.numpages || null };
}

async function run() {
  const buffer = Buffer.from(workerData.buffer);
  let result;
  try {
    result = await extractWithMuPdf(buffer);
  } catch (primaryError) {
    console.warn('pdfParseWorker: mupdf failed, falling back to pdf-parse. Error: ' + primaryError.message);
    try {
      result = await extractWithPdfParse(buffer);
    } catch (fallbackError) {
      throw new Error('Both extractors failed. mupdf: ' + primaryError.message + ' | pdf-parse: ' + fallbackError.message);
    }
  }
  parentPort.postMessage(result);
}

run().catch((error) => {
  parentPort.postMessage({ error: error && error.message ? error.message : 'No se pudo procesar el PDF.' });
});

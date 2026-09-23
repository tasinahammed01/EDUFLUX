import vision from "@google-cloud/vision";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { env } from "../../config/env.js";
import { getObjectStorage } from "../../storage/object-storage.js";
import type { SubmissionFileRecord } from "./submission-file.model.js";

export interface OcrBox { x: number; y: number; width: number; height: number; raw: { x1: number; y1: number; x2: number; y2: number } }
export interface OcrWord { id: string; text: string; startOffset: number; endOffset: number; confidence?: number; boundingBox: OcrBox }
export interface OcrPage { sourceFileId: string; pageNumber: number; width: number; height: number; words: OcrWord[] }
export interface OcrResult { text: string; provider: string; model: string; processedFiles: number; pages: OcrPage[]; completedAt: Date }
export interface OcrProvider { extract(files: SubmissionFileRecord[]): Promise<OcrResult> }

export class OcrProviderError extends Error {
  constructor(message: string, public readonly code: "OCR_PROVIDER_AUTH_FAILED" | "OCR_PROVIDER_UNSUPPORTED" | "OCR_PROVIDER_REQUEST_FAILED" | "OCR_EMPTY_RESULT", public readonly httpStatus?: number) { super(message); this.name = "OcrProviderError"; }
}

let override: OcrProvider | undefined;
export function setOcrProviderForTests(provider?: OcrProvider) { override = provider; }

type VisionPage = NonNullable<NonNullable<Awaited<ReturnType<InstanceType<typeof vision.ImageAnnotatorClient>["documentTextDetection"]>>[0]["fullTextAnnotation"]>["pages"]>[number];

export function canonicalizeVisionPages(input: Array<{ sourceFileId: string; pageNumber: number; page: VisionPage }>): { text: string; pages: OcrPage[] } {
  let text = "";
  const pages: OcrPage[] = [];
  input.forEach(({ sourceFileId, pageNumber, page }, pageIndex) => {
    if (pageIndex > 0 && text && !text.endsWith("\n")) text += "\n";
    const width = page.width ?? 1, height = page.height ?? 1;
    const words: OcrWord[] = [];
    for (const block of page.blocks ?? []) for (const paragraph of block.paragraphs ?? []) for (const providerWord of paragraph.words ?? []) {
      const value = (providerWord.symbols ?? []).map((symbol) => symbol.text ?? "").join("");
      if (!value) continue;
      const startOffset = text.length;
      text += value;
      const vertices = providerWord.boundingBox?.vertices ?? [];
      const xs = vertices.map((vertex) => vertex.x ?? 0), ys = vertices.map((vertex) => vertex.y ?? 0);
      const x1 = xs.length ? Math.min(...xs) : 0, y1 = ys.length ? Math.min(...ys) : 0, x2 = xs.length ? Math.max(...xs) : 0, y2 = ys.length ? Math.max(...ys) : 0;
      words.push({ id: `f${pageIndex + 1}_p${pageNumber}_w${String(words.length + 1).padStart(4, "0")}`, text: value, startOffset, endOffset: text.length, ...(providerWord.confidence !== null && providerWord.confidence !== undefined ? { confidence: providerWord.confidence } : {}), boundingBox: { x: clamp(x1 / width), y: clamp(y1 / height), width: clamp((x2 - x1) / width), height: clamp((y2 - y1) / height), raw: { x1, y1, x2, y2 } } });
      const last = providerWord.symbols?.at(-1)?.property?.detectedBreak?.type;
      text += last === "LINE_BREAK" || last === "EOL_SURE_SPACE" ? "\n" : last === "HYPHEN" ? "-" : " ";
    }
    pages.push({ sourceFileId, pageNumber, width, height, words });
  });
  return { text: text.trimEnd(), pages };
}

function clamp(value: number) { return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)); }

export class GoogleVisionOcrProvider implements OcrProvider {
  private readonly client: InstanceType<typeof vision.ImageAnnotatorClient>;
  constructor(client = new vision.ImageAnnotatorClient()) { this.client = client; }
  async extract(files: SubmissionFileRecord[]): Promise<OcrResult> {
    const storage = await getObjectStorage();
    const detected: Array<{ sourceFileId: string; pageNumber: number; page: VisionPage }> = [];
    try {
      for (const file of files) {
        const bytes = Buffer.from(await storage.getObject(file.objectKey));
        const images = file.mimeType === "application/pdf" ? await renderPdf(bytes) : [bytes];
        for (let pageIndex = 0; pageIndex < images.length; pageIndex++) {
          const [response] = await this.client.documentTextDetection({ image: { content: images[pageIndex]! }, imageContext: { languageHints: env.OCR_LANGUAGE_HINTS } });
          for (const page of response.fullTextAnnotation?.pages ?? []) detected.push({ sourceFileId: file._id.toString(), pageNumber: pageIndex + 1, page });
        }
      }
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? Number(error.code) : undefined;
      throw new OcrProviderError("Google Vision OCR request failed", code === 7 || code === 16 ? "OCR_PROVIDER_AUTH_FAILED" : "OCR_PROVIDER_REQUEST_FAILED");
    }
    const canonical = canonicalizeVisionPages(detected);
    if (!canonical.text.trim()) throw new OcrProviderError("OCR returned no meaningful text", "OCR_EMPTY_RESULT");
    return { ...canonical, provider: "google-vision", model: "document-text-detection", processedFiles: files.length, completedAt: new Date() };
  }
}

async function renderPdf(bytes: Buffer): Promise<Buffer[]> {
  const document = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const rendered: Buffer[] = [];
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas: canvas as never, canvasContext: canvas.getContext("2d") as never, viewport }).promise;
    rendered.push(canvas.toBuffer("image/png"));
  }
  return rendered;
}

class OpenAiOcrProvider implements OcrProvider {
  async extract(files: SubmissionFileRecord[]): Promise<OcrResult> {
    if (!env.OCR_API_KEY) throw new OcrProviderError("OCR is not configured", "OCR_PROVIDER_AUTH_FAILED");
    const storage = await getObjectStorage();
    const content: Array<Record<string, unknown>> = [{ type: "input_text", text: "Transcribe every file faithfully in reading order. Return only the transcription. Preserve paragraphs. Do not evaluate or correct it." }];
    for (const file of files) {
      const data = Buffer.from(await storage.getObject(file.objectKey)).toString("base64");
      content.push(file.mimeType === "application/pdf" ? { type: "input_file", filename: file.originalName, file_data: `data:application/pdf;base64,${data}` } : { type: "input_image", image_url: `data:${file.mimeType};base64,${data}`, detail: "high" });
    }
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.OCR_API_KEY}` }, body: JSON.stringify({ model: env.OCR_MODEL, input: [{ role: "user", content }], max_output_tokens: 8000 }) });
    if (!response.ok) throw new OcrProviderError("OCR provider request failed", response.status === 401 || response.status === 403 ? "OCR_PROVIDER_AUTH_FAILED" : "OCR_PROVIDER_REQUEST_FAILED", response.status);
    const body = await response.json() as { output_text?: string };
    if (!body.output_text?.trim()) throw new OcrProviderError("OCR returned no meaningful text", "OCR_EMPTY_RESULT");
    return { text: body.output_text.trim(), provider: "openai", model: env.OCR_MODEL, processedFiles: files.length, pages: [], completedAt: new Date() };
  }
}

export function getOcrProvider(): OcrProvider { return override ?? (env.OCR_PROVIDER === "google-vision" ? new GoogleVisionOcrProvider() : new OpenAiOcrProvider()); }

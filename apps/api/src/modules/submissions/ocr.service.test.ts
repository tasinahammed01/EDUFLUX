import { afterEach, describe, expect, it, vi } from "vitest";
import { setObjectStorageForTests } from "../../storage/object-storage.js";
import { canonicalizeVisionPages, getOcrProvider, GoogleVisionOcrProvider } from "./ocr.service.js";
import { mapIssuesToOcrWords } from "./ocr-issue-mapping.js";

const page = { width: 1000, height: 500, blocks: [{ paragraphs: [{ words: [
  { confidence: .98, boundingBox: { vertices: [{ x: 100, y: 50 }, { x: 300, y: 50 }, { x: 300, y: 100 }, { x: 100, y: 100 }] }, symbols: [{ text: "S" }, { text: "t" }, { text: "u" }, { text: "d" }, { text: "e" }, { text: "n" }, { text: "t" }, { text: "s", property: { detectedBreak: { type: "SPACE" } } }] },
  { confidence: .95, boundingBox: { vertices: [{ x: 320, y: 50 }, { x: 450, y: 50 }, { x: 450, y: 100 }, { x: 320, y: 100 }] }, symbols: [{ text: "u" }, { text: "s" }, { text: "e" }, { text: "s", property: { detectedBreak: { type: "LINE_BREAK" } } }] },
] }] }] };

describe("canonical Google Vision OCR", () => {
  afterEach(() => setObjectStorageForTests(undefined));
  it("selects and calls the Google Vision document-text provider for images", async () => {
    expect(getOcrProvider()).toBeInstanceOf(GoogleVisionOcrProvider);
    const documentTextDetection = vi.fn().mockResolvedValue([{ fullTextAnnotation: { pages: [page] } }]);
    setObjectStorageForTests({ getObject: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])), createUploadUrl: vi.fn(), headObject: vi.fn(), createDownloadUrl: vi.fn(), deleteObject: vi.fn() });
    const provider = new GoogleVisionOcrProvider({ documentTextDetection } as never);
    const result = await provider.extract([{ _id: { toString: () => "file" }, objectKey: "private/file", mimeType: "image/png" }] as never);
    expect(documentTextDetection).toHaveBeenCalledOnce();
    expect(documentTextDetection.mock.calls[0]![0]).toMatchObject({ imageContext: { languageHints: ["en"] } });
    expect(result.text).toBe("Students uses");
  });
  it("creates stable IDs, aligned offsets, and normalized word boxes", () => {
    const result = canonicalizeVisionPages([{ sourceFileId: "file", pageNumber: 1, page: page as never }]);
    expect(result.text).toBe("Students uses");
    expect(result.pages[0]!.words.map((word) => word.id)).toEqual(["f1_p1_w0001", "f1_p1_w0002"]);
    expect(result.text.slice(result.pages[0]!.words[1]!.startOffset, result.pages[0]!.words[1]!.endOffset)).toBe("uses");
    expect(result.pages[0]!.words[0]!.boundingBox).toMatchObject({ x: .1, y: .1, width: .2, height: .1 });
  });

  it("maps multi-word issues and refuses uncertain geometry", () => {
    const result = canonicalizeVisionPages([{ sourceFileId: "file", pageNumber: 1, page: page as never }]);
    const mapped = mapIssuesToOcrWords([
      { id: "one", code: "AGR", label: "Agreement", category: "grammar", originalText: "Students uses", startIndex: 10, endIndex: 23 },
      { id: "two", code: "SP", label: "Spelling", category: "mechanics", originalText: "missing", startIndex: 99, endIndex: 106 },
    ], result.pages, result.text, 10);
    expect(mapped[0]).toMatchObject({ source: "OCR_FILE", sourceFileId: "file", wordIds: ["f1_p1_w0001", "f1_p1_w0002"], pageNumbers: [1] });
    expect(mapped[1]!.wordIds).toBeUndefined();
  });
});

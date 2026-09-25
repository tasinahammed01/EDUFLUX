import { afterEach, describe, expect, it, vi } from "vitest";
import { setObjectStorageForTests } from "../../storage/object-storage.js";
import {
  canonicalizeVisionPages,
  getOcrProvider,
  GoogleVisionOcrProvider,
  OcrProviderError,
} from "./ocr.service.js";
import {
  mapIssuesToOcrWords,
  suppressLowConfidenceMechanics,
} from "./ocr-issue-mapping.js";

const page = {
  width: 1000,
  height: 500,
  blocks: [
    {
      paragraphs: [
        {
          words: [
            {
              confidence: 0.98,
              boundingBox: {
                vertices: [
                  { x: 100, y: 50 },
                  { x: 300, y: 50 },
                  { x: 300, y: 100 },
                  { x: 100, y: 100 },
                ],
              },
              symbols: [
                { text: "S" },
                { text: "t" },
                { text: "u" },
                { text: "d" },
                { text: "e" },
                { text: "n" },
                { text: "t" },
                { text: "s", property: { detectedBreak: { type: "SPACE" } } },
              ],
            },
            {
              confidence: 0.95,
              boundingBox: {
                vertices: [
                  { x: 320, y: 50 },
                  { x: 450, y: 50 },
                  { x: 450, y: 100 },
                  { x: 320, y: 100 },
                ],
              },
              symbols: [
                { text: "u" },
                { text: "s" },
                { text: "e" },
                {
                  text: "s",
                  property: { detectedBreak: { type: "LINE_BREAK" } },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("canonical Google Vision OCR", () => {
  afterEach(() => setObjectStorageForTests(undefined));
  it("selects and calls the Google Vision document-text provider for images", async () => {
    expect(getOcrProvider()).toBeInstanceOf(GoogleVisionOcrProvider);
    const documentTextDetection = vi
      .fn()
      .mockResolvedValue([{ fullTextAnnotation: { pages: [page] } }]);
    setObjectStorageForTests({
      getObject: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      createUploadUrl: vi.fn(),
      headObject: vi.fn(),
      createDownloadUrl: vi.fn(),
      deleteObject: vi.fn(),
    });
    const provider = new GoogleVisionOcrProvider({
      documentTextDetection,
    } as never);
    const result = await provider.extract([
      {
        _id: { toString: () => "file" },
        objectKey: "private/file",
        mimeType: "image/png",
      },
    ] as never);
    expect(documentTextDetection).toHaveBeenCalledOnce();
    expect(documentTextDetection.mock.calls[0]![0]).toMatchObject({
      imageContext: { languageHints: ["en"] },
    });
    expect(result.text).toBe("Students uses");
  });
  it("creates stable IDs, aligned offsets, and normalized word boxes", () => {
    const result = canonicalizeVisionPages([
      { sourceFileId: "file", pageNumber: 1, page: page as never },
    ]);
    expect(result.text).toBe("Students uses");
    expect(result.pages[0]!.words.map((word) => word.id)).toEqual([
      "f1_p1_w0001",
      "f1_p1_w0002",
    ]);
    expect(
      result.text.slice(
        result.pages[0]!.words[1]!.startOffset,
        result.pages[0]!.words[1]!.endOffset,
      ),
    ).toBe("uses");
    expect(result.pages[0]!.words[0]!.boundingBox).toMatchObject({
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.1,
    });
  });
  it("classifies missing credential and authentication failures without leaking provider errors", async () => {
    setObjectStorageForTests({
      getObject: vi.fn().mockResolvedValue(new Uint8Array([1])),
      createUploadUrl: vi.fn(),
      headObject: vi.fn(),
      createDownloadUrl: vi.fn(),
      deleteObject: vi.fn(),
    });
    const missing = new GoogleVisionOcrProvider({
      documentTextDetection: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("Unable to read credential file"), {
            code: "ENOENT",
          }),
        ),
    } as never);
    await expect(
      missing.extract([
        {
          _id: { toString: () => "file" },
          objectKey: "private/file",
          mimeType: "image/png",
        },
      ] as never),
    ).rejects.toMatchObject<OcrProviderError>({
      code: "OCR_PROVIDER_CONFIG_ERROR",
      message: "Google Vision OCR request failed",
    });
    const auth = new GoogleVisionOcrProvider({
      documentTextDetection: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("Unauthenticated"), { code: 16 }),
        ),
    } as never);
    await expect(
      auth.extract([
        {
          _id: { toString: () => "file" },
          objectKey: "private/file",
          mimeType: "image/png",
        },
      ] as never),
    ).rejects.toMatchObject<OcrProviderError>({
      code: "OCR_PROVIDER_AUTH_FAILED",
      message: "Google Vision OCR request failed",
    });
  });

  it("maps multi-word issues and refuses uncertain geometry", () => {
    const result = canonicalizeVisionPages([
      { sourceFileId: "file", pageNumber: 1, page: page as never },
    ]);
    const mapped = mapIssuesToOcrWords(
      [
        {
          id: "one",
          code: "AGR",
          label: "Agreement",
          category: "grammar",
          originalText: "Students uses",
          startIndex: 10,
          endIndex: 23,
        },
        {
          id: "two",
          code: "SP",
          label: "Spelling",
          category: "mechanics",
          originalText: "missing",
          startIndex: 99,
          endIndex: 106,
        },
      ],
      result.pages,
      result.text,
      10,
    );
    expect(mapped[0]).toMatchObject({
      source: "OCR_FILE",
      sourceFileId: "file",
      wordIds: ["f1_p1_w0001", "f1_p1_w0002"],
      pageNumbers: [1],
    });
    expect(mapped[1]!.wordIds).toBeUndefined();
  });
  it("maps repeated multi-file OCR only when the expected location identifies one file", () => {
    const first = canonicalizeVisionPages([
      { sourceFileId: "file-one", pageNumber: 1, page: page as never },
    ]);
    const secondPage = structuredClone(page);
    secondPage.blocks[0]!.paragraphs[0]!.words[0]!.symbols = [
      { text: "C" },
      { text: "l" },
      { text: "e" },
      { text: "a" },
      { text: "r", property: { detectedBreak: { type: "SPACE" } } },
    ];
    secondPage.blocks[0]!.paragraphs[0]!.words[1]!.symbols = [
      { text: "c" },
      { text: "l" },
      { text: "a" },
      { text: "i" },
      { text: "m", property: { detectedBreak: { type: "LINE_BREAK" } } },
    ];
    const second = canonicalizeVisionPages([
      { sourceFileId: "file-two", pageNumber: 1, page: secondPage as never },
    ]);
    const offset = first.text.length + 1;
    const pages = [
      ...first.pages,
      ...second.pages.map((item) => ({
        ...item,
        words: item.words.map((word) => ({
          ...word,
          startOffset: word.startOffset + offset,
          endOffset: word.endOffset + offset,
        })),
      })),
    ];
    const mapped = mapIssuesToOcrWords(
      [
        {
          id: "multi",
          code: "CL",
          label: "Clarity",
          category: "content",
          originalText: "Clear claim",
          startIndex: offset,
          endIndex: offset + 11,
        },
      ],
      pages,
      `${first.text}\n${second.text}`,
      0,
    );
    expect(mapped[0]).toMatchObject({
      source: "OCR_FILE",
      sourceFileId: "file-two",
      pageNumbers: [1],
    });
  });
  it("suppresses mechanics findings mapped only to low-confidence OCR words", () => {
    const result = canonicalizeVisionPages([
      { sourceFileId: "file", pageNumber: 1, page: page as never },
    ]);
    const pages = result.pages.map((item) => ({
      ...item,
      words: item.words.map((word) => ({ ...word, confidence: 0.55 })),
    }));
    const mapped = mapIssuesToOcrWords(
      [
        {
          id: "spell",
          code: "SP",
          label: "Spelling",
          category: "mechanics",
          originalText: "Students",
          startIndex: 0,
          endIndex: 8,
        },
      ],
      pages,
      result.text,
      0,
    );
    expect(suppressLowConfidenceMechanics(mapped, pages)).toEqual([]);
  });
});

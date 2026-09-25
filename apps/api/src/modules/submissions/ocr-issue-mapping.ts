import type { EvaluationResult } from "./evaluation-schema.js";
import type { OcrPage } from "./ocr.service.js";

export type MappedIssue = EvaluationResult["issues"][number] & {
  source?: "TYPED" | "OCR_FILE";
  sourceFileId?: string;
  wordIds?: string[];
  pageNumbers?: number[];
};

export function mapIssuesToOcrWords(
  issues: EvaluationResult["issues"],
  pages: OcrPage[],
  ocrText: string,
  ocrStartOffset: number,
): MappedIssue[] {
  const words = pages.flatMap((page) =>
    page.words.map((word) => ({
      ...word,
      sourceFileId: page.sourceFileId,
      pageNumber: page.pageNumber,
    })),
  );
  const ocrEnd = ocrStartOffset + ocrText.length;
  return issues.map((issue) => {
    if (
      issue.startIndex === undefined ||
      issue.endIndex === undefined ||
      issue.startIndex < ocrStartOffset ||
      issue.endIndex > ocrEnd
    )
      return { ...issue, source: "TYPED" };
    const localStart = issue.startIndex - ocrStartOffset,
      localEnd = issue.endIndex - ocrStartOffset;
    let matched = words.filter(
      (word) => word.startOffset < localEnd && word.endOffset > localStart,
    );
    const expectedText = comparable(issue.originalText);
    if (
      matched.length &&
      expectedText &&
      !comparable(matched.map((word) => word.text).join(" ")).includes(
        expectedText,
      )
    )
      matched = [];
    if (!matched.length && expectedText)
      matched = findUniqueWordSequence(words, expectedText, localStart);
    if (!matched.length) return { ...issue };
    const sourceFileIds = [
      ...new Set(matched.map((word) => word.sourceFileId)),
    ];
    if (sourceFileIds.length !== 1) return { ...issue };
    return {
      ...issue,
      source: "OCR_FILE",
      sourceFileId: sourceFileIds[0]!,
      wordIds: matched.map((word) => word.id),
      pageNumbers: [...new Set(matched.map((word) => word.pageNumber))],
    };
  });
}

export function suppressLowConfidenceMechanics(
  issues: MappedIssue[],
  pages: OcrPage[],
  minimumConfidence = 0.75,
): MappedIssue[] {
  const confidenceByWord = new Map(
    pages.flatMap((page) =>
      page.words.map((word) => [word.id, word.confidence] as const),
    ),
  );
  return issues.filter((issue) => {
    if (
      issue.category !== "mechanics" ||
      issue.source !== "OCR_FILE" ||
      !issue.wordIds?.length
    )
      return true;
    const measured = issue.wordIds
      .map((id) => confidenceByWord.get(id))
      .filter((value): value is number => value !== undefined);
    return (
      measured.length === 0 ||
      measured.every((confidence) => confidence >= minimumConfidence)
    );
  });
}

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}
function comparable(value: string) {
  return normalize(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function findUniqueWordSequence(
  words: Array<
    OcrPage["words"][number] & { sourceFileId: string; pageNumber: number }
  >,
  needle: string,
  expectedOffset: number,
) {
  const targetTokens = needle.split(" ").filter(Boolean);
  if (!targetTokens.length) return [];
  const candidates: (typeof words)[] = [];
  for (let start = 0; start < words.length; start++) {
    const candidate: typeof words = [];
    for (
      let end = start;
      end < Math.min(words.length, start + targetTokens.length + 3);
      end++
    ) {
      const word = words[end]!;
      if (candidate.length && word.sourceFileId !== candidate[0]!.sourceFileId)
        break;
      candidate.push(word);
      const value = comparable(candidate.map((item) => item.text).join(" "));
      if (value === needle) {
        candidates.push([...candidate]);
        break;
      }
      if (!needle.startsWith(value)) break;
    }
  }
  if (candidates.length === 1) return candidates[0]!;
  const nearby = candidates.filter(
    (candidate) => Math.abs(candidate[0]!.startOffset - expectedOffset) <= 160,
  );
  return nearby.length === 1 ? nearby[0]! : [];
}

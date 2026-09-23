import type { EvaluationResult } from "./evaluation-schema.js";
import type { OcrPage } from "./ocr.service.js";

export type MappedIssue = EvaluationResult["issues"][number] & { source?: "TYPED" | "OCR_FILE"; sourceFileId?: string; wordIds?: string[]; pageNumbers?: number[] };

export function mapIssuesToOcrWords(issues: EvaluationResult["issues"], pages: OcrPage[], ocrText: string, ocrStartOffset: number): MappedIssue[] {
  const words = pages.flatMap((page) => page.words.map((word) => ({ ...word, sourceFileId: page.sourceFileId, pageNumber: page.pageNumber })));
  const ocrEnd = ocrStartOffset + ocrText.length;
  return issues.map((issue) => {
    if (issue.startIndex === undefined || issue.endIndex === undefined || issue.startIndex < ocrStartOffset || issue.endIndex > ocrEnd) return { ...issue, source: "TYPED" };
    let localStart = issue.startIndex - ocrStartOffset, localEnd = issue.endIndex - ocrStartOffset;
    let matched = words.filter((word) => word.startOffset < localEnd && word.endOffset > localStart);
    if (!matched.length && issue.originalText) {
      const expected = Math.max(0, localStart), from = Math.max(0, expected - 120), to = Math.min(ocrText.length, expected + issue.originalText.length + 120);
      const normalizedNeedle = normalize(issue.originalText), candidates: number[] = [];
      for (let index = from; index < to; index++) if (normalize(ocrText.slice(index, index + issue.originalText.length)) === normalizedNeedle) candidates.push(index);
      if (candidates.length === 1) {
        localStart = candidates[0]!; localEnd = localStart + issue.originalText.length;
        matched = words.filter((word) => word.startOffset < localEnd && word.endOffset > localStart);
      }
    }
    if (!matched.length) return { ...issue };
    const sourceFileIds = [...new Set(matched.map((word) => word.sourceFileId))];
    if (sourceFileIds.length !== 1) return { ...issue };
    return { ...issue, source: "OCR_FILE", sourceFileId: sourceFileIds[0]!, wordIds: matched.map((word) => word.id), pageNumbers: [...new Set(matched.map((word) => word.pageNumber))] };
  });
}

function normalize(value: string) { return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase(); }

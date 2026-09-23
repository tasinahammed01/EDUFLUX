import { describe, expect, it, vi } from "vitest";
import { aggregateUploadPercentage, uploadToPresignedUrl } from "./submission-upload";

describe("direct R2 upload transport", () => {
  it("calculates aggregate progress by bytes", () => {
    expect(aggregateUploadPercentage(100, 50, 1000)).toBe(15);
    expect(aggregateUploadPercentage(900, 100, 1000)).toBe(100);
  });

  it("reports actual XMLHttpRequest upload bytes and preserves signed headers", async () => {
    const progress = vi.fn();
    class FakeXhr {
      static instance: FakeXhr;
      upload: { onprogress?: (event: { loaded: number }) => void } = {};
      status = 200; onload?: () => void; onerror?: () => void; onabort?: () => void;
      open = vi.fn(); setRequestHeader = vi.fn();
      constructor() { FakeXhr.instance = this; }
      send = vi.fn(() => { this.upload.onprogress?.({ loaded: 75 }); this.onload?.(); });
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const file = new File([new Uint8Array(100)], "work.pdf", { type: "application/pdf" });
    await uploadToPresignedUrl(file, "https://r2.example/upload", { "content-type": "application/pdf", "x-signed": "required" }, progress);
    expect(FakeXhr.instance.open).toHaveBeenCalledWith("PUT", "https://r2.example/upload");
    expect(FakeXhr.instance.setRequestHeader).toHaveBeenCalledWith("x-signed", "required");
    expect(progress).toHaveBeenNthCalledWith(1, 75);
    expect(progress).toHaveBeenLastCalledWith(100);
    vi.unstubAllGlobals();
  });
});

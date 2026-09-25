import { afterEach, describe, expect, it } from "vitest";
import { submissionDraftSchema, submissionFileOrderSchema, uploadIntentSchema } from "@eduflux/validation";
import {
  getObjectStorage,
  setObjectStorageForTests,
} from "./storage/object-storage.js";
import { FakeObjectStorage } from "./test/fake-object-storage.js";

afterEach(() => setObjectStorageForTests(undefined));

describe("submission upload boundaries", () => {
  it("uses the isolated object storage adapter in tests", async () => {
    const fake = new FakeObjectStorage();
    fake.objects.set("private/key", {
      sizeBytes: 42,
      contentType: "application/pdf",
    });
    setObjectStorageForTests(fake);

    const storage = await getObjectStorage();
    await expect(storage.headObject("private/key")).resolves.toEqual({
      sizeBytes: 42,
      contentType: "application/pdf",
    });
    await storage.deleteObject("private/key");
    expect(fake.deleted).toEqual(["private/key"]);
  });

  it.each(["text/plain", "application/zip", "image/svg+xml"])(
    "rejects unsupported upload type %s",
    (mimeType) => {
      expect(
        uploadIntentSchema.safeParse({
          filename: "unsafe.file",
          mimeType,
          sizeBytes: 1,
        }).success,
      ).toBe(false);
    },
  );

  it("enforces text and attachment-count limits before persistence", () => {
    expect(
      submissionDraftSchema.safeParse({
        typedText: "x".repeat(100_001),
        fileIds: [],
      }).success,
    ).toBe(false);
    expect(
      submissionDraftSchema.safeParse({
        typedText: "valid",
        fileIds: Array.from({ length: 6 }, () => "507f1f77bcf86cd799439011"),
      }).success,
    ).toBe(false);
  });

  it("requires a revisioned, duplicate-free file order payload", () => {
    const id = "507f1f77bcf86cd799439011";
    expect(submissionFileOrderSchema.safeParse({ fileIds: [id], draftRevision: 2 }).success).toBe(true);
    expect(submissionFileOrderSchema.safeParse({ fileIds: [], draftRevision: 2 }).success).toBe(false);
  });
});

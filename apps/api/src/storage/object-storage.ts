export interface StoredObjectHead {
  sizeBytes: number;
  contentType?: string;
}
export interface ObjectStorage {
  createUploadUrl(input: {
    key: string;
    contentType: string;
    expiresIn: number;
  }): Promise<string>;
  headObject(key: string): Promise<StoredObjectHead | null>;
  createDownloadUrl(input: {
    key: string;
    filename: string;
    contentType: string;
    disposition: "inline" | "attachment";
    expiresIn: number;
  }): Promise<string>;
  deleteObject(key: string): Promise<void>;
  getObject(key: string): Promise<Uint8Array>;
}
let override: ObjectStorage | undefined;
export function setObjectStorageForTests(storage: ObjectStorage | undefined) {
  override = storage;
}
export async function getObjectStorage(): Promise<ObjectStorage> {
  if (override) return override;
  const { r2ObjectStorage } = await import("./r2-object-storage.js");
  return r2ObjectStorage();
}

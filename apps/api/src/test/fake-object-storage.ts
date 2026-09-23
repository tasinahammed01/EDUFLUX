import type {
  ObjectStorage,
  StoredObjectHead,
} from "../storage/object-storage.js";
export class FakeObjectStorage implements ObjectStorage {
  objects = new Map<string, StoredObjectHead>();
  bodies = new Map<string, Uint8Array>();
  deleted: string[] = [];
  async createUploadUrl({ key }: { key: string }) {
    return `https://storage.test/upload/${encodeURIComponent(key)}`;
  }
  async headObject(key: string) {
    return this.objects.get(key) ?? null;
  }
  async createDownloadUrl({ key }: { key: string }) {
    return `https://storage.test/download/${encodeURIComponent(key)}`;
  }
  async deleteObject(key: string) {
    this.objects.delete(key);
    this.deleted.push(key);
  }
  async getObject(key: string) {
    const body = this.bodies.get(key);
    if (!body) throw new Error("Object body not found");
    return body;
  }
}

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";
import { ApiError } from "../utils/api-error.js";
import type { ObjectStorage } from "./object-storage.js";
let instance: ObjectStorage | undefined;
function config() {
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET_NAME
  )
    throw new ApiError(
      503,
      "STORAGE_UNAVAILABLE",
      "File storage is not configured.",
    );
  return {
    bucket: env.R2_BUCKET_NAME,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    }),
  };
}
export function r2ObjectStorage(): ObjectStorage {
  if (instance) return instance;
  const { bucket, client } = config();
  instance = {
    async createUploadUrl({ key, contentType, expiresIn }) {
      return getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: contentType,
        }),
        { expiresIn },
      );
    },
    async headObject(key) {
      try {
        const value = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        return {
          sizeBytes: value.ContentLength ?? 0,
          ...(value.ContentType ? { contentType: value.ContentType } : {}),
        };
      } catch (error) {
        if (
          typeof error === "object" &&
          error &&
          "$metadata" in error &&
          (error as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode === 404
        )
          return null;
        throw error;
      }
    },
    async createDownloadUrl({
      key,
      filename,
      contentType,
      disposition,
      expiresIn,
    }) {
      const safe = filename.replace(/["\\\r\n]/g, "_");
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentType: contentType,
          ResponseContentDisposition: `${disposition}; filename="${safe}"`,
        }),
        { expiresIn },
      );
    },
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async getObject(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!result.Body) throw new Error("Stored object had no body");
      return result.Body.transformToByteArray();
    },
  };
  return instance;
}

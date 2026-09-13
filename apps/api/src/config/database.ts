import mongoose from "mongoose";
import { env } from "./env.js";

mongoose.set("bufferCommands", false);

export async function connectDatabase(uri = env.MONGODB_URI): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8_000,
    connectTimeoutMS: 10_000,
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    autoIndex: env.NODE_ENV !== "production"
  });
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

export function isDatabaseReady(): boolean { return mongoose.connection.readyState === 1; }

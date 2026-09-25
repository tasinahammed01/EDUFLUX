import mongoose from "mongoose";
import { env } from "./env.js";
import pino from "pino";

const logger = pino({ level: env.LOG_LEVEL });

mongoose.set("bufferCommands", false);

let connectionPromise: Promise<void> | null = null;

export async function connectDatabase(uri = env.MONGODB_URI): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8_000,
    connectTimeoutMS: 10_000,
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    autoIndex: env.NODE_ENV !== "production"
  });
}

export async function ensureDatabaseConnection(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  if (connectionPromise) {
    await connectionPromise;
    return;
  }
  connectionPromise = connectDatabase().catch((error) => {
    connectionPromise = null;
    logger.warn({
      event: "database_connection_failed",
      errorName: error instanceof Error ? error.name : "Unknown",
      errorCode: (error as any)?.code,
      databaseReady: false,
    }, "Database connection failed");
    throw error;
  });
  await connectionPromise;
  logger.info({
    event: "database_connected",
    databaseReady: true,
  }, "Database connection established");
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  connectionPromise = null;
}

export function isDatabaseReady(): boolean { return mongoose.connection.readyState === 1; }

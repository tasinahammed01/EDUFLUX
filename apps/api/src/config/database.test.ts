import { beforeEach, describe, expect, it, vi } from "vitest";

const mongoose = vi.hoisted(() => ({
  connection: { readyState: 0 },
  set: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("mongoose", () => ({
  default: mongoose,
  set: mongoose.set,
  connect: mongoose.connect,
  disconnect: mongoose.disconnect,
}));

const env = vi.hoisted(() => ({
  MONGODB_URI: "mongodb://test:27017/test",
  MONGODB_MAX_POOL_SIZE: 10,
  NODE_ENV: "test",
  LOG_LEVEL: "error",
}));

vi.mock("./env.js", () => ({ env }));

const pino = vi.hoisted(() => vi.fn(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})));

vi.mock("pino", () => ({ default: pino }));

describe("database connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mongoose.connection.readyState = 0;
  });

  describe("ensureDatabaseConnection", () => {
    it("returns immediately if already connected", async () => {
      mongoose.connection.readyState = 1;
      
      const { ensureDatabaseConnection } = await import("./database.js");
      await ensureDatabaseConnection();
      
      expect(mongoose.connect).not.toHaveBeenCalled();
    });

    it("establishes connection when not connected", async () => {
      const { ensureDatabaseConnection } = await import("./database.js");
      await ensureDatabaseConnection();
      
      expect(mongoose.connect).toHaveBeenCalledWith(
        env.MONGODB_URI,
        expect.objectContaining({
          serverSelectionTimeoutMS: 8_000,
          connectTimeoutMS: 10_000,
          maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
        })
      );
    });

    it("is idempotent - concurrent calls share one connection attempt", async () => {
      const { ensureDatabaseConnection } = await import("./database.js");
      
      const connectionPromise = mongoose.connect.mockResolvedValueOnce(undefined);
      mongoose.connect.mockImplementation(() => connectionPromise);
      
      const [result1, result2, result3] = await Promise.all([
        ensureDatabaseConnection(),
        ensureDatabaseConnection(),
        ensureDatabaseConnection(),
      ]);
      
      expect(mongoose.connect).toHaveBeenCalledTimes(1);
    });

    it("throws error when connection fails", async () => {
      const error = new Error("Connection failed");
      mongoose.connect.mockRejectedValueOnce(error);
      
      const { ensureDatabaseConnection } = await import("./database.js");
      
      await expect(ensureDatabaseConnection()).rejects.toThrow("Connection failed");
    });

    it("can retry after failed connection", async () => {
      const error = new Error("Connection failed");
      mongoose.connect.mockRejectedValueOnce(error);
      
      const { ensureDatabaseConnection, disconnectDatabase } = await import("./database.js");
      
      await expect(ensureDatabaseConnection()).rejects.toThrow("Connection failed");
      
      await disconnectDatabase();
      
      mongoose.connect.mockResolvedValueOnce(undefined);
      await ensureDatabaseConnection();
      
      expect(mongoose.connect).toHaveBeenCalledTimes(2);
    });

    it("retries failed connection without calling disconnectDatabase", async () => {
      const error = new Error("Connection failed");
      mongoose.connect.mockRejectedValueOnce(error);
      
      const { ensureDatabaseConnection } = await import("./database.js");
      
      await expect(ensureDatabaseConnection()).rejects.toThrow("Connection failed");
      
      mongoose.connect.mockResolvedValueOnce(undefined);
      await ensureDatabaseConnection();
      
      expect(mongoose.connect).toHaveBeenCalledTimes(2);
    });

    it("caches connection promise during ongoing connection", async () => {
      let resolveConnection: (value: void) => void;
      const connectionPromise = new Promise<void>((resolve) => {
        resolveConnection = resolve;
      });
      mongoose.connect.mockReturnValue(connectionPromise);
      
      const { ensureDatabaseConnection } = await import("./database.js");
      
      const call1 = ensureDatabaseConnection();
      const call2 = ensureDatabaseConnection();
      
      expect(mongoose.connect).toHaveBeenCalledTimes(1);
      
      resolveConnection!();
      await Promise.all([call1, call2]);
      
      expect(mongoose.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe("connectDatabase", () => {
    it("returns immediately if already connected", async () => {
      mongoose.connection.readyState = 1;
      
      const { connectDatabase } = await import("./database.js");
      await connectDatabase();
      
      expect(mongoose.connect).not.toHaveBeenCalled();
    });

    it("establishes connection when not connected", async () => {
      const { connectDatabase } = await import("./database.js");
      await connectDatabase();
      
      expect(mongoose.connect).toHaveBeenCalled();
    });
  });

  describe("disconnectDatabase", () => {
    it("disconnects when connected", async () => {
      mongoose.connection.readyState = 1;
      
      const { disconnectDatabase } = await import("./database.js");
      await disconnectDatabase();
      
      expect(mongoose.disconnect).toHaveBeenCalled();
    });

    it("does nothing when not connected", async () => {
      mongoose.connection.readyState = 0;
      
      const { disconnectDatabase } = await import("./database.js");
      await disconnectDatabase();
      
      expect(mongoose.disconnect).not.toHaveBeenCalled();
    });

    it("resets connection promise state", async () => {
      const error = new Error("Connection failed");
      mongoose.connect.mockRejectedValueOnce(error);
      
      const { ensureDatabaseConnection, disconnectDatabase } = await import("./database.js");
      
      await expect(ensureDatabaseConnection()).rejects.toThrow("Connection failed");
      
      await disconnectDatabase();
      
      mongoose.connect.mockResolvedValueOnce(undefined);
      await ensureDatabaseConnection();
      
      expect(mongoose.connect).toHaveBeenCalledTimes(2);
    });
  });

  describe("isDatabaseReady", () => {
    it("returns true when connected", async () => {
      mongoose.connection.readyState = 1;
      
      const { isDatabaseReady } = await import("./database.js");
      
      expect(isDatabaseReady()).toBe(true);
    });

    it("returns false when not connected", async () => {
      mongoose.connection.readyState = 0;
      
      const { isDatabaseReady } = await import("./database.js");
      
      expect(isDatabaseReady()).toBe(false);
    });
  });
});

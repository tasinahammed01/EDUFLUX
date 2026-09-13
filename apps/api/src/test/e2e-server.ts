import { MongoMemoryReplSet } from "mongodb-memory-server";

process.env.NODE_ENV = "test";
process.env.PORT = "5000";
process.env.WEB_ORIGIN = "http://127.0.0.1:3000";

const replicaSet = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
process.env.MONGODB_URI = replicaSet.getUri("eduflux-e2e");

const [{ app }, { connectDatabase, disconnectDatabase }] = await Promise.all([import("../app.js"), import("../config/database.js")]);
await connectDatabase(process.env.MONGODB_URI);
const server = app.listen(5000);

async function shutdown(): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await disconnectDatabase();
  await replicaSet.stop();
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

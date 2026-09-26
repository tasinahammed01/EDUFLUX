import "dotenv/config";
import pino from "pino";
import { z } from "zod";

const config = z.object({ LOG_LEVEL: z.string().default("info") }).parse(process.env);
const logger = pino({ level: config.LOG_LEVEL });

logger.info("MENTRA worker foundation ready; no queues are configured in Phase 1");

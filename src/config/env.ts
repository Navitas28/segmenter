import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("3000"),
  POLL_INTERVAL_MS: z.string().default("3000"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.string().default("info"),
  ENABLE_SEGMENT_BACKEND_VISUALIZATION: z.string().default("false"),
  SEGMENTATION_STRATEGY: z.enum(["geo-hash", "grid-based"]).default("geo-hash"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment variables", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  port: Number(parsed.data.PORT),
  pollIntervalMs: Number(parsed.data.POLL_INTERVAL_MS),
  supabaseUrl: parsed.data.SUPABASE_URL,
  supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
  databaseUrl: parsed.data.DATABASE_URL,
  logLevel: parsed.data.LOG_LEVEL,
  enableSegmentBackendVisualization: parsed.data.ENABLE_SEGMENT_BACKEND_VISUALIZATION === "true" || parsed.data.ENABLE_SEGMENT_BACKEND_VISUALIZATION === "1",
  segmentationStrategy: parsed.data.SEGMENTATION_STRATEGY as "geo-hash" | "grid-based",
};

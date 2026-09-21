import { createClient } from "redis";

export const redis = createClient({ url: process.env.REDIS_URL })
  .on("error", (err) => console.error("[Redis] client error:", err))
  .on("ready", () => console.log("[Redis] connected"));

redis.connect();

import path from "node:path";
import dotenv from "dotenv";
import type { AppConfig } from "./types.js";

dotenv.config({ path: path.resolve(import.meta.dirname, "..", ".env") });

export function loadConfig(): AppConfig {
  return {
    aiProvider: (process.env.AI_PROVIDER as "openai" | "anthropic") || "openai",
    aiModel: process.env.AI_MODEL,
    openaiKey: process.env.OPENAI_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    mongodbUri: process.env.MONGODB_URI,
    mongodbDb: process.env.MONGODB_DB || "audio-prophet",
    appUrl: process.env.APP_URL || "http://localhost:3000",
    twitterMethod: (process.env.TWITTER_SCRAPE_METHOD as "api" | "browser") || "browser",
    twitterCookiesPath: process.env.TWITTER_COOKIES_PATH,
    twitterBearerToken: process.env.TWITTER_BEARER_TOKEN,
    twitterApiKey: process.env.TWITTER_API_KEY,
    twitterApiSecret: process.env.TWITTER_API_SECRET,
    twitterAccessToken: process.env.TWITTER_ACCESS_TOKEN,
    twitterAccessSecret: process.env.TWITTER_ACCESS_SECRET,
    port: Number(process.env.PORT) || 4000,
  };
}

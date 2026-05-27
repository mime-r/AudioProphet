import path from "node:path";
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import type { AppConfig, ScrapeTarget } from "./types.js";

dotenv.config({ path: path.resolve(import.meta.dirname, "..", ".env") });

function resolveAiProvider(): AppConfig["aiProvider"] {
  const configuredProvider = process.env.AI_PROVIDER?.toLowerCase();

  if (configuredProvider === "openai" || configuredProvider === "anthropic" || configuredProvider === "lmstudio") {
    return configuredProvider;
  }

  if (process.env.LM_STUDIO_BASE_URL) {
    return "lmstudio";
  }

  return "openai";
}

export function loadConfig(): AppConfig {
  return {
    aiProvider: resolveAiProvider(),
    aiModel: process.env.AI_MODEL,
    openaiKey: process.env.OPENAI_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL || "http://localhost:1234/v1",
    lmStudioApiKey: process.env.LM_STUDIO_API_TOKEN,
    mongodbUri: process.env.MONGODB_URI,
    mongodbDb: process.env.MONGODB_DB || "audio-prophet",
    appUrl: process.env.APP_URL || "http://localhost:3000",
    port: Number(process.env.PORT) || 4000,
    enableWebSearchEnrichment: process.env.ENRICH_WEB_SEARCH_ENRICHMENT === "true" || process.env.ENABLE_WEB_SEARCH_ENRICHMENT === "true",
  };
}

export function loadTargets(): ScrapeTarget[] {
  try {
    const targetsPath = path.resolve(import.meta.dirname, "..", "config", "targets.json");
    const raw = readFileSync(targetsPath, "utf-8");
    const targets: ScrapeTarget[] = JSON.parse(raw);
    return targets;
  } catch (error) {
    console.warn("Failed to load targets.json:", error instanceof Error ? error.message : error);
    return [];
  }
}

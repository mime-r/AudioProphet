import OpenAI from "openai";
import type { AIExtraction, AppConfig, RawPost } from "./types.js";
import { ALL_CATEGORIES } from "./types.js";

const SYSTEM_PROMPT = `You are an AI assistant for Audio Prophet, a CMS that catalogues upcoming (yet-to-be-released) audiophile products.

Your job is to analyze social media posts and forum threads to determine if they announce an upcoming audiophile product, and if so, extract structured data.

Categories: ${ALL_CATEGORIES.join(", ")}

Rules:
- Only extract data if the post is clearly about an ANNOUNCEMENT of a NEW upcoming product.
- Ignore: general discussion, reviews of existing products, sales, giveaways, hype trains, memes.
- Product name should NOT include the brand (e.g., "Nova" not "Truthear Nova").
- MSRP: extract as a plain number (e.g., "999"). Use "TBA" if not mentioned.
- Release date: extract as YYYY-MM-DD if mentioned. Leave empty if not specified.
- Notes: max 300 characters. Include driver config, specs, release window, key features.
- confidence: 0.0 to 1.0 based on how certain you are this is a real product announcement.
- If NOT a product announcement, set isProductAnnouncement: false and leave other fields empty/default.

Respond ONLY with valid JSON matching the AIExtraction interface.`;

function buildPrompt(post: RawPost): string {
  return `Analyze this ${post.platform} post for an upcoming audiophile product announcement:

Author: ${post.authorDisplayName} (@${post.author})
Date: ${post.timestamp}
URL: ${post.url}

Post content:
${post.text}

${post.images.length > 0 ? `This post contains ${post.images.length} image(s).` : ""}

Extract any product announcement details as JSON.`;
}

export function createAIClient(config: AppConfig) {
  if (config.aiProvider === "openai") {
    if (!config.openaiKey) throw new Error("OPENAI_API_KEY is required for OpenAI provider");
    return new OpenAI({ apiKey: config.openaiKey });
  }

  if (config.aiProvider === "lmstudio") {
    const baseUrl = config.lmStudioBaseUrl || "http://localhost:1234/v1";
    const apiKey = config.lmStudioApiKey || "lm-studio";

    return new OpenAI({
      apiKey,
      baseURL: baseUrl,
      dangerouslyAllowBrowser: false,
    });
  }

  throw new Error(`Unsupported AI provider: ${config.aiProvider}`);
}

export async function analyzePost(post: RawPost, config: AppConfig): Promise<AIExtraction | null> {
  const client = createAIClient(config);

  const model = config.aiModel || "microsoft/phi-3-mini-128k-instruct";

  try {
    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { role: "user" as const, content: buildPrompt(post) },
    ];

    const response =
      config.aiProvider === "openai"
        ? await client.chat.completions.create({
            model,
            messages,
            response_format: { type: "json_object" as const },
            temperature: 0.1,
            max_tokens: 1000,
          })
        : await client.chat.completions.create({
            model,
            messages,
            temperature: 0.1,
            max_tokens: 1000,
          });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as AIExtraction;

    if (!parsed.isProductAnnouncement) return null;

    const normalizeString = (value: unknown): string =>
      typeof value === "string" ? value : value == null ? "" : String(value);

    const normalizedMsp = normalizeString(parsed.msrp || "TBA").trim();

    return {
      isProductAnnouncement: true,
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0)),
      productName: normalizeString(parsed.productName).trim(),
      brand: normalizeString(parsed.brand).trim(),
      category: ALL_CATEGORIES.includes(parsed.category) ? parsed.category : "Other",
      msrp: normalizedMsp || "TBA",
      releaseDate: normalizeString(parsed.releaseDate).trim(),
      notes: normalizeString(parsed.notes).trim().slice(0, 300),
      reasoning: normalizeString(parsed.reasoning).trim(),
    };
  } catch (error) {
    console.error(`AI analysis failed for post ${post.url}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

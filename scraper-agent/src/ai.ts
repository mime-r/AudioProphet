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
  throw new Error(`Unsupported AI provider: ${config.aiProvider}`);
}

export async function analyzePost(post: RawPost, config: AppConfig): Promise<AIExtraction | null> {
  const client = createAIClient(config);

  const model = config.aiModel || "gpt-4o";

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(post) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as AIExtraction;

    if (!parsed.isProductAnnouncement) return null;

    return {
      isProductAnnouncement: true,
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0)),
      productName: (parsed.productName || "").trim(),
      brand: (parsed.brand || "").trim(),
      category: ALL_CATEGORIES.includes(parsed.category) ? parsed.category : "Other",
      msrp: (parsed.msrp || "TBA").trim(),
      releaseDate: (parsed.releaseDate || "").trim(),
      notes: (parsed.notes || "").trim().slice(0, 300),
      reasoning: (parsed.reasoning || "").trim(),
    };
  } catch (error) {
    console.error(`AI analysis failed for post ${post.url}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

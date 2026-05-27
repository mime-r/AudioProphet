import OpenAI from "openai";
import type { AIExtraction, AppConfig, RawPost } from "./types.js";
import { ALL_CATEGORIES } from "./types.js";

const SYSTEM_PROMPT = `You are an AI assistant for Audio Prophet, a CMS that catalogues upcoming (yet-to-be-released) audiophile products.

Your job is to analyze social media posts and forum threads to determine if they announce an upcoming audiophile product, and if so, extract structured data.

Categories: ${ALL_CATEGORIES.join(", ")}

Rules:
- Only extract data if the post is clearly about an ANNOUNCEMENT or DISCUSSION of a NEW/upcoming product.
- Brand: the manufacturer or company name ONLY (e.g. "Truthear", "Moondrop", "HiFiMan", "Sennheiser", "Sony"). This is separate from the product name. If the brand is not explicitly mentioned but can be inferred from context, extract it.
- Product name: the model name ONLY, without the brand prefix (e.g. "Nova" not "Truthear Nova", "Blessing 3" not "Moondrop Blessing 3").
- MSRP: SCAN THE ENTIRE POST for any pricing information. Look for: "$XXX", "USD XXX", "MSRP: $XXX", "price: $XXX", "priced at $XXX", "costs $XXX", "€XXX", "£XXX", "pre-order $XXX", "early bird $XXX", "~~$XXX~~ $YYY" (strikethrough pricing). Also check the thread title and any links. Extract as a plain number string (e.g. "999" for $999, "149" for $149.99). If a range is given (e.g. "$199-$249"), use the lower/starting price. If a presale/deposit price is given, use that. If no price is found, use "TBA".
- Release date: SCAN THE ENTIRE POST for any date or release timing. Look for: "YYYY-MM-DD", "releasing [Month] [Year]", "launch [Date]", "available [Date]", "shipping [Date]", "pre-order [Date]", "estimated [Date]", "expected [Date]", "Q1/Q2/Q3/Q4 [Year]", "[Month] [Year]". Extract as YYYY-MM-DD if a specific date is given. If only a month+year is given, format as YYYY-MM-DD (use "01" for day). If only a quarter+year is given (e.g. "Q2 2025"), estimate as the middle of that quarter. Leave empty string if no timing info at all.
- Notes: max 300 characters. Include driver config, specs (frequency response, impedance, sensitivity), release window, key features, materials, cable/connector type.
- confidence: 0.0 to 1.0 based on how certain you are this is a real product announcement.

CRITICAL: Discussion of a new product that is clearly upcoming but does not mention MSRP or release date can still be extracted — just leave those fields as "TBA" / empty string and set confidence accordingly. Do NOT skip products just because pricing is missing.
If the post is not about a product announcement or discussion of a new product, set isProductAnnouncement: false and leave other fields empty/default.

Respond ONLY with valid JSON in this exact shape:
{"isProductAnnouncement":true,"confidence":0.9,"brand":"Truthear","productName":"Nova","category":"IEMs","msrp":"149","releaseDate":"2025-03-01","notes":"Single DD IEM with beryllium-coated diaphragm.","reasoning":"Post announces a new IEM by Truthear."}`;

// - Ignore: general discussion of existing products, reviews of existing products, sales of existing products, giveaways of existing products, hype trains of existing products, memes.

function buildPrompt(post: RawPost): string {
  return `Analyze this ${post.platform} post for an upcoming audiophile product announcement. Pay special attention to extracting MSRP/price and release date if mentioned anywhere in the post.

Author: ${post.authorDisplayName} (@${post.author})
Date: ${post.timestamp}
URL: ${post.url}

Post content:
${post.text}

${post.images.length > 0 ? `This post contains ${post.images.length} image(s).` : ""}

Extract any product announcement details as JSON. Include msrp if you see any pricing ($, USD, MSRP, price, cost), and releaseDate if you see any date or timing information.`;
}

function buildAiClient(provider: AppConfig["aiProvider"], config: AppConfig) {
  if (provider === "openai") {
    if (!config.openaiKey) throw new Error("OPENAI_API_KEY is required for OpenAI provider");
    return new OpenAI({ apiKey: config.openaiKey });
  }

  if (provider === "lmstudio") {
    const baseUrl = config.lmStudioBaseUrl || "http://localhost:1234/v1";
    return new OpenAI({
      apiKey: config.lmStudioApiKey || "lm-studio",
      baseURL: baseUrl,
      dangerouslyAllowBrowser: false,
    });
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
}

export function createAIClient(config: AppConfig) {
  return buildAiClient(config.aiProvider, config);
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

    console.log(`Product Mentioned: ${parsed.productName || "N/A"}, is product announcement? ${parsed.isProductAnnouncement}, Confidence ${parsed.confidence ?? "N/A"}`);

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

import { searchGoogle } from "../search/google.js";
import { ALL_CATEGORIES, type AIExtraction, type ScrapedProduct } from "../types.js";

interface SearchOptions {
  enableImages?: boolean;
}

export async function enrichProducts(
  aiExtractions: AIExtraction[],
  options?: SearchOptions,
): Promise<ScrapedProduct[]> {
  if (!aiExtractions.length) return [];

  const enrichedProducts: ScrapedProduct[] = [];

  for (const extraction of aiExtractions) {
    const searchResult = await searchGoogle(
      extraction.productName,
      `${extraction.brand} ${extraction.category}`.trim() || extraction.productName,
    );

    const imageDataUrl = options?.enableImages ? searchResult.imageUrls[0] : undefined;

    enrichedProducts.push({
      id: `enrich-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: extraction.productName,
      brand: extraction.brand,
      category: ALL_CATEGORIES.includes(extraction.category) ? extraction.category : "Other",
      msrp: extraction.msrp || "TBA",
      releaseDate: extraction.releaseDate || "",
      notes: extraction.notes || "",
      source: "",
      sourceUrl: "",
      sourceType: "headfi",
      confidence: extraction.confidence,
      reviewed: false,
      approved: false,
      submitted: false,
      rawContent: JSON.stringify(extraction),
      imageDataUrl,
      createdAt: new Date().toISOString(),
    });
  }

  return enrichedProducts;
}

export default enrichProducts as typeof enrichProducts;


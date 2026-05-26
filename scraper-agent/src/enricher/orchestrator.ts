import { searchGoogle } from "../search/google.js";

export interface EnrichedProductInput {
  productName: string;
  brand?: string | null;
  category?: string | null;
  msrp?: string | null;
  releaseDate?: string | null;
  notes?: string | null;
  imageDataUrl?: string;
}

export async function enrichProductsFromAI(inputs: EnrichedProductInput[]): Promise<EnrichedProductInput[]> {
  if (!inputs.length) return [];

  const enrichedProducts: EnrichedProductInput[] = [];

  for (const input of inputs) {
    const searchResult = await searchGoogle(
      input.productName,
      `${input.brand || ""} ${input.category || ""}`.trim() || input.productName,
    );

    enrichedProducts.push({
      ...input,
      imageDataUrl: searchResult.imageUrls[0] || input.imageDataUrl,
    });
  }

  return enrichedProducts;
}

export default enrichProductsFromAI as typeof enrichProductsFromAI;


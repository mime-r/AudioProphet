import { MongoClient } from "mongodb";
import type { AppConfig } from "./types.js";

let client: MongoClient | null = null;

async function getMongoClient(config: AppConfig) {
  if (!config.mongodbUri) return null;
  if (!client) {
    client = new MongoClient(config.mongodbUri);
    await client.connect();
  }
  return client;
}

export async function closeMongoConnection() {
  if (client) {
    await client.close();
    client = null;
  }
}

interface ExistingProduct {
  name: string;
  brand: string;
}

export async function findExistingProducts(config: AppConfig): Promise<ExistingProduct[]> {
  const mongo = await getMongoClient(config);
  if (!mongo) {
    console.warn("MongoDB not configured — skipping dedup check");
    return [];
  }

  try {
    const db = mongo.db(config.mongodbDb || "audio-prophet");
    const collection = db.collection("products");
    const products = await collection
      .find({}, { projection: { name: 1, brand: 1, _id: 0 } })
      .toArray();

    return products.map((p: Record<string, unknown>) => ({
      name: String(p.name || ""),
      brand: String(p.brand || ""),
    }));
  } catch (error) {
    console.warn("Failed to query MongoDB for dedup:", error instanceof Error ? error.message : error);
    return [];
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isDuplicate(
  product: { name: string; brand: string },
  existing: ExistingProduct[],
): boolean {
  const normalizedName = normalize(product.name);
  const normalizedBrand = normalize(product.brand);

  return existing.some((existing) => {
    const existingName = normalize(existing.name);
    const existingBrand = normalize(existing.brand);
    return existingName === normalizedName && existingBrand === normalizedBrand;
  });
}

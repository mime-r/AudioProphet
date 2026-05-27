import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import type { ScrapedProduct } from "./types.js";

const DATA_DIR = path.resolve(import.meta.dirname, "..", "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "scraped-products.json");

async function ensureDataDir() {
  try {
    await access(DATA_DIR);
  } catch {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, data: unknown) {
  await ensureDataDir();
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function loadProducts(): Promise<ScrapedProduct[]> {
  return readJson<ScrapedProduct[]>(PRODUCTS_FILE, []);
}

export async function saveProducts(products: ScrapedProduct[]) {
  await writeJson(PRODUCTS_FILE, products);
}

export async function addProduct(product: ScrapedProduct): Promise<ScrapedProduct[]> {
  const products = await loadProducts();
  products.push(product);
  await saveProducts(products);
  return products;
}

function normalizeKey(name: string, brand: string): string {
  return `${brand}::${name}`.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function addProducts(newProducts: ScrapedProduct[]): Promise<ScrapedProduct[]> {
  const products = await loadProducts();
  const existingIds = new Set(products.map((p) => p.id));
  const existingKeys = new Set(products.map((p) => normalizeKey(p.name, p.brand)));
  let added = 0;
  for (const p of newProducts) {
    const key = normalizeKey(p.name, p.brand);
    if (!existingIds.has(p.id) && !existingKeys.has(key)) {
      products.push(p);
      existingIds.add(p.id);
      existingKeys.add(key);
      added++;
    }
  }
  await saveProducts(products);
  console.log(`  [storage] Saved ${added} new products (total: ${products.length})`);
  return products;
}

export async function updateProduct(id: string, changes: Partial<ScrapedProduct>): Promise<ScrapedProduct | null> {
  const products = await loadProducts();
  const idx = products.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  products[idx] = { ...products[idx], ...changes };
  await saveProducts(products);
  return products[idx];
}

export async function removeProduct(id: string): Promise<boolean> {
  const products = await loadProducts();
  const idx = products.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  products.splice(idx, 1);
  await saveProducts(products);
  return true;
}

export async function getProductById(id: string): Promise<ScrapedProduct | null> {
  const products = await loadProducts();
  return products.find((p) => p.id === id) ?? null;
}

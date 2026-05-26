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

export async function addProducts(newProducts: ScrapedProduct[]): Promise<ScrapedProduct[]> {
  const products = await loadProducts();
  const existingIds = new Set(products.map((p) => p.id));
  for (const p of newProducts) {
    if (!existingIds.has(p.id)) {
      products.push(p);
      existingIds.add(p.id);
    }
  }
  await saveProducts(products);
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

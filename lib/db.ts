import fs from "fs/promises";
import path from "path";
import { ProductItem, ProductStatus } from "@/lib/types";

const dbFile = path.join(process.cwd(), "data", "products.json");
const rateLimitFile = path.join(process.cwd(), "data", "rate-limit.json");

async function ensureFileExists(file: string) {
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.access(file);
  } catch {
    await fs.writeFile(file, "[]", "utf8");
  }
}

async function readJsonFile<T>(file: string): Promise<T> {
  await ensureFileExists(file);
  const json = await fs.readFile(file, "utf8");
  return JSON.parse(json) as T;
}

async function writeJsonFile<T>(file: string, data: T) {
  await ensureFileExists(file);
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

export async function readProducts(): Promise<ProductItem[]> {
  return await readJsonFile<ProductItem[]>(dbFile);
}

export async function writeProducts(products: ProductItem[]) {
  await writeJsonFile(dbFile, products);
}

export async function getAllProducts(): Promise<ProductItem[]> {
  return await readProducts();
}

export async function getPublicProducts(): Promise<ProductItem[]> {
  const products = await readProducts();
  return products.filter((item) => item.status === "Verified" || item.status === "Released");
}

export async function addProduct(newProduct: ProductItem): Promise<ProductItem> {
  const products = await readProducts();
  products.unshift(newProduct);
  await writeProducts(products);
  return newProduct;
}

export async function updateProductStatus(id: string, status: ProductStatus) {
  return await updateProduct(id, { status });
}

export async function updateProduct(id: string, changes: Partial<ProductItem>) {
  const products = await readProducts();
  const updated = products.map((item) =>
    item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item,
  );
  await writeProducts(updated);
  return updated.find((item) => item.id === id);
}

export async function deleteProduct(id: string) {
  const products = await readProducts();
  const index = products.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }

  const [deleted] = products.splice(index, 1);
  await writeProducts(products);
  return deleted;
}

interface RateLimitEntry {
  ip: string;
  timestamp: number;
}

export async function canSubmitFromIp(ip: string) {
  const entries = await readJsonFile<RateLimitEntry[]>(rateLimitFile);
  const cutoff = Date.now() - 5 * 60 * 1000;
  const recent = entries.filter((entry) => entry.ip === ip && entry.timestamp >= cutoff);
  return recent.length < 2;
}

export async function recordSubmissionAttempt(ip: string) {
  const entries = await readJsonFile<RateLimitEntry[]>(rateLimitFile);
  const cutoff = Date.now() - 5 * 60 * 1000;
  const retained = entries.filter((entry) => entry.timestamp >= cutoff);
  retained.push({ ip, timestamp: Date.now() });
  await writeJsonFile(rateLimitFile, retained);
}

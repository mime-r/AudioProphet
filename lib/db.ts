import { MongoClient } from "mongodb";
import { ProductItem, ProductStatus } from "@/lib/types";
import compressImageToLocal from "@/src/search/image-compression";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "audio-prophet";

declare global {
  // eslint-disable-next-line vars-on-top, no-var
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient> | undefined;

function getClientPromise() {
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is required.");
  }

  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect();
  }

  return clientPromise;
}

async function getDb() {
  const client = await getClientPromise();
  return client.db(dbName);
}

async function getProductsCollection() {
  return (await getDb()).collection<ProductItem>("products");
}

async function getRateLimitCollection() {
  return (await getDb()).collection<{ ip: string; timestamp: number }>("rate-limit");
}

export async function getAllProducts(): Promise<ProductItem[]> {
  const collection = await getProductsCollection();
  return await collection.find().sort({ createdAt: -1 }).toArray();
}

export async function getPublicProducts(): Promise<ProductItem[]> {
  const collection = await getProductsCollection();
  return await collection
    .find({ status: { $in: ["Verified", "Released"] } })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function addProduct(newProduct: ProductItem): Promise<ProductItem> {
  const collection = await getProductsCollection();
  
  // Compress image if present and exceeds size limit
  let product = { ...newProduct };
  if (product.imageDataUrl) {
    const isOverSize = require("@/src/search/image-compression").isImageOverSizeLimit(product.imageDataUrl);
    if (isOverSize) {
      console.log("Compressing image to under 300KB before saving...");
      product.imageDataUrl = await compressImageToLocal(product.imageDataUrl);
    }
  }
  
  await collection.insertOne(product);
  return product;
}

export async function updateProductStatus(id: string, status: ProductStatus) {
  return await updateProduct(id, { status });
}

export async function updateProduct(id: string, changes: Partial<ProductItem>) {
  const collection = await getProductsCollection();
  const existing = await collection.findOne({ id });
  
  // Compress image if updated and exceeds size limit
  let product = { ...changes };
  if (product.imageDataUrl && existing) {
    try {
      const isOverSize = require("@/src/search/image-compression").isImageOverSizeLimit(product.imageDataUrl);
      if (isOverSize) {
        console.log("Compressing image to under 300KB before saving...");
        product.imageDataUrl = await compressImageToLocal(product.imageDataUrl);
      }
    } catch (e) {
      // Silently skip compression on error, keep original image
      console.warn("Compression skipped for ID", id);
    }
  }
  
  const update: Partial<ProductItem> = { 
    ...product, 
    updatedAt: new Date().toISOString() 
  };
  await collection.updateOne({ id }, { $set: update });
  return await collection.findOne({ id });
}

export async function deleteProduct(id: string) {
  const collection = await getProductsCollection();
  const existing = await collection.findOne({ id });
  if (!existing) {
    return null;
  }
  await collection.deleteOne({ id });
  return existing;
}

export async function canSubmitFromIp(ip: string) {
  const collection = await getRateLimitCollection();
  const cutoff = Date.now() - 5 * 60 * 1000;
  const count = await collection.countDocuments({ ip, timestamp: { $gte: cutoff } });
  return count < 2;
}

export async function recordSubmissionAttempt(ip: string) {
  const collection = await getRateLimitCollection();
  const cutoff = Date.now() - 5 * 60 * 1000;
  await collection.insertOne({ ip, timestamp: Date.now() });
  await collection.deleteMany({ timestamp: { $lt: cutoff } });
}

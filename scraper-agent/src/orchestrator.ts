import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.js";
import type { AppConfig, AIExtraction, RawPost, ScrapedProduct, ScrapeResult, ScrapeTarget } from "./types.js";
import { analyzePost } from "./ai.js";
import { loadProducts, addProducts } from "./storage.js";
import { findExistingProducts, isDuplicate, closeMongoConnection } from "./dedup.js";
import { searchGoogle } from "./search/google.js";

export interface ScrapeOptions {
  targets: ScrapeTarget[];
  confidenceThreshold?: number;
  onProgress?: (msg: string) => void;
}

export interface ScrapeSessionResult {
  totalPosts: number;
  analyzedPosts: number;
  productsFound: number;
  duplicatesSkipped: number;
  results: ScrapeResult[];
}

async function processPosts(
  posts: RawPost[],
  target: ScrapeTarget,
  config: AppConfig,
  confidenceThreshold: number,
  existingProducts: Awaited<ReturnType<typeof findExistingProducts>>,
): Promise<{ products: ScrapedProduct[]; duplicatesSkipped: number }> {
  const cfg = config;
  const products: ScrapedProduct[] = [];
  const existingProductsData = await loadProducts();
  let duplicatesSkipped = 0;

  for (const post of posts) {
    const extraction: AIExtraction | null = await analyzePost(post, config);
    if (!extraction) continue;

    if (extraction.confidence < confidenceThreshold) continue;

    const source = target.url;

    const newProduct: ScrapedProduct = {
      id: randomUUID(),
      name: extraction.productName,
      brand: extraction.brand,
      category: extraction.category,
      msrp: extraction.msrp || "TBA",
      releaseDate: extraction.releaseDate,
      notes: extraction.notes.slice(0, 300),
      source,
      sourceUrl: post.url,
      sourceType: target.platform,
      confidence: extraction.confidence,
      reviewed: false,
      approved: false,
      submitted: false,
      createdAt: new Date().toISOString(),
      rawContent: post.text.slice(0, 1000),
    };

    const isDupInDb = isDuplicate(newProduct, existingProducts);
    const isDupInLocal = isDuplicate(
      newProduct,
      existingProductsData.map((p) => ({ name: p.name, brand: p.brand })),
    );

    if (isDupInDb || isDupInLocal) {
      duplicatesSkipped += 1;
      continue;
    }

    products.push(newProduct);
  }

  if (cfg.enableWebSearchEnrichment) {
    for (const product of products) {
      const searchResult = await searchGoogle(product.name, `${product.brand} ${product.category}`);
      if (searchResult.imageUrls[0]) {
        product.imageDataUrl = searchResult.imageUrls[0];
      }
    }
  }

  return { products, duplicatesSkipped };
}

export async function runScrapeSession(
  options: ScrapeOptions,
  config?: AppConfig,
): Promise<ScrapeSessionResult> {
  const cfg = config || loadConfig();
  const confidenceThreshold = options.confidenceThreshold ?? 0.5;
  const results: ScrapeResult[] = [];

  let totalPosts = 0;
  let analyzedPosts = 0;
  let productsFound = 0;
  let duplicatesSkipped = 0;

  options.onProgress?.("Connecting to MongoDB for dedup check...");
  const existingProducts = await findExistingProducts(cfg);

  for (const target of options.targets) {
    options.onProgress?.(`Scraping ${target.platform}: ${target.name}...`);

    let posts: RawPost[] = [];
    let error: string | undefined;

    if (target.platform === "headfi") {
      const { scrapeHeadFiForum } = await import("./scrapers/headfi.js");
      const result = await scrapeHeadFiForum(target, cfg);
      posts = result.posts;
      error = result.error;
    } else if (target.platform === "web") {
      const { scrapeWebAnnouncements } = await import("./scrapers/web.js");
      const result = await scrapeWebAnnouncements(target);
      posts = result.posts;
      error = result.error;
    } else {
      error = `Unsupported scraper platform: ${target.platform}`;
    }

    totalPosts += posts.length;

    options.onProgress?.(`Analyzing ${posts.length} posts from ${target.name} with AI...`);
    const { products: scrapedProducts, duplicatesSkipped: skippedDuplicates } = await processPosts(
      posts,
      target,
      cfg,
      confidenceThreshold,
      existingProducts,
    );

    analyzedPosts += posts.length;
    productsFound += scrapedProducts.length;
    duplicatesSkipped += skippedDuplicates;

    await addProducts(scrapedProducts);

    results.push({ target, posts, products: scrapedProducts, error });
  }

  await closeMongoConnection();

  return {
    totalPosts,
    analyzedPosts,
    productsFound,
    duplicatesSkipped,
    results,
  };
}

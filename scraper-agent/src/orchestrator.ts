import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.js";
import type { AppConfig, AIExtraction, RawPost, ScrapedProduct, ScrapeResult, ScrapeTarget } from "./types.js";
import { analyzePost } from "./ai.js";
import { loadProducts, addProducts } from "./storage.js";
import { findExistingProducts, isDuplicate, closeMongoConnection } from "./dedup.js";
import { searchGoogle } from "./search/google.js";
import { searchGoogleWeb } from "./search/google-web.js";
import { searchRetailers } from "./enrichment/retailers.js";

const MAX_IMAGE_BYTES = 300_000;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AudioProphet/1.0)" },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) return null;
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:${contentType.split(";")[0]};base64,${base64}`;
  } catch {
    return null;
  }
}

const MSRP_RE = /(?:MSRP|price|cost|usd)\s*[:\$]?\s*\$?(\d+(?:\.\d{2})?)/i;
const DATE_ISO_RE = /(\d{4}-\d{2}-\d{2})/;
const DATE_TEXT_RE = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s*(\d{4})/i;

function extractMsrpFromText(text: string): string | null {
  const m = text.match(MSRP_RE);
  return m ? m[1] : null;
}

function extractDateFromText(text: string): string | null {
  const iso = text.match(DATE_ISO_RE);
  if (iso) return iso[1];
  const textMatch = text.match(DATE_TEXT_RE);
  if (textMatch) {
    const months: Record<string, string> = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
    const month = months[textMatch[1].toLowerCase().slice(0, 3)];
    const day = textMatch[2].padStart(2, "0");
    return `${textMatch[3]}-${month}-${day}`;
  }
  return null;
}

async function enrichMissingFields(product: ScrapedProduct, config: AppConfig): Promise<void> {
  const needsBrand = !product.brand;
  const needsMsrp = !product.msrp || product.msrp === "TBA";
  const needsReleaseDate = !product.releaseDate;
  const needsNotes = !product.notes;

  if (!needsBrand && !needsMsrp && !needsReleaseDate && !needsNotes) return;

  const searchBase = [product.brand, product.name].filter(Boolean).join(" ");

  // 1. Retailer search for MSRP (most reliable for pricing)
  if (needsMsrp) {
    const result = await searchRetailers(product.name, product.brand);
    if (result) {
      product.msrp = result.price;
      if (result.releaseDate && !product.releaseDate) product.releaseDate = result.releaseDate;
      if (result.notes && !product.notes) product.notes = result.notes.slice(0, 300);
      console.log(`  [enrich] MSRP found via ${result.retailer}: \$${result.price}`);
    }
  }
  const msrpFound = !needsMsrp || (!!product.msrp && product.msrp !== "TBA");

  // 2. DDG searches for missing fields
  const searches: { field: string; terms: string[] }[] = [];
  searches.push({ field: "msrp", terms: ["price", "MSRP", "cost"] });
  if (needsReleaseDate) searches.push({ field: "releaseDate", terms: ["release date", "launch", "release"] });
  if (needsNotes) searches.push({ field: "notes", terms: ["specifications", "features", "driver"] });
  if (needsBrand) searches.push({ field: "brand", terms: ["brand", "manufacturer"] });

  const allSnippets: { text: string; tag: string }[] = [];
  for (const search of searches) {
    for (const term of search.terms) {
      const query = `"${searchBase}" ${term}`;
      const snippets = await searchGoogleWeb(query);
      await delay(800);
      for (const s of snippets) {
        allSnippets.push({ text: s, tag: `[${search.field} search: "${term}"]` });
      }
    }
  }

  // Regex fallback on concatenated snippets
  const allText = allSnippets.map((s) => s.text).join(" ");
  if (!msrpFound) {
    const r = extractMsrpFromText(allText);
    if (r) product.msrp = r;
  }
  if (needsReleaseDate && !product.releaseDate) {
    const r = extractDateFromText(allText);
    if (r) product.releaseDate = r;
  }
}
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
    console.log(`  → Product queued: ${newProduct.brand} ${newProduct.name} (confidence: ${newProduct.confidence})`);
  }

  if (cfg.enableWebSearchEnrichment) {
    console.log(`  [enrich] Running enrichment for ${products.length} products...`);
    for (const product of products) {
      console.log(`  [enrich] Processing "${product.brand} ${product.name}"...`);

      await enrichMissingFields(product, cfg);

      const imageQuery = [product.brand, product.name, product.category].filter(Boolean).join(" ");
      const searchResult = await searchGoogle(product.name, imageQuery);

      if (searchResult.imageUrls.length === 0) {
        console.warn(`  [enrich] No images found for "${product.brand} ${product.name}"`);
        continue;
      }

      for (const url of searchResult.imageUrls) {
        if (url.startsWith("data:image/")) {
          product.imageDataUrl = url;
          console.log(`  [enrich] Image set (inline data) for "${product.brand} ${product.name}"`);
          break;
        }
        const dataUrl = await fetchImageAsDataUrl(url);
        if (dataUrl) {
          product.imageDataUrl = dataUrl;
          console.log(`  [enrich] Image fetched for "${product.brand} ${product.name}"`);
          break;
        }
      }

      if (!product.imageDataUrl) {
        console.warn(`  [enrich] Failed to fetch any image for "${product.brand} ${product.name}"`);
      }
    }
  } else {
    console.log("  [enrich] Web search enrichment is disabled (enableWebSearchEnrichment != true)");
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

    console.log(`  → Saving ${scrapedProducts.length} products from ${target.name} to storage...`);
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

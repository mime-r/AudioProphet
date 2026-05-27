import { loadConfig } from "./config.js";
import type { AppConfig, ScrapedProduct } from "./types.js";
import { loadProducts, saveProducts } from "./storage.js";
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

async function enrichMissingFields(product: ScrapedProduct, config: AppConfig): Promise<boolean> {
  const needsBrand = !product.brand;
  const needsMsrp = !product.msrp || product.msrp === "TBA";
  const needsReleaseDate = !product.releaseDate;
  const needsNotes = !product.notes;

  if (!needsBrand && !needsMsrp && !needsReleaseDate && !needsNotes) {
    return false;
  }

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
      console.log(`  [enrich] Searching: ${query}`);
      const snippets = await searchGoogleWeb(query);
      await delay(800);
      for (const s of snippets) {
        allSnippets.push({ text: s, tag: `[${search.field} search: "${term}"]` });
      }
    }
  }

  // Regex fallback on concatenated snippets
  const allText = allSnippets.map((s) => s.text).join(" ");
  let changed = false;
  if (!msrpFound) {
    const r = extractMsrpFromText(allText);
    if (r) { product.msrp = r; changed = true; }
  }
  if (needsReleaseDate && !product.releaseDate) {
    const r = extractDateFromText(allText);
    if (r) { product.releaseDate = r; changed = true; }
  }

  if (changed) {
    console.log(`  [enrich] Updated fields for "${product.brand} ${product.name}"`);
  }
  return changed;
}

async function enrichImage(product: ScrapedProduct): Promise<boolean> {
  const imageQuery = [product.brand, product.name, product.category].filter(Boolean).join(" ");
  console.log(`  [enrich] Searching image: "${imageQuery}"`);
  const searchResult = await searchGoogle(product.name, imageQuery);

  if (searchResult.imageUrls.length === 0) {
    console.warn(`  [enrich] No images found for "${product.brand} ${product.name}"`);
    return false;
  }

  for (const url of searchResult.imageUrls) {
    if (url.startsWith("data:image/")) {
      product.imageDataUrl = url;
      console.log(`  [enrich] Image set (inline data) for "${product.brand} ${product.name}"`);
      return true;
    }
    const dataUrl = await fetchImageAsDataUrl(url);
    if (dataUrl) {
      product.imageDataUrl = dataUrl;
      console.log(`  [enrich] Image fetched for "${product.brand} ${product.name}"`);
      return true;
    }
  }

  console.warn(`  [enrich] Failed to fetch any image for "${product.brand} ${product.name}"`);
  return false;
}

async function main() {
  console.log("=".repeat(60));
  console.log("  Audio Prophet - Enrich Existing Products");
  console.log("  Runs Google search enrichment on already-scraped products");
  console.log("=".repeat(60));
  console.log();

  const config = loadConfig();

  if (!config.enableWebSearchEnrichment) {
    console.error("ERROR: ENABLE_WEB_SEARCH_ENRICHMENT is not set to 'true' in scraper-agent/.env");
    console.error("Please add or set: ENABLE_WEB_SEARCH_ENRICHMENT=true");
    process.exit(1);
  }

  console.log(`AI provider: ${config.aiProvider}`);
  if (config.aiModel) console.log(`AI model: ${config.aiModel}`);
  console.log();

  const products = await loadProducts();
  console.log(`Loaded ${products.length} products from scraped-products.json\n`);

  let fieldsEnriched = 0;
  let imagesEnriched = 0;
  let errors = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`[${i + 1}/${products.length}] "${product.brand} ${product.name}" (${product.category})`);

    try {
      const enriched = await enrichMissingFields(product, config);
      if (enriched) fieldsEnriched++;
    } catch (err) {
      console.error(`  [error] Field enrichment failed:`, err);
      errors++;
    }

    try {
      const imageSet = await enrichImage(product);
      if (imageSet) imagesEnriched++;
    } catch (err) {
      console.error(`  [error] Image enrichment failed:`, err);
      errors++;
    }

    console.log();
  }

  console.log("=".repeat(60));
  console.log("ENRICHMENT COMPLETE");
  console.log("=".repeat(60));
  console.log(`  Products processed:  ${products.length}`);
  console.log(`  Fields enriched:     ${fieldsEnriched}`);
  console.log(`  Images added:        ${imagesEnriched}`);
  console.log(`  Errors:              ${errors}`);
  console.log();

  await saveProducts(products);
  console.log(`Saved ${products.length} products back to scraped-products.json`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

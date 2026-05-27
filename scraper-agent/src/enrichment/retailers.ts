import * as cheerio from "cheerio";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
];

let uaIndex = 0;
function rotateUA(): string {
  return USER_AGENTS[uaIndex++ % USER_AGENTS.length];
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Retailer config ----------

interface RetailerConfig {
  name: string;
  searchUrl: string;
  productLinkSel: string;
}

const RETAILERS: RetailerConfig[] = [
  { name: "Linsoul", searchUrl: "https://www.linsoul.com/search?q=${query}&type=product", productLinkSel: "a[href*='/products/']" },
  { name: "ShenzhenAudio", searchUrl: "https://www.shenzhenaudio.com/search?q=${query}", productLinkSel: "a[href*='/products/']" },
  { name: "HiFiGo", searchUrl: "https://hifigo.com/search?q=${query}&type=product", productLinkSel: "a[href*='/products/']" },
  { name: "Headphones.com", searchUrl: "https://www.headphones.com/search?q=${query}", productLinkSel: "a[href*='/products/']" },
  { name: "Drop", searchUrl: "https://drop.com/search?q=${query}", productLinkSel: "a[href*='/buy/'], a[href*='/products/']" },
];

// ---------- Helpers ----------

function isLikelyProductLink(href: string): boolean {
  const exclusions = ["/cart", "/account", "/collections", "/pages", "/blogs", "/policies"];
  return !exclusions.some((e) => href.includes(e));
}

function normalizeUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

// Extract product-detail URLs from search-result HTML
function extractProductLinks($: cheerio.Root, retailer: RetailerConfig, baseUrl: string): string[] {
  const seen = new Set<string>();
  const links: string[] = [];

  $(retailer.productLinkSel).each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const full = normalizeUrl(href, baseUrl);
    if (full && !seen.has(full) && isLikelyProductLink(full)) {
      seen.add(full);
      links.push(full);
    }
  });

  return links.slice(0, 5); // top 5 results
}

// ---------- Product-page scraping ----------

interface ProductPageData {
  price?: string;
  releaseDate?: string;
  notes?: string;
  pageTitle?: string;
}

const DATE_ISO_RE = /(\d{4}-\d{2}-\d{2})/;
const DATE_TEXT_RE = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s*(\d{4})/i;
const RELEASE_KEYWORDS = /\b(release|launch|available|shipping|pre-?order|coming)\s*(date|on|:\s*)?/i;

function extractDateFromText(text: string): string | null {
  const iso = text.match(DATE_ISO_RE);
  if (iso) return iso[1];
  const m = text.match(DATE_TEXT_RE);
  if (m) {
    const months: Record<string, string> = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
    return `${m[3]}-${months[m[1].toLowerCase().slice(0, 3)]}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

// Try to parse Shopify JSON-LD embedded on product pages
function parseJsonLd($: cheerio.Root): ProductPageData | null {
  const data: ProductPageData = {};

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      if (json["@type"] === "Product" || json["@type"]?.includes("Product")) {
        if (json.name) data.pageTitle = json.name;
        if (json.description) data.notes = json.description;

        const offer = Array.isArray(json.offers) ? json.offers[0] : json.offers;
        if (offer?.price) data.price = String(Math.round(Number(offer.price)));
      }
    } catch { /* skip invalid JSON blocks */ }
  });

  return data.pageTitle ? data : null;
}

// Extract price from common Shopify meta tags / CSS patterns
function extractPriceFromPage($: cheerio.Root): string | undefined {
  const metaPrice = $('meta[property="product:price:amount"]').attr("content")
    ?? $('meta[itemprop="price"]').attr("content")
    ?? $('meta[name="twitter:data1"]').attr("content");
  if (metaPrice) return String(Math.round(Number(metaPrice)));

  const priceText = $(".price-item--regular, .price__regular .price-item, .product__price, [data-product-price], .money").first().text().trim();
  const m = priceText.match(/\$?(\d+(?:\.\d{2})?)/);
  if (m) return String(Math.round(Number(m[1])));
}

// Full-text search for release date in product description / body
function extractReleaseDateFromPage($: cheerio.Root): string | undefined {
  const bodyText = $("body").text();

  const releaseMatch = bodyText.match(RELEASE_KEYWORDS);
  if (releaseMatch) {
    const around = bodyText.slice(Math.max(0, releaseMatch.index! - 50), releaseMatch.index! + 200);
    const date = extractDateFromText(around);
    if (date) return date;
  }

  return extractDateFromText(bodyText) ?? undefined;
}

function extractNotesFromPage($: cheerio.Root): string | undefined {
  const desc = $('meta[name="description"]').attr("content")
    ?? $(".product__description, .product-description, [data-product-description]").text().trim()
    ?? $("#product-description").text().trim();
  return desc ? desc.slice(0, 300) : undefined;
}

function scoreProductPage(pageTitle: string, searchWords: string[]): number {
  const t = pageTitle.toLowerCase();
  let matches = 0;
  for (const w of searchWords) {
    if (t.includes(w.toLowerCase())) matches++;
  }
  return matches;
}

async function scrapeProductPage(url: string, searchWords: string[]): Promise<ProductPageData | null> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": rotateUA(),
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!resp.ok) return null;
  const html = await resp.text();
  const $ = cheerio.load(html);

  // Best source: JSON-LD
  const jsonld = parseJsonLd($);
  const pageTitle = jsonld?.pageTitle ?? $("title").text().trim() ?? $('meta[property="og:title"]').attr("content") ?? "";
  const score = scoreProductPage(pageTitle, searchWords);
  if (score < Math.ceil(searchWords.length / 2)) return null;

  const data: ProductPageData = { pageTitle };
  data.price = jsonld?.price ?? extractPriceFromPage($);
  data.notes = jsonld?.notes ?? extractNotesFromPage($);
  data.releaseDate = extractReleaseDateFromPage($);
  return data;
}

// ---------- Main exported function ----------

export interface RetailerResult {
  price: string;
  releaseDate?: string;
  notes?: string;
  retailer: string;
  url?: string;
}

export async function searchRetailers(productName: string, brand?: string): Promise<RetailerResult | null> {
  const terms = [brand, productName].filter(Boolean);
  const searchQuery = terms.join(" ");
  const searchWords = productName.split(/\s+/).concat(brand ? brand.split(/\s+/) : []);

  for (const retailer of RETAILERS) {
    try {
      // Step 1: Search → get product links
      const searchUrl = retailer.searchUrl.replace("${query}", encodeURIComponent(searchQuery));
      const searchResp = await fetch(searchUrl, {
        headers: { "User-Agent": rotateUA(), Accept: "text/html", "Accept-Language": "en-US,en;q=0.5" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!searchResp.ok) continue;

      const searchHtml = await searchResp.text();
      const $search = cheerio.load(searchHtml);
      const productLinks = extractProductLinks($search, retailer, searchUrl);

      if (!productLinks.length) continue;
      console.log(`  [retailer] ${retailer.name}: ${productLinks.length} product links found`);

      // Step 2: Crawl each product page
      let best: ProductPageData | null = null;
      let bestUrl: string | null = null;
      let bestScore = 0;

      for (const link of productLinks) {
        await delay(600);
        try {
          const pageData = await scrapeProductPage(link, searchWords);
          if (!pageData) continue;

          const score = scoreProductPage(pageData.pageTitle ?? "", searchWords);
          if (score > bestScore) {
            bestScore = score;
            best = pageData;
            bestUrl = link;
          }
        } catch { /* skip bad product pages */ }
      }

      if (best?.price) {
        console.log(`  [retailer] ${retailer.name}: found \$${best.price} for "${searchQuery}"`);
        return {
          price: best.price,
          releaseDate: best.releaseDate,
          notes: best.notes,
          retailer: retailer.name,
          url: bestUrl ?? undefined,
        };
      }
    } catch { /* retailer search failed */ }
  }

  return null;
}

// Backward-compat wrapper
export async function searchRetailersMsrp(productName: string, brand?: string): Promise<{ price: string; retailer: string } | null> {
  const r = await searchRetailers(productName, brand);
  return r ? { price: r.price, retailer: r.retailer } : null;
}

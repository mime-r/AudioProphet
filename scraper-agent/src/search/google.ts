import { chromium } from "playwright";

interface GoogleSearchResult {
  imageUrls: string[];
}

function isLikelyProductImage(src: string): boolean {
  if (!src || src.length < 20) return false;
  if (src.startsWith("data:image/svg+xml") || src.includes("data:image/svg+xml")) return false;
  if (src.includes("pixel") || src.includes("spacer") || src.includes("transparent")) return false;
  if (src.includes("/icon") || src.includes("/logo") || src.includes("/favicon")) return false;
  if (src.includes("badge") || src.includes("avatar") || src.includes("profile")) return false;
  if (!src.startsWith("http") && !src.startsWith("data:image/")) return false;
  return true;
}

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

async function fetchImageApi(searchTerm: string): Promise<GoogleSearchResult> {
  try {
    // Step 1: Get vqd token from the search page
    const searchResp = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(searchTerm)}&iax=images&ia=images`,
      { headers: FETCH_HEADERS, signal: AbortSignal.timeout(15_000) },
    );
    if (!searchResp.ok) {
      console.warn(`[image-api] Search page returned ${searchResp.status}`);
      return { imageUrls: [] };
    }
    const html = await searchResp.text();

    // Extract vqd token from the page
    const vqdMatch = html.match(/vqd=([\d-]+)/);
    if (!vqdMatch?.[1]) {
      console.warn(`[image-api] Could not extract vqd token`);
      return { imageUrls: [] };
    }
    const vqd = vqdMatch[1];

    // Step 2: Call the image API with the vqd token
    const apiResp = await fetch(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(searchTerm)}&vqd=${vqd}&iax=images&ia=images&sp=1`,
      {
        headers: {
          ...FETCH_HEADERS,
          Referer: `https://duckduckgo.com/`,
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!apiResp.ok) {
      console.warn(`[image-api] API returned ${apiResp.status}`);
      return { imageUrls: [] };
    }

    const data = (await apiResp.json()) as { results?: Array<{ image: string; thumbnail: string; url: string; title: string }> };
    const urls = (data.results ?? [])
      .map((r) => r.image)
      .filter((u): u is string => Boolean(u) && u.startsWith("http"))
      .filter(isLikelyProductImage)
      .slice(0, 5);

    if (urls.length > 0) {
      console.log(`[image-api] Found ${urls.length} images via API for "${searchTerm}"`);
      return { imageUrls: urls };
    }

    console.warn(`[image-api] No image URLs in API response for "${searchTerm}"`);
    return { imageUrls: [] };
  } catch (error) {
    console.warn(`[image-api] Failed for "${searchTerm}":`, error instanceof Error ? error.message : error);
    return { imageUrls: [] };
  }
}

async function searchViaPlaywright(searchTerm: string): Promise<GoogleSearchResult> {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    // Hide automation detection
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    await page.setExtraHTTPHeaders({
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    });

    await page.goto(
      `https://duckduckgo.com/?q=${encodeURIComponent(searchTerm)}&iax=images&ia=images`,
      { waitUntil: "networkidle", timeout: 30_000 },
    );

    await page.waitForTimeout(4000);

    const imageUrls = await page.evaluate(() => {
      const result = new Set<string>();
      const skip = ["svg", "pixel", "icon", "logo", "favicon", "avatar", "badge", "spacer", "profile"];

      const tryAdd = (src: string | null) => {
        if (!src || !src.startsWith("http")) return;
        const clean = src.split("?")[0];
        if (clean.length < 20) return;
        for (const p of skip) {
          if (clean.includes(p)) return;
        }
        result.add(src);
      };

      // DuckDuckGo image tiles
      const tileSelectors = [
        ".tile img",
        ".tile--img img",
        ".tile__img",
        ".images__grid img",
        "[class*='tile'] img",
        "[class*='image'] img",
      ];
      for (const sel of tileSelectors) {
        document.querySelectorAll(sel).forEach((el) => {
          tryAdd(el.getAttribute("data-src"));
          tryAdd(el.getAttribute("src"));
        });
        if (result.size >= 5) break;
      }

      // Main results area
      if (result.size < 5) {
        const mainArea = document.querySelector("#react-layout, #vertical_wrapper, .results--main, [data-testid='mainline']");
        if (mainArea) {
          mainArea.querySelectorAll("img").forEach((img) => {
            tryAdd(img.getAttribute("data-src"));
            tryAdd(img.getAttribute("src"));
          });
        }
      }

      // Fallback: all images
      if (result.size < 3) {
        document.querySelectorAll("img").forEach((img) => {
          const src = img.getAttribute("data-src") || img.getAttribute("src") || "";
          if (src.startsWith("http") && !src.includes("svg") && !src.includes("pixel")) {
            tryAdd(src);
          }
        });
      }

      return Array.from(result).slice(0, 5);
    });

    const validUrls = imageUrls.filter(isLikelyProductImage);
    if (validUrls.length > 0) {
      console.log(`[image-pw] Found ${validUrls.length} images via Playwright for "${searchTerm}"`);
    } else {
      console.warn(`[image-pw] No images found via Playwright for "${searchTerm}"`);
    }
    return { imageUrls: validUrls };
  } catch (error) {
    console.warn(`[image-pw] Failed for "${searchTerm}":`, error instanceof Error ? error.message : error);
    return { imageUrls: [] };
  } finally {
    await browser?.close();
  }
}

export async function searchGoogle(productName: string, query?: string): Promise<GoogleSearchResult> {
  const searchTerm = query || `audiophile ${productName}`;

  // Try DuckDuckGo's image API first (no browser needed, avoids bot detection)
  const apiResult = await fetchImageApi(searchTerm);
  if (apiResult.imageUrls.length > 0) return apiResult;

  // Fallback: Playwright with stealth measures
  console.log(`[image-search] API failed, trying Playwright fallback...`);
  return await searchViaPlaywright(searchTerm);
}

export default searchGoogle as typeof searchGoogle;

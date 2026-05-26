import { chromium } from "playwright";

interface GoogleSearchResult {
  imageUrls: string[];
}

function isValidImageSource(src: string | null | undefined): src is string {
  if (!src) return false;
  if (src.includes("broken") || src.includes("error") || src.includes("404")) return false;
  if (src.startsWith("data:image/svg+xml")) return false;
  return true;
}

export async function searchGoogle(productName: string, query?: string): Promise<GoogleSearchResult> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const searchTerm = query || `audiophile ${productName}`;
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(searchTerm)}&tbm=isch`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    await page.waitForTimeout(1500);

    const imageUrls = await page.$$eval("img", (images) => {
      const urls = new Set<string>();

      for (const image of images) {
        const src = image.getAttribute("src") || image.getAttribute("data-src") || image.getAttribute("data-iurl");
        if (!src) continue;

        if (src.startsWith("http") || src.startsWith("data:image/")) {
          urls.add(src);
        }
      }

      return Array.from(urls).slice(0, 3);
    });

    return {
      imageUrls: imageUrls.filter(isValidImageSource),
    };
  } catch (error) {
    console.warn("Google image search failed:", error instanceof Error ? error.message : error);
    return { imageUrls: [] };
  } finally {
    await browser.close();
  }
}

export default searchGoogle as typeof searchGoogle;

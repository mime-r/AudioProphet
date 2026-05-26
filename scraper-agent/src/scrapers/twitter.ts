import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import type { AppConfig, RawPost, ScrapeTarget } from "../types.js";

export async function scrapeTwitterProfile(
  target: ScrapeTarget,
  config: AppConfig & { twitterCookiesPath?: string },
): Promise<{ posts: RawPost[]; error?: string }> {
  console.log(`\nScraping Twitter/X profile: ${target.name} (${target.url})`);

  let cookies: { name: string; value: string; domain: string; path: string }[] = [];

  if (config.twitterCookiesPath) {
    try {
      const raw = await readFile(config.twitterCookiesPath, "utf-8");
      const parsed = JSON.parse(raw);
      cookies = parsed.map((c: any) => ({
        name: c.name,
        value: c.value,
        domain: c.domain || ".x.com",
        path: c.path || "/",
      }));
    } catch (err) {
      const msg = `Failed to load Twitter cookies from ${config.twitterCookiesPath}. Twitter scraping requires authentication cookies.`;
      console.warn(msg);
      return { posts: [], error: msg };
    }
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
    });

    if (cookies.length > 0) {
      await context.addCookies(cookies);
    }

    const page = await context.newPage();

    await page.goto(target.url, { waitUntil: "networkidle", timeout: 30000 });

    await page.waitForTimeout(3000);

    const hasLoginWall = await page.$('[data-testid="login"]');
    if (hasLoginWall && cookies.length === 0) {
      await browser.close();
      return {
        posts: [],
        error: "Twitter requires login. Provide cookies via TWITTER_COOKIES_PATH.",
      };
    }

    const scrollAttempts = 5;
    for (let i = 0; i < scrollAttempts; i++) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(2000);
    }

    const rawResults = await page.$$eval(
      'article [data-testid="tweetText"]',
      (elements) =>
        elements.map((el) => {
          const article = el.closest("article");
          if (!article) return null;

          const text = el.textContent || "";

          const timeEl = article.querySelector("time");
          const timestamp = timeEl?.getAttribute("datetime") || "";

          const authorEl = article.querySelector('[data-testid="User-Name"] a');
          const author = authorEl?.textContent?.replace("@", "").trim() || "";

          const authorDisplayEl = article.querySelector('[data-testid="User-Name"]');
          const authorDisplayName =
            authorDisplayEl?.querySelector("span")?.textContent?.trim() || author;

          const linkEl = article.querySelector('a[href*="/status/"]');
          const tweetUrl = (linkEl as HTMLAnchorElement)?.href || "";

          const imageEls = article.querySelectorAll('img[src*="media"]');
          const images: string[] = [];
          imageEls.forEach((img) => {
            const src = (img as HTMLImageElement).src;
            if (src && !src.includes("profile_images")) images.push(src);
          });

          return {
            text,
            url: tweetUrl,
            author,
            authorDisplayName,
            timestamp,
            images,
          };
        }),
    );

    const posts: RawPost[] = rawResults.filter(
      (r): r is RawPost =>
        r !== null && r.text.length > 10 && r.text.length < 5000,
    );

    const uniquePosts = posts.filter(
      (p, i, self) => i === self.findIndex((x) => x.url === p.url && x.url !== ""),
    );

    console.log(`  Found ${uniquePosts.length} tweets from ${target.name}`);
    return { posts: uniquePosts };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error during Twitter scrape";
    console.error(`  Error scraping ${target.name}:`, msg);
    return { posts: [], error: msg };
  } finally {
    await browser.close();
  }
}

import { chromium } from "playwright";
import * as cheerio from "cheerio";
import type { AppConfig, RawPost, ScrapeTarget } from "../types.js";

function truncateText(text: string, maxLength: number = 4000): string {
  return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
}

function extractThreadId(url: string): string | null {
  const match = url.match(/\/threads\/[^/]+\.(\d+)/);
  return match ? match[1] : null;
}

function extractPageNumber(url: string): number {
  const match = url.match(/page-(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

async function scrapeHeadFiThreadPage(
  url: string,
  browser: any,
): Promise<{ posts: RawPost[]; nextPageUrl: string | null }> {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    const html = await page.content();
    const $ = cheerio.load(html);

    const posts: RawPost[] = [];
    const baseUrl = new URL(url);
    const threadMatch = url.match(/\/threads\/[^/]+\.(\d+)/);
    const threadId = threadMatch ? threadMatch[1] : "";

    const threadTitle = $("h1").first().text().trim() || $(".titleBar h1").text().trim() || "";

    $("article, .message, li.message, div.messageContent, .messageInfo").each((_i, el) => {
      const $el = $(el);

      const authorEl = $el.find(".username, .messageAuthor, a.username");
      const author = authorEl.first().text().trim() || "unknown";

      const authorDisplayName = author;

      const contentEl = $el.find(
        ".messageContent, .message-body, .bbCodeBlock, .messageText",
      );
      let text = contentEl.text().trim();

      if (!text) {
        text = $el.text().trim();
      }

      if (text.length < 20) return;

      const timeEl = $el.find("time, .dateTime, abbr.DateTime");
      const timestamp = timeEl.attr("datetime") || timeEl.attr("data-time") || timeEl.text().trim() || "";

      const postId = $el.attr("id") || "";
      const postUrl = postId
        ? `${baseUrl.origin}/threads/${threadId}/page-${extractPageNumber(url)}#${postId}`
        : url;

      const images: string[] = [];
      $el.find("img").each((_j, img) => {
        const src = $(img).attr("src");
        if (src && !src.includes("smilie") && !src.includes("avatar") && !src.includes("logo")) {
          images.push(src.startsWith("//") ? `https:${src}` : src);
        }
      });

      posts.push({
        text: truncateText(`${threadTitle ? `[Thread: ${threadTitle}] ` : ""}${text}`),
        url: postUrl,
        author,
        authorDisplayName,
        platform: "headfi",
        timestamp,
        images,
      });
    });

    const nextLink = $('a[rel="next"], .pageNav a:contains("Next"), a.text:contains("Next")');
    let nextPageUrl: string | null = null;
    if (nextLink.length > 0) {
      const href = nextLink.first().attr("href");
      if (href) {
        nextPageUrl = href.startsWith("http") ? href : `${baseUrl.origin}${href}`;
      }
    }

    return { posts, nextPageUrl };
  } catch (error) {
    console.error(`  Error scraping Head-Fi page ${url}:`, error instanceof Error ? error.message : error);
    return { posts: [], nextPageUrl: null };
  } finally {
    await context.close();
  }
}

export async function scrapeHeadFiForum(
  target: ScrapeTarget,
  config: AppConfig,
  maxPages: number = 5,
): Promise<{ posts: RawPost[]; error?: string }> {
  console.log(`\nScraping Head-Fi: ${target.name} (${target.url})`);

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
    });

    if (target.url.includes("/threads/")) {
      const allPosts: RawPost[] = [];
      let currentUrl: string | null = target.url;
      let pageCount = 0;

      while (currentUrl && pageCount < maxPages) {
        pageCount++;
        console.log(`  Fetching page ${pageCount}...`);
        const result = await scrapeHeadFiThreadPage(currentUrl, browser);
        allPosts.push(...result.posts);
        currentUrl = result.nextPageUrl;
      }

      const uniquePosts = allPosts.filter(
        (p, i, self) => i === self.findIndex((x) => x.url === p.url && x.url !== ""),
      );

      console.log(`  Found ${uniquePosts.length} forum posts from ${target.name}`);
      return { posts: uniquePosts };
    }

    if (target.url.includes("/forums/")) {
      const page = await context.newPage();
      await page.goto(target.url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);

      const html = await page.content();
      const $ = cheerio.load(html);

      const threadLinks: string[] = [];
      $('a[href*="/threads/"]').each((_i, el) => {
        const href = $(el).attr("href");
        if (href && href.includes("/threads/")) {
          const fullUrl = href.startsWith("http")
            ? href
            : `${new URL(target.url).origin}${href}`;
          if (!threadLinks.includes(fullUrl)) {
            threadLinks.push(fullUrl);
          }
        }
      });

      const limitedLinks = threadLinks.slice(0, 10);
      console.log(`  Found ${limitedLinks.length} thread links in forum`);

      const allPosts: RawPost[] = [];
      for (const threadUrl of limitedLinks) {
        console.log(`  Scraping thread: ${threadUrl}`);
        const result = await scrapeHeadFiThreadPage(threadUrl, browser);
        allPosts.push(...result.posts);
      }

      const uniquePosts = allPosts.filter(
        (p, i, self) => i === self.findIndex((x) => x.url === p.url && x.url !== ""),
      );

      console.log(`  Found ${uniquePosts.length} forum posts from ${target.name}`);
      return { posts: uniquePosts };
    }

    return { posts: [], error: "Unsupported Head-Fi URL format. Use a thread or forum URL." };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error during Head-Fi scrape";
    console.error(`  Error scraping ${target.name}:`, msg);
    return { posts: [], error: msg };
  } finally {
    await browser.close();
  }
}

import * as cheerio from "cheerio";
import type { AppConfig, RawPost, ScrapeTarget } from "../types.js";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
  "Cache-Control": "max-age=0",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

function truncateText(text: string, maxLength: number = 4000): string {
  return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
}

function extractPageNumber(url: string): number {
  const match = url.match(/page-(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

function normalizeHeadFiUrl(url: string, baseUrl: string): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function isThreadLink(href: string): boolean {
  if (!href || href.includes("/post-") || href.includes("/activity/") || href.includes("/page-") || href.includes("/latest")) {
    return false;
  }
  return /^\/threads\/[^/]+(?:\.\d+)?\/?$/.test(href);
}

function extractThreadLinksFromHtml(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];

  $('a[href*="/threads/"]').each((_i, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const fullUrl = normalizeHeadFiUrl(href, baseUrl);
    if (!fullUrl || !isThreadLink(new URL(fullUrl).pathname)) return;
    if (!links.includes(fullUrl)) links.push(fullUrl);
  });

  return links;
}

function extractNestedForumLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];

  $('div.node--depth2.node--forum').each((_i, el) => {
    const href = $(el).find('h3.node-title a').first().attr("href");
    if (!href) return;
    const fullUrl = normalizeHeadFiUrl(href, baseUrl);
    if (fullUrl && !links.includes(fullUrl)) links.push(fullUrl);
  });

  return links;
}

async function collectThreadUrlsForForum(
  forumUrl: string,
  targetThreadCount: number,
): Promise<string[]> {
  const threadUrls: string[] = [];
  let currentUrl = forumUrl;
  let pageCount = 0;

  while (currentUrl && pageCount < 5 && threadUrls.length < targetThreadCount) {
    pageCount += 1;

    try {
      const response = await fetch(currentUrl, { headers: FETCH_HEADERS });

      if (!response.ok) {
        console.warn(`  Warning: HTTP ${response.status} fetching ${currentUrl}`);
        break;
      }

      const html = await response.text();
      const foundLinks = extractThreadLinksFromHtml(html, currentUrl);

      for (const threadUrl of foundLinks) {
        if (threadUrls.length >= targetThreadCount) break;
        if (!threadUrls.includes(threadUrl)) threadUrls.push(threadUrl);
      }

      if (threadUrls.length >= targetThreadCount) break;

      const $ = cheerio.load(html);
      const nextLink = $('a[rel="next"], .pageNav a')
        .filter((_i, el) => {
          const text = $(el).text().trim().toLowerCase();
          const href = $(el).attr("href") || "";
          return text.includes("next") || href.includes("page-");
        })
        .first();

      const nextHref = nextLink.attr("href");
      if (!nextHref) break;

      const nextUrl = normalizeHeadFiUrl(nextHref, currentUrl);
      if (!nextUrl || nextUrl === currentUrl) break;

      currentUrl = nextUrl;
    } catch (error) {
      console.warn(`  Warning: Error fetching forum page: ${error}`);
      break;
    }
  }

  return threadUrls;
}

async function scrapeHeadFiThreadPage(
  url: string,
): Promise<{ posts: RawPost[]; nextPageUrl: string | null }> {
  try {
    const response = await fetch(url, { headers: FETCH_HEADERS });

    if (!response.ok) {
      console.warn(`  [headfi] HTTP ${response.status} at ${url}`);
      return { posts: [], nextPageUrl: null };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const title = $("title").text();
    const titleLower = title.toLowerCase();
    if (titleLower.includes("log in") || titleLower.includes("sign in") || titleLower.includes("just a moment")) {
      console.warn(`  [headfi] Login wall / challenge at ${url} — "${title}"`);
      return { posts: [], nextPageUrl: null };
    }

    const baseUrl = new URL(url);
    const threadMatch = url.match(/\/threads\/[^/]+\.(\d+)/);
    const threadId = threadMatch ? threadMatch[1] : "";
    const pageNum = extractPageNumber(url);
    const threadTitle = $("h1.p-title-value, h1").first().text().trim();

    const posts: RawPost[] = [];
    $('article.message--post, article[id^="js-post"]').each((_i, article) => {
      const author =
        $(article).find(".message-name a, .message-name, a.username").first().text().trim() || "unknown";
      const text =
        $(article).find(".bbWrapper, .message-body .bbWrapper, .message-body").first().text().trim() ||
        $(article).text().trim();
      const timeEl = $(article).find("time").first();
      const timestamp = timeEl.attr("datetime") || timeEl.text().trim() || "";
      const id = $(article).attr("id") || "";

      const images = $(article)
        .find("img")
        .map((_j, img) => $(img).attr("src") || "")
        .get()
        .filter((src) => src && !src.includes("smilie") && !src.includes("avatar") && !src.includes("logo"));

      if (text.length < 20) return;

      posts.push({
        text: truncateText(`${threadTitle ? `[Thread: ${threadTitle}] ` : ""}${text}`),
        url: id ? `${baseUrl.origin}/threads/${threadId}/page-${pageNum}#${id}` : url,
        author,
        authorDisplayName: author,
        platform: "headfi" as const,
        timestamp,
        images,
      });
    });

    console.log(`    [headfi] Found ${posts.length} posts on ${url}`);

    if (posts.length === 0) {
      const articleCount = $("article").length;
      const bodySnippet = $("body").html()?.slice(0, 400).replace(/\s+/g, " ") ?? "";
      console.warn(`  [headfi] 0 posts on "${title}" — total articles: ${articleCount}`);
      console.warn(`  [headfi] Body snippet: ${bodySnippet}`);
    }

    const nextHref = $('a[rel="next"], .pageNav-jump--next').first().attr("href") || "";
    const nextPageUrl = nextHref
      ? nextHref.startsWith("http") ? nextHref : `${baseUrl.origin}${nextHref}`
      : null;

    return { posts, nextPageUrl };
  } catch (error) {
    console.error(`  Error scraping Head-Fi page ${url}:`, error instanceof Error ? error.message : error);
    return { posts: [], nextPageUrl: null };
  }
}

export async function scrapeHeadFiForum(
  target: ScrapeTarget,
  config: AppConfig,
  maxPages: number = 5,
): Promise<{ posts: RawPost[]; error?: string }> {
  console.log(`\nScraping Head-Fi: ${target.name} (${target.url})`);

  try {
    if (target.url.includes("/threads/")) {
      const allPosts: RawPost[] = [];
      let currentUrl: string | null = target.url;
      let pageCount = 0;

      while (currentUrl && pageCount < maxPages) {
        pageCount++;
        console.log(`  Fetching page ${pageCount}...`);
        const result = await scrapeHeadFiThreadPage(currentUrl);
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
      const response = await fetch(target.url, { headers: FETCH_HEADERS });
      if (!response.ok) {
        return { posts: [], error: `Failed to fetch forum page: HTTP ${response.status}` };
      }

      const html = await response.text();
      const nestedForumLinks = extractNestedForumLinks(html, target.url);
      const forumUrls = nestedForumLinks.length > 0 ? nestedForumLinks : [target.url];
      const allThreadUrls: string[] = [];
      const THREADS_PER_FORUM = 10;

      for (const forumUrl of forumUrls) {
        const threadUrls = await collectThreadUrlsForForum(forumUrl, THREADS_PER_FORUM);
        console.log(`  Found ${threadUrls.length} thread links in ${forumUrl}`);
        for (const threadUrl of threadUrls) {
          if (!allThreadUrls.includes(threadUrl)) allThreadUrls.push(threadUrl);
        }
      }

      console.log(`  Total threads to scrape: ${allThreadUrls.length}`);
      const allPosts: RawPost[] = [];
      for (const threadUrl of allThreadUrls) {
        console.log(`  Scraping thread: ${threadUrl}`);
        const result = await scrapeHeadFiThreadPage(threadUrl);
        console.log(`    → ${result.posts.length} posts extracted`);
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
  }
}

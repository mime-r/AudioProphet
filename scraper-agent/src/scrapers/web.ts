import * as cheerio from "cheerio";
import type { RawPost, ScrapeTarget } from "../types.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const DISCOVERY_LIMIT = 24;
const UPCOMING_KEYWORDS = [
  "pre-order",
  "preorder",
  "coming soon",
  "kickstarter",
  "launch",
  "upcoming",
  "shipping will begin",
  "expected to start shipping",
  "processing time",
];

function truncateText(text: string, maxLength = 4000): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function getCandidateText($: any, el: any): string {
  const text = ($(el).text() || "").trim();
  const imgAlt = $(el).find("img").attr("alt") || "";
  const title = $(el).attr("title") || "";
  const ariaLabel = $(el).attr("aria-label") || "";

  return [text, imgAlt, title, ariaLabel].filter(Boolean).join(" ");
}

function getCandidateContext($: any, el: any): string {
  const parentText = $(el).parent().text() || "";
  const grandParentText = $(el).parent().parent().text() || "";
  const heroContext = $(el)
    .closest(
      "[class*='hero'], [class*='banner'], [class*='carousel'], [class*='slider'], [class*='announcement'], [id*='hero'], [id*='banner']",
    )
    .text();

  return [parentText, grandParentText, heroContext].filter(Boolean).join(" ");
}

function scoreDiscoveryCandidate(path: string, text: string, contextText: string): number {
  const haystack = `${path} ${text} ${contextText}`.toLowerCase();
  let score = 0;

  if (/\/products\//.test(path)) {
    score += 8;
  }

  if (/\/blogs\/announcements/.test(path)) {
    score += 14;
  }

  if (/\/blogs\//.test(path)) {
    score += 4;
  }

  if (/halcyon/.test(haystack)) {
    score += 40;
  } else if (/kiwi ears|kiwi|kickstarter/.test(haystack)) {
    score += 10;
  }

  if (UPCOMING_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    score += 14;
  }

  if (/pre[- ]order|preorder|coming soon|launch|upcoming|kickstarter/.test(haystack)) {
    score += 10;
  }

  if (/featured|hero|banner|slider|carousel|announcement/.test(contextText.toLowerCase())) {
    score += 12;
  }

  return score;
}

function splitTargets(rawUrl: string): string[] {
  return rawUrl
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\n+/g, "\n").trim();
}

function normalizePageUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function fetchPageHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

function isProductPath(url: string): boolean {
  const pathname = new URL(url).pathname;
  return /\/products\//.test(pathname) || /\/blogs\//.test(pathname);
}

function getPrice(text: string): string | null {
  const match = text.match(/(?:Regular price|price|Price)\s*\$?([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  if (match?.[1]) {
    return match[1];
  }

  const priceMatch = text.match(/\$([0-9][0-9,]*(?:\.\d{1,2})?)/);
  return priceMatch?.[1] || null;
}

function detectAvailability(text: string, title: string): string {
  const haystack = `${title} ${text}`.toLowerCase();

  if (/pre[- ]order|preorder|non-cancellable|non-refundable|processing time/.test(haystack)) {
    return "pre-order";
  }

  if (/coming soon|kickstarter|launch|upcoming|expected to start shipping|shipping will begin/.test(haystack)) {
    return "upcoming";
  }

  if (/out of stock|sold out|unavailable|coming soon/.test(haystack)) {
    return "unavailable";
  }

  return "available";
}

function detectUpcoming(text: string, title: string): boolean {
  const haystack = `${title} ${text}`.toLowerCase();
  return UPCOMING_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function extractPageContent(html: string, url: string): { title: string; text: string } {
  const $ = cheerio.load(html);

  $('script, style, noscript, iframe').remove();

  const title =
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $('title').first().text().trim() ||
    $('h1').first().text().trim() ||
    extractHostname(url);

  const textSections = [
    $('article').first().text().trim(),
    $('main').first().text().trim(),
    $('[role="main"]').first().text().trim(),
    $('.product__info').first().text().trim(),
    $('.product-details').first().text().trim(),
    $('body').text().trim(),
  ].filter(Boolean);

  const text = cleanText(textSections.join("\n"));

  return {
    title: cleanText(title),
    text,
  };
}

function extractDiscoveryUrls(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const bodyText = $("body").text().toLowerCase();
  const isHomepage = new URL(baseUrl).pathname === "/";
  const homepageHasHalcyon = bodyText.includes("halcyon");
  const candidates = new Map<string, { url: string; score: number }>();

  $('a[href]').each((_index, el) => {
    const href = $(el).attr("href");
    if (!href) {
      return;
    }

    const fullUrl = normalizePageUrl(href, baseUrl);
    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedFullUrl = fullUrl.endsWith("/") ? fullUrl.slice(0, -1) : fullUrl;

    if (!fullUrl || normalizedFullUrl === normalizedBaseUrl) {
      return;
    }

    const path = new URL(fullUrl).pathname;
    const text = getCandidateText($, el);
    const contextText = getCandidateContext($, el);
    const combined = `${path} ${text} ${contextText}`.toLowerCase();

    const isRelevantLink =
      /\/products\//.test(path) ||
      /\/blogs\//.test(path) ||
      /kickstarter|pre[- ]order|preorder|coming soon|upcoming|launch|release/.test(combined);

    const isBlocked = /\/search|\/cart|\/checkout|\/account|\/pages\/shipping|\/pages\/terms|\/pages\/help|\/pages\/return|\/pages\/about|\/pages\/privacy|\/policies\//.test(path);

    if (!isRelevantLink || isBlocked) {
      return;
    }

    const anchorSignal = `${path} ${text}`.toLowerCase();
    const isExplicitHalcyon = /halcyon/.test(anchorSignal);
    const isHighSignalAnnouncement =
      /\/blogs\/announcements/.test(path) &&
      /(kickstarter|pre[- ]order|preorder|coming soon|upcoming|launch|release)/.test(anchorSignal);

    if (isHomepage && homepageHasHalcyon && !isExplicitHalcyon && !isHighSignalAnnouncement) {
      return;
    }

    const score = scoreDiscoveryCandidate(path, text, contextText);

    const existing = candidates.get(fullUrl);
    if (!existing || score > existing.score) {
      candidates.set(fullUrl, { url: fullUrl, score });
    }
  });

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.url)
    .slice(0, DISCOVERY_LIMIT);
}

function buildStructuredPost(title: string, text: string, url: string): string {
  const price = getPrice(text) || "unknown";
  const availability = detectAvailability(text, title);
  const upcoming = detectUpcoming(text, title);
  const clean = cleanText(text);
  const snippet = truncateText(clean, 3000);

  return `[web-source] [title:${title}] [url:${url}] [availability:${availability}] [upcoming:${upcoming}] [price:${price}] ${snippet}`;
}

export async function scrapeWebAnnouncements(
  target: ScrapeTarget,
): Promise<{ posts: RawPost[]; error?: string }> {
  const urls = splitTargets(target.url);

  if (urls.length === 0) {
    return { posts: [], error: `No web URLs were configured for ${target.name}.` };
  }

  const posts: RawPost[] = [];
  const seenUrls = new Set<string>();

  for (const sourceUrl of urls) {
    try {
      const html = await fetchPageHtml(sourceUrl);
      const { title: sourceTitle, text: sourceText } = extractPageContent(html, sourceUrl);
      const isProductPage = isProductPath(sourceUrl);
      const discoveryUrls = isProductPage ? [sourceUrl] : extractDiscoveryUrls(html, sourceUrl);
      const targets = discoveryUrls.length > 0 ? discoveryUrls : [sourceUrl];

      for (const pageUrl of targets) {
        try {
          const pageHtml = pageUrl === sourceUrl ? html : await fetchPageHtml(pageUrl);
          const { title, text } = extractPageContent(pageHtml, pageUrl);
          const structuredText = buildStructuredPost(title, text, pageUrl);

          if (structuredText.length < 160) {
            continue;
          }

          if (seenUrls.has(pageUrl)) {
            continue;
          }

          seenUrls.add(pageUrl);

          posts.push({
            text: structuredText,
            url: pageUrl,
            author: "web-source",
            authorDisplayName: target.name,
            platform: "web",
            timestamp: new Date().toISOString(),
            images: [],
          });
        } catch (error) {
          console.warn(`  Unable to inspect web page ${pageUrl}:`, error instanceof Error ? error.message : error);
        }
      }

      if (posts.length === 0 && sourceTitle && sourceText) {
        const fallbackText = buildStructuredPost(sourceTitle, sourceText, sourceUrl);
        if (fallbackText.length >= 160) {
          posts.push({
            text: fallbackText,
            url: sourceUrl,
            author: "web-source",
            authorDisplayName: target.name,
            platform: "web",
            timestamp: new Date().toISOString(),
            images: [],
          });
        }
      }
    } catch (error) {
      console.warn(`  Unable to fetch web source ${sourceUrl}:`, error instanceof Error ? error.message : error);
    }
  }

  if (posts.length === 0) {
    return {
      posts: [],
      error: `No usable product discovery content was found for ${target.name}.`,
    };
  }

  return { posts };
}

export default scrapeWebAnnouncements;

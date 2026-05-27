import * as cheerio from "cheerio";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

let uaIndex = 0;

function rotateUserAgent(): string {
  const ua = USER_AGENTS[uaIndex];
  uaIndex = (uaIndex + 1) % USER_AGENTS.length;
  return ua;
}

function extractJson(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock?.[1]) return codeBlock[1];
  const inline = text.match(/(\{[\s\S]*\})/);
  if (inline?.[1]) return inline[1];
  // Truncated JSON — attempt to fix by adding closing brace
  const partial = text.match(/(\{[\s\S]*)/);
  if (partial?.[1]) return partial[1] + "}";
  return "";
}

export { extractJson };

async function fetchSnippets(url: string, queryLabel: string): Promise<string[]> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": rotateUserAgent(),
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    console.warn(`[web-search] HTTP ${response.status} for "${queryLabel}"`);
    return [];
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const snippets: string[] = [];
  $(".result__snippet").each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 20) {
      snippets.push(text.slice(0, 500));
    }
  });

  if (snippets.length === 0) {
    console.warn(`[web-search] No snippets found for "${queryLabel}"`);
  } else {
    console.log(`[web-search] Found ${snippets.length} snippets for "${queryLabel}"`);
  }

  return snippets.slice(0, 5);
}

export async function searchGoogleWeb(query: string): Promise<string[]> {
  const q = query.slice(0, 60);

  try {
    const snippets = await fetchSnippets(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      q,
    );
    if (snippets.length > 0) return snippets;

    // Fallback: lite version
    console.log(`[web-search] Trying lite version...`);
    return await fetchSnippets(
      `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
      q,
    );
  } catch (error) {
    console.warn(`[web-search] Failed for "${q}":`, error instanceof Error ? error.message : error);
    return [];
  }
}

import { chromium } from "playwright";

async function testHeadFiDOM() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    },
  });

  const page = await context.newPage();
  await page.goto("https://www.head-fi.org/forums/equipment-forums.3/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  const html = await page.content();

  console.log("HTML length:", html.length);
  console.log("First 500 chars:", html.slice(0, 500));

  // Check for key elements
  console.log("\nKey element counts:");
  console.log("Contains 'Headphones':", html.includes("Headphones"));
  console.log("Contains '/forums/':", html.includes("/forums/"));
  console.log("<a> tags:", (html.match(/<a/g) || []).length);

  // Find links with "Headphones", "Earphones", etc
  const headphonesIdx = html.indexOf("Headphones");
  if (headphonesIdx > 0) {
    const snippet = html.slice(Math.max(0, headphonesIdx - 800), headphonesIdx + 500);
    console.log("\n=== DOM around 'Headphones' ===");
    console.log(snippet);
  } else {
    console.log("\n'Headphones' text not found in HTML");
  }

  // Check for common forum structure patterns
  const patterns = [
    { name: "data-forum", pattern: /data-forum[^>]*/g },
    { name: "node-link", pattern: /node-link[^>]*/g },
    { name: "forum-title", pattern: /forum-title[^>]*/g },
    { name: "structItem", pattern: /structItem[^>]*/g },
    { name: "forumLink", pattern: /forumLink[^>]*/g },
  ];

  console.log("\n=== Pattern matches ===");
  patterns.forEach(({ name, pattern }) => {
    const matches = html.match(pattern) || [];
    console.log(`${name}: ${matches.length} matches`);
  });

  await browser.close();
}

testHeadFiDOM().catch(console.error);

import * as readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig } from "./config.js";
import { loadProducts, saveProducts } from "./storage.js";
import { runScrapeSession, type ScrapeSessionResult } from "./orchestrator.js";
import type { ScrapeTarget } from "./types.js";

const DEFAULT_TARGETS: ScrapeTarget[] = [
  {
    name: "Head-Fi",
    platform: "headfi",
    url: "https://www.head-fi.org/forums/equipment-forums.3/",
  },
  {
    name: "Web discovery sources",
    platform: "web",
    url: "https://hifiman.com/,https://www.moondrop.com/,https://www.truthear.com/",
  },
];

function ask(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => resolve(answer));
  });
}

function formatConfidence(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function printHeader() {
  console.log("=".repeat(60));
  console.log("  Audio Prophet - Scraper Agent");
  console.log("  AI-powered discovery of upcoming audiophile products");
  console.log("=".repeat(60));
  console.log();
}

function exitMenu(rl: readline.Interface, message = "Exiting...") {
  console.log(`\n${message}`);
  rl.close();
  process.exit(0);
}

async function runScrape() {
  const config = loadConfig();
  console.log("Starting scrape session...\n");

  try {
    const result: ScrapeSessionResult = await runScrapeSession(
      {
        targets: DEFAULT_TARGETS,
        confidenceThreshold: 0.5,
        onProgress: (msg) => console.log(`  > ${msg}`),
      },
      config,
    );

    console.log("\n" + "=".repeat(60));
    console.log("SCRAPE COMPLETE");
    console.log("=".repeat(60));
    console.log(`  Total posts scraped:  ${result.totalPosts}`);
    console.log(`  Posts analyzed by AI: ${result.analyzedPosts}`);
    console.log(`  Products extracted:   ${result.productsFound}`);
    console.log(`  Duplicates skipped:   ${result.duplicatesSkipped}`);

    if (result.productsFound > 0) {
      console.log("\nProducts found:");
      const products = await loadProducts();
      const newProducts = products.slice(-result.productsFound);
      for (const p of newProducts) {
        console.log(`  - ${p.brand} ${p.name} (${p.category}) [${formatConfidence(p.confidence)}]`);
      }
    }
  } catch (err) {
    console.error("\nScrape failed:", err instanceof Error ? err.message : String(err));
  }

  console.log(`\nRun "npm run web" to open the review interface.`);
}

async function showStatus() {
  const products = await loadProducts();
  const reviewedCount = products.filter((p) => p.reviewed).length;
  const approvedCount = products.filter((p) => p.approved).length;
  const submittedCount = products.filter((p) => p.submitted).length;

  console.log("STORAGE STATUS");
  console.log("-".repeat(40));
  console.log(`  Total scraped items:   ${products.length}`);
  console.log(`  Reviewed:              ${reviewedCount}`);
  console.log(`  Approved for submit:   ${approvedCount}`);
  console.log(`  Submitted to app:      ${submittedCount}`);
  console.log();

  if (products.length === 0) {
    console.log("  (no items stored yet)");
  } else {
    products.slice(-10).reverse().forEach((p) => {
      const status = p.submitted ? "✓" : p.approved ? "★" : p.reviewed ? "○" : "·";
      console.log(`  ${status} [${p.sourceType}] ${p.brand} ${p.name} (${formatConfidence(p.confidence)})`);
    });
  }
  console.log();
}

async function interactiveMenu() {
  console.clear();
  printHeader();

  const rl = readline.createInterface({ input, output, terminal: true });
  const config = loadConfig();

  let running = true;

  rl.on("SIGINT", () => exitMenu(rl));

  while (running) {
    console.log("MAIN MENU");
    console.log("-".repeat(40));
    console.log("  1. Run scrape (all targets)");
    console.log("  2. Show storage status");
    console.log("  3. Start review web interface");
    console.log("  4. Clear all stored data");
    console.log("  5. Exit");
    console.log();

    const answer = (await ask(rl, "Select option (1-5): ")).trim();

    switch (answer) {
      case "1":
        await runScrape();
        await ask(rl, "\nPress Enter to return to menu...");
        break;

      case "2":
        await showStatus();
        await ask(rl, "\nPress Enter to return to menu...");
        break;

      case "3": {
        console.log("\nStarting review web interface...");
        console.log(`Open http://localhost:${config.port} in your browser.`);
        console.log("Press Ctrl+C to stop the server and return to menu.\n");
        try {
          const { startServer } = await import("./server.js");
          await startServer(config);
        } catch (err) {
          console.error("Server error:", err instanceof Error ? err.message : String(err));
        }
        await ask(rl, "\nPress Enter to return to menu...");
        break;
      }

      case "4": {
        const confirm = (await ask(rl, "Clear ALL stored data? This cannot be undone. (yes/no): ")).toLowerCase();
        if (confirm === "yes") {
          await saveProducts([]);
          console.log("All stored data cleared.");
        } else {
          console.log("Cancelled.");
        }
        await ask(rl, "\nPress Enter to return to menu...");
        break;
      }

      case "5":
        running = false;
        console.log("Goodbye!");
        break;

      default:
        console.log("Invalid option.");
        await ask(rl, "\nPress Enter to return to menu...");
    }

    console.log();
  }

  rl.close();
  process.exit(0);
}

interactiveMenu().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

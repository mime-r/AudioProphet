import express from "express";
import cors from "cors";
import path from "node:path";
import type { AppConfig, ScrapedProduct } from "./types.js";
import { loadProducts, updateProduct, removeProduct, getProductById } from "./storage.js";
import { runScrapeSession } from "./orchestrator.js";
import { submitToMainApp } from "./submitter.js";
import { validateProduct } from "./validator.js";
import { loadConfig } from "./config.js";
import type { ScrapeTarget } from "./types.js";

const WEB_DIR = path.resolve(import.meta.dirname, "..", "web");

export async function startServer(config?: AppConfig) {
  const cfg = config || loadConfig();
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.static(WEB_DIR));

  app.get("/api/items", async (_req, res) => {
    try {
      const { sourceType, reviewed, approved, submitted, minConfidence, search, sort } = _req.query as Record<string, string | undefined>;
      let products = await loadProducts();

      if (sourceType) {
        products = products.filter((p) => p.sourceType === sourceType);
      }
      if (reviewed !== undefined) {
        products = products.filter((p) => p.reviewed === (reviewed === "true"));
      }
      if (approved !== undefined) {
        products = products.filter((p) => p.approved === (approved === "true"));
      }
      if (submitted !== undefined) {
        products = products.filter((p) => p.submitted === (submitted === "true"));
      }
      if (minConfidence) {
        products = products.filter((p) => p.confidence >= Number(minConfidence));
      }
      if (search) {
        const q = search.toLowerCase();
        products = products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.brand.toLowerCase().includes(q) ||
            p.notes.toLowerCase().includes(q),
        );
      }

      if (sort === "confidence") {
        products.sort((a, b) => b.confidence - a.confidence);
      } else if (sort === "date") {
        products.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } else if (sort === "name") {
        products.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        products.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }

      res.json(products);
    } catch (error) {
      res.status(500).json({ error: "Failed to load items." });
    }
  });

  app.get("/api/items/:id", async (req, res) => {
    try {
      const product = await getProductById(req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Item not found." });
      }
      res.json(product);
    } catch (error) {
      res.status(500).json({ error: "Failed to load item." });
    }
  });

  app.patch("/api/items/:id", async (req, res) => {
    try {
      const changes = req.body as Partial<ScrapedProduct>;
      const product = await getProductById(req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Item not found." });
      }
      const updated = await updateProduct(req.params.id, changes);
      if (!updated) {
        return res.status(404).json({ error: "Item not found." });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update item." });
    }
  });

  app.delete("/api/items/:id", async (req, res) => {
    try {
      const removed = await removeProduct(req.params.id);
      if (!removed) {
        return res.status(404).json({ error: "Item not found." });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete item." });
    }
  });

  app.post("/api/items/:id/submit", async (req, res) => {
    try {
      const product = await getProductById(req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Item not found." });
      }

      const validation = validateProduct(product);
      if (!validation.valid) {
        await updateProduct(req.params.id, {
          submitted: false,
          submissionError: `Validation failed: ${validation.errors.map((e) => e.message).join("; ")}`,
        });
        return res.status(400).json({
          error: `Validation failed: ${validation.errors.map((e) => e.message).join("; ")}`,
          details: validation.errors,
        });
      }

      const result = await submitToMainApp(product, cfg);
      if (!result.success) {
        await updateProduct(req.params.id, {
          submitted: false,
          submissionError: result.error,
        });
        return res.status(400).json({ error: result.error });
      }

      await updateProduct(req.params.id, {
        submitted: true,
        submissionError: undefined,
      });

      res.json({ success: true, message: "Product submitted successfully." });
    } catch (error) {
      res.status(500).json({ error: "Failed to submit item." });
    }
  });

  app.post("/api/run/scrape", async (req, res) => {
    try {
      const { targets, confidenceThreshold } = req.body as {
        targets?: ScrapeTarget[];
        confidenceThreshold?: number;
      };

      const defaultTargets: ScrapeTarget[] = [
        {
          name: "Head-Fi",
          platform: "headfi",
          url: "https://www.head-fi.org/forums/equipment-forums.3/,https://www.head-fi.org/forums/head-fi-meet-impressions-trade-show-reports-factory-tours.45/",
        },
        {
          name: "Web discovery sources",
          platform: "web",
          url: "https://www.linsoul.com/,https://hifiman.com/,https://www.moondrop.com/,https://www.truthear.com/,https://www.tinhifi.com/,https://moondroplab.com/en/home,https://kineraaudio.com/,https://www.hidizs.net/,https://store.hiby.com/,https://tipsyaudio.com/", /* "" */
        },
      ];

      res.json({
        status: "started",
        message: "Scrape session started. Check server console for progress.",
      });

      const result = await runScrapeSession(
        {
          targets: targets || defaultTargets,
          confidenceThreshold: confidenceThreshold ?? 0.5,
        },
        cfg,
      );

      console.log(`\nScrape completed: ${result.productsFound} products found from ${result.totalPosts} posts.`);
    } catch (error) {
      console.error("Scrape error:", error);
    }
  });

  app.get("/api/stats", async (_req, res) => {
    try {
      const products = await loadProducts();
      res.json({
        total: products.length,
        reviewed: products.filter((p) => p.reviewed).length,
        approved: products.filter((p) => p.approved).length,
        submitted: products.filter((p) => p.submitted).length,
        headfi: products.filter((p) => p.sourceType === "headfi").length,
        web: products.filter((p) => p.sourceType === "web").length,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get stats." });
    }
  });

  app.get("*", (_req, res) => {
    res.sendFile(path.join(WEB_DIR, "index.html"));
  });

  return new Promise<void>((resolve) => {
    app.listen(cfg.port, () => {
      console.log(`Review interface running at http://localhost:${cfg.port}`);
      resolve();
    });
  });
}

const isMainModule = process.argv[1]?.endsWith("server.js") || process.argv[1]?.endsWith("server.ts");
if (isMainModule) {
  startServer().catch(console.error);
}

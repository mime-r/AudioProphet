export type ProductCategory = "IEMs" | "Flatheads" | "TWS" | "Headphones" | "Sources" | "Accessories" | "Other";
export type SourcePlatform = "headfi" | "web";

export const ALL_CATEGORIES: ProductCategory[] = [
  "IEMs", "Flatheads", "TWS", "Headphones", "Sources", "Accessories", "Other",
];

/**
 * Scraped product enriched from AI analysis or web search results.
 * imageDataUrl field is optional - stores base64-encoded image under 300KB limit.
 */
export interface ScrapedProduct {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  msrp: string;
  releaseDate: string;
  notes: string;
  source: string;
  sourceUrl: string;
  sourceType: SourcePlatform;
  confidence: number;
  reviewed: boolean;
  approved: boolean;
  submitted: boolean;
  submissionError?: string;
  createdAt: string;
  rawContent?: string;
  imageDataUrl?: string; // Optional - stores compressed image (data:image/jpeg;base64,...) under 300KB limit
}

export interface RawPost {
  text: string;
  url: string;
  author: string;
  authorDisplayName: string;
  platform: SourcePlatform;
  timestamp: string;
  images: string[];
}

/**
 * AI extraction from forum and web source posts - includes optional imageDataUrl for web scrapers (like Google Search).
 */
export interface AIExtraction {
  isProductAnnouncement: boolean;
  confidence: number;
  productName: string;
  brand: string;
  category: ProductCategory;
  msrp: string;
  releaseDate: string;
  notes: string;
  reasoning: string;
  imageDataUrl?: string; // Optional - allows web scraper (Google Search) to inject enriched image data under 300KB limit
}

export interface ScrapeTarget {
  name: string;
  platform: SourcePlatform;
  url: string;
}

export interface ScrapeResult {
  target: ScrapeTarget;
  posts: RawPost[];
  products: ScrapedProduct[];
  error?: string;
}

export type AiProvider = "openai" | "anthropic" | "lmstudio";

export interface AppConfig {
  aiProvider: AiProvider;
  aiModel?: string;
  openaiKey?: string;
  anthropicKey?: string;
  lmStudioBaseUrl?: string;
  lmStudioApiKey?: string;
  mongodbUri?: string;
  mongodbDb?: string;
  appUrl: string;
  port: number;
  enableWebSearchEnrichment?: boolean;
}


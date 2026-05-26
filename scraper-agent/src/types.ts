export type ProductCategory = "IEMs" | "Flatheads" | "TWS" | "Headphones" | "Sources" | "Accessories" | "Other";
export type SourcePlatform = "twitter" | "headfi";

export const ALL_CATEGORIES: ProductCategory[] = [
  "IEMs", "Flatheads", "TWS", "Headphones", "Sources", "Accessories", "Other",
];

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

export interface AppConfig {
  aiProvider: "openai" | "anthropic";
  aiModel?: string;
  openaiKey?: string;
  anthropicKey?: string;
  mongodbUri?: string;
  mongodbDb?: string;
  appUrl: string;
  twitterMethod: "api" | "browser";
  twitterCookiesPath?: string;
  twitterBearerToken?: string;
  twitterApiKey?: string;
  twitterApiSecret?: string;
  twitterAccessToken?: string;
  twitterAccessSecret?: string;
  port: number;
}

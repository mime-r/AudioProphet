import type { ProductCategory, ScrapedProduct } from "./types";
import { ALL_CATEGORIES } from "./types";

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export function validateProduct(product: Partial<ScrapedProduct>): ValidationResult {
  const errors: ValidationError[] = [];

  if (!product.name || !product.name.trim()) {
    errors.push({ field: "name", message: "Product name is required." });
  } else if (product.name.trim().length > 200) {
    errors.push({ field: "name", message: "Product name must be 200 characters or less." });
  }

  if (!product.brand || !product.brand.trim()) {
    errors.push({ field: "brand", message: "Brand is required." });
  }

  if (!product.category || !ALL_CATEGORIES.includes(product.category as ProductCategory)) {
    errors.push({ field: "category", message: `Category must be one of: ${ALL_CATEGORIES.join(", ")}` });
  }

  if (product.msrp && product.msrp !== "TBA") {
    const cleaned = product.msrp.replace(/[^0-9.]/g, "");
    if (!cleaned || Number.isNaN(Number(cleaned))) {
      errors.push({ field: "msrp", message: "MSRP must be a valid number or TBA." });
    }
  }

  if (product.notes && product.notes.length > 300) {
    errors.push({ field: "notes", message: "Notes must be 300 characters or less." });
  }

  if (!product.source || !product.source.trim()) {
    errors.push({ field: "source", message: "Source URL is required." });
  }

  if (product.releaseDate) {
    const parsed = Date.parse(product.releaseDate);
    if (Number.isNaN(parsed)) {
      errors.push({ field: "releaseDate", message: "Release date is not a valid date." });
    }
  }

  return { valid: errors.length === 0, errors };
}

export function formatForSubmission(product: ScrapedProduct) {
  return {
    name: product.name.trim(),
    brand: product.brand.trim(),
    category: product.category,
    msrp: product.msrp && product.msrp !== "TBA" ? product.msrp.replace(/[^0-9]/g, "") : "",
    source: product.source.trim(),
    description: product.notes?.trim() || "",
    releaseDate: product.releaseDate?.trim() || "",
    imageDataUrl: "",
  };
}

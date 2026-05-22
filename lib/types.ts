export type ProductCategory = "IEMs" | "Flatheads" | "TWS" | "Headphones" | "Sources" | "Accessories" | "Other";
export type ProductStatus = "Pending" | "Verified" | "Released" | "Rejected";

export interface ProductItem {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  msrp: string;
  source: string;
  description: string;
  imageDataUrl?: string;
  status: ProductStatus;
  releaseDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

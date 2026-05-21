import { NextResponse } from "next/server";
import { deleteProduct, getAllProducts, updateProduct, updateProductStatus } from "@/lib/db";
import { ProductStatus } from "@/lib/types";

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "password";
const allowedCategories = ["IEMs", "Headphones", "Sources", "Accessories", "Other"] as const;

type AllowedCategory = (typeof allowedCategories)[number];

function validateAdminAuth(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Basic ")) return false;

  const encoded = authHeader.replace("Basic ", "");
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const [user, pass] = decoded.split(":");
  return user === ADMIN_USER && pass === ADMIN_PASS;
}

export async function GET(request: Request) {
  if (!validateAdminAuth(request)) {
    return new NextResponse(null, { status: 401, headers: { "WWW-Authenticate": "Basic realm=\"Admin Panel\"" } });
  }

  const submissions = await getAllProducts();
  return NextResponse.json(submissions);
}

export async function PATCH(request: Request) {
  if (!validateAdminAuth(request)) {
    return new NextResponse(null, { status: 401, headers: { "WWW-Authenticate": "Basic realm=\"Admin Panel\"" } });
  }

  const body = await request.json();
  const { id, action } = body;
  if (!id || !action) {
    return NextResponse.json({ error: "Missing id or action." }, { status: 400 });
  }

  const statusMap: Record<string, ProductStatus> = {
    approve: "Verified",
    release: "Released",
    reject: "Rejected",
  };

  if (action === "edit") {
    const { name, brand, category, msrp, source, description, imageDataUrl, releaseDate } = body;
    const changes: Record<string, unknown> = {};
    if (name) changes.name = String(name).trim();
    if (brand) changes.brand = String(brand).trim();
    if (category) {
      const categoryString = String(category).trim();
      if (!allowedCategories.includes(categoryString as AllowedCategory)) {
        return NextResponse.json({ error: "Invalid category." }, { status: 400 });
      }
      changes.category = categoryString;
    }
    if (msrp) changes.msrp = String(msrp).trim();
    if (source) changes.source = String(source).trim();
    if (description !== undefined) changes.description = String(description).trim();
    if (releaseDate !== undefined) {
      const releaseDateString = String(releaseDate || "").trim();
      if (releaseDateString && Number.isNaN(Date.parse(releaseDateString))) {
        return NextResponse.json({ error: "Invalid release date." }, { status: 400 });
      }
      changes.releaseDate = releaseDateString || undefined;
    }
    if (imageDataUrl !== undefined) {
      if (imageDataUrl && typeof imageDataUrl !== "string") {
        return NextResponse.json({ error: "Invalid image format." }, { status: 400 });
      }
      changes.imageDataUrl = imageDataUrl || undefined;
    }

    const updated = await updateProduct(id, changes);
    if (!updated) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }

    return NextResponse.json(updated);
  }

  const newStatus = statusMap[action];
  if (!newStatus) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const updated = await updateProductStatus(id, newStatus);
  if (!updated) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  if (!validateAdminAuth(request)) {
    return new NextResponse(null, { status: 401, headers: { "WWW-Authenticate": "Basic realm=\"Admin Panel\"" } });
  }

  const body = await request.json();
  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  const deleted = await deleteProduct(id);
  if (!deleted) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

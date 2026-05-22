import { NextResponse } from "next/server";
import { deleteProduct, getAllProducts, updateProduct, updateProductStatus } from "@/lib/db";
import { ProductStatus } from "@/lib/types";

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const allowedCategories = ["IEMs", "Flatheads", "TWS", "Headphones", "Sources", "Accessories", "Other"] as const;

type AllowedCategory = (typeof allowedCategories)[number];

function validateAdminAuth(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    if (!authHeader.startsWith("Basic ")) return false;

    const encoded = authHeader.replace("Basic ", "");
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) return false;
    
    const user = decoded.slice(0, colonIndex);
    const pass = decoded.slice(colonIndex + 1);
    return user === ADMIN_USER && pass === ADMIN_PASS;
  } catch {
    return false;
  }
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
        return NextResponse.json({ error: "Invalid category. Allowed: IEMs, Flatheads, Headphones, Sources, Accessories, Other." }, { status: 400 });
      }
      changes.category = categoryString;
    }
    if (msrp !== undefined) {
      const msrpString = String(msrp).trim();
      if (msrpString && !/^\d+$/.test(msrpString)) {
        return NextResponse.json({ error: "MSRP must be a whole number or empty." }, { status: 400 });
      }
      changes.msrp = msrpString || undefined;
    }
    if (msrp) changes.msrp = String(msrp).trim();
    if (source) changes.source = String(source).trim();
    if (description !== undefined) {
      const descriptionString = String(description).trim();
      if (descriptionString.length > 300) {
        return NextResponse.json({ error: "Description must be 300 characters or less." }, { status: 400 });
      }
      changes.description = descriptionString;
    }
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

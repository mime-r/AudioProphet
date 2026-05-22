import { NextResponse } from "next/server";
import { addProduct, canSubmitFromIp, getAllProducts, getPublicProducts, recordSubmissionAttempt } from "@/lib/db";
import { ProductCategory } from "@/lib/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const visibility = url.searchParams.get("visibility");

  if (visibility === "public") {
    const publicItems = await getPublicProducts();
    return NextResponse.json(publicItems);
  }

  const allItems = await getAllProducts();
  if (status) {
    return NextResponse.json(allItems.filter((item) => item.status === status));
  }

  return NextResponse.json(allItems);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, brand, category, msrp, source, description, imageDataUrl, releaseDate, captchaToken } = body;

    if (!name || !brand || !source || !category || !captchaToken) {
      return NextResponse.json({ error: "Missing required fields or captcha token." }, { status: 400 });
    }

  const parsedReleaseDate = releaseDate ? String(releaseDate).trim() : "";
  if (parsedReleaseDate && Number.isNaN(Date.parse(parsedReleaseDate))) {
    return NextResponse.json({ error: "Invalid release date." }, { status: 400 });
  }

  const allowedCategories: ProductCategory[] = ["IEMs", "Headphones", "Sources", "Accessories", "Other"];
  if (!allowedCategories.includes(category)) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }

  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
  if (!recaptchaSecret) {
    return NextResponse.json({ error: "Captcha is not configured on the server." }, { status: 500 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const verifyResponse = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `secret=${encodeURIComponent(recaptchaSecret)}&response=${encodeURIComponent(captchaToken)}&remoteip=${encodeURIComponent(ip)}`,
  });

  if (!verifyResponse.ok) {
    return NextResponse.json({ error: "Captcha verification service returned an error." }, { status: 500 });
  }

  let verification;
  try {
    verification = await verifyResponse.json();
  } catch {
    return NextResponse.json({ error: "Captcha verification returned invalid response." }, { status: 500 });
  }

  if (!verification.success || (typeof verification.score === "number" && verification.score < 0.4)) {
    return NextResponse.json({ error: "Captcha validation failed." }, { status: 400 });
  }

  if (!(await canSubmitFromIp(ip))) {
    return NextResponse.json({ error: "Rate limit exceeded. You can submit up to 2 items every 5 minutes." }, { status: 429 });
  }

  await recordSubmissionAttempt(ip);

  let safeImage: string | undefined = undefined;
  if (typeof imageDataUrl === "string" && imageDataUrl.startsWith("data:image/")) {
    if (imageDataUrl.length > 5_000_000) {
      return NextResponse.json({ error: "Image too large. Please choose a smaller file." }, { status: 400 });
    }
    safeImage = imageDataUrl;
  }

  const newSubmission = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    brand: String(brand).trim(),
    category,
    msrp: String(msrp).trim(),
    source: String(source).trim(),
    description: String(description || "").trim(),
    imageDataUrl: safeImage,
    releaseDate: parsedReleaseDate || undefined,
    status: "Pending" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const saved = await addProduct(newSubmission);
  return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    console.error("POST /api/items error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

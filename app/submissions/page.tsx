"use client";

import { useState } from "react";
import Link from "next/link";
import Script from "next/script";
import type { ProductCategory } from "@/lib/types";

const categories: ProductCategory[] = ["IEMs", "Headphones", "Sources", "Accessories", "Other"];
const MAX_IMAGE_BYTES = 1_000_000;
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export default function SubmissionsPage() {
  const [form, setForm] = useState({
    name: "",
    brand: "",
    category: "IEMs" as ProductCategory,
    msrp: "",
    source: "",
    description: "",
    releaseDate: "",
  });
  const [imageDataUrl, setImageDataUrl] = useState<string>("");
  const [imageName, setImageName] = useState<string>("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaLoaded, setCaptchaLoaded] = useState(false);

  const fileToDataUrl = (file: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const compressImage = async (file: File) => {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to process image.");

    let width = bitmap.width;
    let height = bitmap.height;
    const maxDimension = 1200;
    if (width > maxDimension || height > maxDimension) {
      const ratio = Math.min(maxDimension / width, maxDimension / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    canvas.width = width;
    canvas.height = height;
    context.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.92;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) throw new Error("Unable to encode image.");
      if (blob.size <= MAX_IMAGE_BYTES) {
        return fileToDataUrl(blob);
      }
      quality *= 0.85;
    }

    const finalBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!finalBlob) throw new Error("Unable to encode image.");
    return fileToDataUrl(finalBlob);
  };

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be 10 MB or smaller.");
      return;
    }

    try {
      let dataUrl: string;
      if (file.size <= MAX_IMAGE_BYTES) {
        dataUrl = await fileToDataUrl(file);
      } else {
        dataUrl = await compressImage(file);
      }

      const decodedSize = Math.round((dataUrl.length * 3) / 4);
      if (decodedSize > MAX_IMAGE_BYTES) {
        setError("Unable to resize the image under 1 MB. Please choose a smaller file.");
        return;
      }

      setImageDataUrl(dataUrl);
      setImageName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to process the image.");
    }
  };

  const clearImage = () => {
    setImageDataUrl("");
    setImageName("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);

    if (!RECAPTCHA_SITE_KEY) {
      setError("Captcha site key is not configured.");
      return;
    }

    const grecaptcha = (window as any).grecaptcha;
    if (!grecaptcha || !captchaLoaded) {
      setError("Captcha is not ready yet. Please wait a moment and try again.");
      return;
    }

    if (!form.name.trim() || !form.brand.trim() || !form.source.trim()) {
      setError("Please fill in product name, brand, and source link.");
      return;
    }

    if (form.releaseDate && Number.isNaN(Date.parse(form.releaseDate))) {
      setError("Release date is invalid.");
      return;
    }

    setIsSubmitting(true);

    try {
      const token = await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "submit" });
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, imageDataUrl, captchaToken: token }),
      });

      if (!response.ok) {
        const json = await response.json();
        setError(json?.error || "Unable to submit product.");
        return;
      }

      setStatus("Your submission was received and is now pending review.");
      setForm({ name: "", brand: "", category: "IEMs", msrp: "", source: "", description: "", releaseDate: "" });
      clearImage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit product.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      {RECAPTCHA_SITE_KEY ? (
        <Script
          src={`https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`}
          onLoad={() => setCaptchaLoaded(true)}
        />
      ) : null}
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-white/10 bg-zinc-900/80 p-8 ring-1 ring-white/5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Contributor page</p>
            <h1 className="mt-4 text-4xl font-semibold text-white">Submit upcoming audio products</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-300">
              Add new submissions for upcoming IEMs, headphones, sources, or accessories. Admins will review and approve each entry.
            </p>
          </div>
          <Link href="/" className="inline-flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
            Browse verified products
          </Link>
        </div>

        <section className="rounded-3xl border border-white/10 bg-zinc-900/80 p-8 ring-1 ring-white/5">
          <h2 className="text-2xl font-semibold text-white">Submission form</h2>
          <p className="mt-2 text-sm text-zinc-400">Fill in the details, attach an image, and submit. Captcha protection and rate limiting prevent bots.</p>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-zinc-200">Product name</span>
                <input
                  value={form.name}
                  onChange={(event) => handleChange("name", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                  placeholder="Example: Nova IEM"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-200">Brand</span>
                <input
                  value={form.brand}
                  onChange={(event) => handleChange("brand", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                  placeholder="Example: AudioProphet"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-zinc-200">Category</span>
                <select
                  value={form.category}
                  onChange={(event) => handleChange("category", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-200">MSRP</span>
                <input
                  value={form.msrp}
                  onChange={(event) => handleChange("msrp", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                  placeholder="$999 / 999€"
                />
                <p className="mt-2 text-xs text-zinc-500">MSRP values are shown in USD. If you omit the $ sign, we'll display the price as $X.</p>
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-zinc-200">Source link</span>
              <input
                value={form.source}
                onChange={(event) => handleChange("source", event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                placeholder="https://example.com/source"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-zinc-200">Release date</span>
                <input
                  type="date"
                  value={form.releaseDate}
                  onChange={(event) => handleChange("releaseDate", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                />
                <p className="mt-2 text-xs text-zinc-500">Leave empty for TBA.</p>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-200">Notes</span>
                <textarea
                  value={form.description}
                  onChange={(event) => handleChange("description", event.target.value)}
                  className="mt-2 min-h-[120px] w-full rounded-3xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                  placeholder="Optional release window, rumor source, or special details."
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-zinc-200">Product image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                />
              </label>
              {imageName ? (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                  <p className="font-medium text-white">Selected image</p>
                  <p className="mt-2">{imageName}</p>
                  <button type="button" onClick={clearImage} className="mt-3 rounded-2xl border border-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/10">
                    Remove image
                  </button>
                </div>
              ) : null}
            </div>

            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            {status ? <p className="text-sm text-green-400">{status}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-3xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-blue-700"
            >
              {isSubmitting ? "Submitting…" : "Submit product"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

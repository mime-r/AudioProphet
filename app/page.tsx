"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ProductCategory, ProductItem } from "@/lib/types";

const categories: ProductCategory[] = ["IEMs", "Headphones", "Sources", "Accessories", "Other"];

function getStatusLabel(status: string) {
  if (status === "Released") return "Released";
  if (status === "Verified") return "Verified";
  return "Pending";
}

function statusStyles(status: string) {
  switch (status) {
    case "Released":
      return "bg-green-100 text-green-800";
    case "Verified":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-yellow-100 text-yellow-800";
  }
}

export default function Home() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [filters, setFilters] = useState<Record<ProductCategory, boolean>>({
    IEMs: true,
    Headphones: true,
    Sources: true,
    Accessories: true,
    Other: true,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [releaseDateFilter, setReleaseDateFilter] = useState("");
  const [showTba, setShowTba] = useState(true);
  const [sortOption, setSortOption] = useState<"newest" | "oldest" | "name-asc" | "name-desc" | "price-asc" | "price-desc">("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [expandedImageAlt, setExpandedImageAlt] = useState<string>("");

  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/items?visibility=public");
        if (!response.ok) {
          const json = await response.json();
          throw new Error(json?.error || "Failed to load products.");
        }
        const data = (await response.json()) as ProductItem[];
        setProducts(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load products.");
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const normalizedBrand = brandFilter.trim().toLowerCase();

    return products
      .filter((item) => filters[item.category])
      .filter((item) => {
        if (normalizedSearch && !item.name.toLowerCase().includes(normalizedSearch)) {
          return false;
        }
        if (normalizedBrand && !item.brand.toLowerCase().includes(normalizedBrand)) {
          return false;
        }
        if (releaseDateFilter) {
          if (item.releaseDate === releaseDateFilter) {
            return true;
          }
          return showTba && !item.releaseDate;
        }
        if (!showTba && !item.releaseDate) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortOption === "name-asc") {
          return a.name.localeCompare(b.name);
        }
        if (sortOption === "name-desc") {
          return b.name.localeCompare(a.name);
        }

        const parsePrice = (msrp?: string) => {
          if (!msrp) return NaN;
          const cleaned = String(msrp).replace(/[^0-9.]/g, "");
          const n = Number(cleaned);
          return Number.isFinite(n) ? n : NaN;
        };

        if (sortOption === "price-asc") {
          const aVal = parsePrice(a.msrp);
          const bVal = parsePrice(b.msrp);
          if (Number.isNaN(aVal) && Number.isNaN(bVal)) return 0;
          if (Number.isNaN(aVal)) return 1;
          if (Number.isNaN(bVal)) return -1;
          return aVal - bVal;
        }

        if (sortOption === "price-desc") {
          const aVal = parsePrice(a.msrp);
          const bVal = parsePrice(b.msrp);
          if (Number.isNaN(aVal) && Number.isNaN(bVal)) return 0;
          if (Number.isNaN(aVal)) return 1;
          if (Number.isNaN(bVal)) return -1;
          return bVal - aVal;
        }

        const aDate = a.releaseDate || "9999-12-31";
        const bDate = b.releaseDate || "9999-12-31";
        if (sortOption === "newest") {
          return bDate.localeCompare(aDate);
        }
        return aDate.localeCompare(bDate);
      });
  }, [filters, products, searchQuery, brandFilter, releaseDateFilter, showTba, sortOption]);

  const toggleCategory = (category: ProductCategory) => {
    setFilters((current) => ({ ...current, [category]: !current[category] }));
  };

  const formatMsrp = (msrp?: string) => {
    if (!msrp) return "TBA";
    const trimmed = String(msrp).trim();
    if (trimmed.startsWith("$")) return trimmed;
    return `$${trimmed}`;
  };

  const selectAll = () => {
    setFilters({ IEMs: true, Headphones: true, Sources: true, Accessories: true, Other: true });
  };

  const clearAll = () => {
    setFilters({ IEMs: false, Headphones: false, Sources: false, Accessories: false, Other: false });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-10 flex flex-col gap-4 rounded-3xl border border-white/10 bg-zinc-900/80 p-8 ring-1 ring-white/5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Audio Prophet</p>
            <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">Upcoming audio products</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-300">
              Browse verified and released submissions. Filter out categories you don’t want to see, or add new products on the contributor page.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/submissions" className="inline-flex items-center justify-center rounded-3xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-400">
              Submit a product
            </Link>
            <Link href="/admin" className="inline-flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              Admin panel
            </Link>
          </div>
        </header>

        <section className="mb-8 rounded-3xl border border-white/10 bg-zinc-900/80 p-6 ring-1 ring-white/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Filter products</p>
              <p className="mt-2 text-sm text-zinc-300">Toggle categories below to hide or show them on the main feed.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={selectAll} className="rounded-2xl bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10">
                Show all
              </button>
              <button type="button" onClick={clearAll} className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/10">
                Clear all
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${filters[category] ? "bg-blue-500 text-white" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-4">
            <label className="block">
              <span className="text-sm font-medium text-zinc-200">Search by name</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search name"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-200">Filter by brand</span>
              <input
                value={brandFilter}
                onChange={(event) => setBrandFilter(event.target.value)}
                placeholder="Brand name"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-200">Release date</span>
              <input
                type="date"
                value={releaseDateFilter}
                onChange={(event) => setReleaseDateFilter(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-200">Sort</span>
              <select
                value={sortOption}
                onChange={(event) => setSortOption(event.target.value as typeof sortOption)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
              >
                <option value="newest">Newest release</option>
                <option value="oldest">Oldest release</option>
                <option value="name-asc">Name A–Z</option>
                <option value="name-desc">Name Z–A</option>
                <option value="price-asc">Price low → high</option>
                <option value="price-desc">Price high → low</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={showTba}
                onChange={(event) => setShowTba(event.target.checked)}
                className="h-4 w-4 rounded border-white/10 bg-zinc-950 text-blue-500"
              />
              Include TBA
            </label>
          </div>
        </section>

        <section className="grid gap-6">
          {loading ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-zinc-300">Loading products…</div>
          ) : error ? (
            <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-8 text-center text-red-200">{error}</div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-zinc-300">
              {products.length === 0
                ? "No verified products yet. Ask contributors to submit the next big drop."
                : "No verified products match the selected categories."}
            </div>
          ) : (
            filteredProducts.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/80 p-6 ring-1 ring-white/5">
                {item.imageDataUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedImage(item.imageDataUrl || null);
                      setExpandedImageAlt(`Image of ${item.name}`);
                    }}
                    className="group mb-6 block w-full overflow-hidden rounded-3xl border border-white/10 relative"
                  >
                    <img
                      src={item.imageDataUrl}
                      alt={`Image of ${item.name}`}
                      className="h-80 w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/60 to-transparent px-4 py-2 text-sm font-medium text-white opacity-0 transition group-hover:opacity-100">
                      View image
                    </span>
                  </button>
                ) : null}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-zinc-400">{item.category}</p>
                    <h2 className="mt-3 text-2xl font-semibold text-white">{item.name}</h2>
                    <p className="mt-2 text-sm text-zinc-400">{item.brand} · MSRP {formatMsrp(item.msrp)}</p>
                  </div>
                  <span className={`inline-flex rounded-full px-4 py-2 text-xs font-semibold ${statusStyles(item.status)}`}>
                    {getStatusLabel(item.status)}
                  </span>
                </div>
                {item.description ? <p className="mt-4 text-sm leading-7 text-zinc-300">{item.description}</p> : null}
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                  <span>Release date: {item.releaseDate || "TBA"}</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <a href={item.source} target="_blank" rel="noreferrer" className="break-all text-sm font-medium text-blue-300 transition hover:text-blue-200">
                    {item.source}
                  </a>
                  <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">Submitted {new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
              </article>
            ))
          )}
        </section>

        {expandedImage ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="relative max-w-5xl overflow-hidden rounded-3xl bg-zinc-950 shadow-2xl">
              <button
                type="button"
                onClick={() => setExpandedImage(null)}
                className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white transition hover:bg-black"
                aria-label="Close image preview"
              >
                ✕
              </button>
              <img src={expandedImage} alt={expandedImageAlt} className="max-h-[85vh] w-full object-contain" />
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

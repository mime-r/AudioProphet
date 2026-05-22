"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ProductItem } from "@/lib/types";

const defaultAdminUser = "admin";
const defaultAdminPass = "password";

export default function AdminPage() {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [items, setItems] = useState<ProductItem[]>([]);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [expandedImageAlt, setExpandedImageAlt] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    brand: "",
    category: "",
    msrp: "",
    source: "",
    description: "",
    releaseDate: "",
  });
  const [editMsrpIsTba, setEditMsrpIsTba] = useState(false);
  const [editImageDataUrl, setEditImageDataUrl] = useState<string | null>(null);
  const [editImageName, setEditImageName] = useState<string>("");
  const [statusFilters, setStatusFilters] = useState<Record<string, boolean>>({
    Pending: true,
    Verified: false,
    Released: false,
    Rejected: false,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [releaseDateFilter, setReleaseDateFilter] = useState("");
  const [showTba, setShowTba] = useState(true);
  const [showOnlyTba, setShowOnlyTba] = useState(false);
  const [sortOption, setSortOption] = useState<"newest" | "oldest" | "name-asc" | "name-desc" | "price-asc" | "price-desc">("newest");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const signedIn = Boolean(authToken);

  useEffect(() => {
    const savedAuth = window.sessionStorage.getItem("adminAuth");
    if (savedAuth) {
      setAuthToken(savedAuth);
    }
  }, []);

  useEffect(() => {
    if (!authToken) return;
    fetchAdminSubmissions(authToken);
  }, [authToken]);

  const fetchAdminSubmissions = async (token: string) => {
    setError(null);
    const response = await fetch("/api/admin", {
      method: "GET",
      headers: { Authorization: `Basic ${token}` },
    });

    if (!response.ok) {
      setItems([]);
      setError("Authentication failed. Check your admin credentials.");
      return;
    }

    const data = await response.json();
    setItems(data);
  };

  const startEditing = (item: ProductItem) => {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      brand: item.brand,
      category: item.category,
      msrp: item.msrp,
      source: item.source,
      description: item.description || "",
      releaseDate: item.releaseDate || "",
    });
    setEditMsrpIsTba(!item.msrp);
    setEditImageDataUrl(item.imageDataUrl || null);
    setEditImageName("");
    setError(null);
    setInfo(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: "", brand: "", category: "", msrp: "", source: "", description: "", releaseDate: "" });
    setEditMsrpIsTba(false);
    setEditImageDataUrl(null);
    setEditImageName("");
  };

  const handleEditChange = (field: keyof typeof editForm, value: string) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  };

  const handleEditFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setEditImageDataUrl(String(reader.result));
      setEditImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveEdit = async (itemId: string) => {
    setError(null);
    setInfo(null);

    if (!authToken) {
      setError("You must be signed in to edit submissions.");
      return;
    }

    if (!editForm.name.trim() || !editForm.brand.trim() || !editForm.source.trim()) {
      setError("Please fill in the product name, brand, and source link.");
      return;
    }

    if (!window.confirm("Save these changes to the submission?")) {
      return;
    }

    const response = await fetch("/api/admin", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${authToken}`,
      },
      body: JSON.stringify({
        id: itemId,
        action: "edit",
        ...editForm,
        imageDataUrl: editImageDataUrl,
      }),
    });

    if (!response.ok) {
      const json = await response.json();
      setError(json?.error || "Unable to save submission edits.");
      return;
    }

    setInfo("Submission updated successfully.");
    cancelEdit();
    fetchAdminSubmissions(authToken);
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);

    const token = btoa(`${user || defaultAdminUser}:${pass || defaultAdminPass}`);
    const response = await fetch("/api/admin", {
      method: "GET",
      headers: { Authorization: `Basic ${token}` },
    });

    if (!response.ok) {
      setError("Unable to authenticate as admin.");
      return;
    }

    window.sessionStorage.setItem("adminAuth", token);
    setAuthToken(token);
    setInfo("Admin signed in successfully.");
  };

  const handleAction = async (id: string, action: "approve" | "release" | "reject") => {
    setError(null);
    setInfo(null);

    if (!authToken) {
      setError("You must be signed in to perform admin actions.");
      return;
    }

    const response = await fetch("/api/admin", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${authToken}`,
      },
      body: JSON.stringify({ id, action }),
    });

    if (!response.ok) {
      const json = await response.json();
      setError(json?.error || "Unable to update submission.");
      return;
    }

    setInfo("Submission status updated.");
    fetchAdminSubmissions(authToken);
  };

  const handleDelete = async (id: string) => {
    setError(null);
    setInfo(null);

    if (!authToken) {
      setError("You must be signed in to delete submissions.");
      return;
    }

    const confirmed = window.confirm("Are you sure you want to delete this submission?");
    if (!confirmed) return;

    const response = await fetch("/api/admin", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${authToken}`,
      },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      const json = await response.json();
      setError(json?.error || "Unable to delete submission.");
      return;
    }

    setInfo("Submission deleted.");
    fetchAdminSubmissions(authToken);
  };

  const selectAllStatuses = () => {
    setStatusFilters({ Pending: true, Verified: true, Released: true, Rejected: true });
  };

  const clearAllStatuses = () => {
    setStatusFilters({ Pending: false, Verified: false, Released: false, Rejected: false });
  };

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const normalizedBrand = brandFilter.trim().toLowerCase();

    return items
      .filter((item) => statusFilters[item.status] ?? false)
      .filter((item) => {
        if (showOnlyTba && item.releaseDate) return false;
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
  }, [items, statusFilters, searchQuery, brandFilter, releaseDateFilter, showTba, showOnlyTba, sortOption]);

  const logout = () => {
    window.sessionStorage.removeItem("adminAuth");
    setAuthToken("");
    setItems([]);
    setInfo("Signed out.");
  };

  const formatMsrp = (msrp?: string) => {
    if (!msrp) return "TBA";
    const trimmed = String(msrp).trim();
    if (trimmed.startsWith("$")) return trimmed;
    return `$${trimmed}`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-white/10 bg-zinc-900/80 p-8 ring-1 ring-white/5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Admin panel</p>
            <h1 className="mt-4 text-4xl font-semibold text-white">Review product submissions</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-300">
              Use admin credentials to approve, release, or reject user submissions. The backend persists all entries.
            </p>
          </div>
          <Link href="/" className="inline-flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
            Browse verified products
          </Link>
        </div>

        <section className="mb-8 rounded-3xl border border-white/10 bg-zinc-900/80 p-8 ring-1 ring-white/5">
          <h2 className="text-2xl font-semibold text-white">Admin Login</h2>
          <p className="mt-2 text-sm text-zinc-400"></p> {/* For further instructions or info */}

          {!signedIn ? (
            <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={handleLogin}>
              <label className="block">
                <span className="text-sm font-medium text-zinc-200">Username</span>
                <input
                  value={user}
                  onChange={(event) => setUser(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                  placeholder="Username"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-200">Password</span>
                <input
                  type="Password"
                  value={pass}
                  onChange={(event) => setPass(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                  placeholder="Password"
                />
              </label>
              <div className="sm:col-span-2 flex flex-wrap gap-3">
                <button type="submit" className="rounded-3xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-400">
                  Sign in
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="rounded-3xl bg-white/5 px-4 py-3 text-sm text-white">Signed in as admin</span>
              <button type="button" onClick={logout} className="rounded-3xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                Sign out
              </button>
            </div>
          )}

          {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
          {info ? <p className="mt-4 text-sm text-green-400">{info}</p> : null}
        </section>

        <section className="rounded-3xl border border-white/10 bg-zinc-900/80 p-8 ring-1 ring-white/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">Submissions</h2>
              <p className="mt-2 text-sm text-zinc-400">Review each pending listing and toggle which status groups are shown.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAllStatuses}
                className="rounded-2xl bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10"
              >
                Show all
              </button>
              <button
                type="button"
                onClick={clearAllStatuses}
                className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/10"
              >
                Hide all
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(statusFilters).map(([status, isVisible]) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilters((current) => ({ ...current, [status]: !current[status] }))}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${isVisible ? "bg-blue-500 text-white" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}
              >
                {status}
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
          <div className="mt-3 flex items-center gap-4 text-sm text-zinc-300">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={showTba}
                onChange={(event) => setShowTba(event.target.checked)}
                className="h-4 w-4 rounded border-white/10 bg-zinc-950 text-blue-500"
              />
              Include TBA
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={showOnlyTba}
                onChange={(event) => setShowOnlyTba(event.target.checked)}
                className="h-4 w-4 rounded border-white/10 bg-zinc-950 text-blue-500"
              />
              Only TBA
            </label>
          </div>

          {filteredItems.length === 0 ? (
            <div className="mt-8 rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-center text-zinc-400">
              {signedIn ? "No submissions match the selected status filters." : "Sign in to load submissions."}
            </div>
          ) : (
            <div className="mt-8 grid gap-6">
              {filteredItems.map((item) => (
                <article key={item.id} className="rounded-3xl border border-white/10 bg-zinc-950/80 p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      
                      <p className="text-sm uppercase tracking-[0.24em] text-zinc-400">{item.category}</p>
                    <h2 className="mt-3 text-2xl font-semibold text-white">{item.brand} {item.name}</h2>
                    <p className="mt-2 text-sm text-zinc-400">MSRP {formatMsrp(item.msrp)}</p>
                    </div>
                    <span className="inline-flex rounded-full bg-blue-100 px-4 py-2 text-xs font-semibold text-blue-800">
                      {item.status}
                    </span>
                  </div>
                  {item.description ? <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-300">{item.description}</p> : null}
                  <br />
                  {item.imageDataUrl ? (
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedImage(item.imageDataUrl || null);
                        setExpandedImageAlt(`Image of ${item.name}`);
                      }}
                      className="group mb-4 block w-full overflow-hidden rounded-3xl border border-white/10"
                    >
                      <img
                        src={item.imageDataUrl}
                        alt={`Image of ${item.name}`}
                        className="h-64 w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    </button>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                    <span>Release date: {item.releaseDate || "TBA"}</span>
                  </div>
                  <div className="mt-4 flex flex-col gap-2 text-sm text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
                    <a href={item.source} target="_blank" rel="noreferrer" className="break-all font-medium text-blue-300 hover:text-blue-200">
                      {item.source}
                    </a>
                    <span>Submitted {new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEditing(item)}
                      className="rounded-2xl border border-white/10 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-200 transition hover:bg-blue-500/20"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction(item.id, "approve")}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction(item.id, "release")}
                      className="rounded-2xl border border-white/10 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-200 transition hover:bg-green-500/20"
                    >
                      Release
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction(item.id, "reject")}
                      className="rounded-2xl border border-white/10 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="rounded-2xl border border-white/10 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20"
                    >
                      Delete
                    </button>
                  </div>

                  {editingId === item.id ? (
                    <div className="mt-6 rounded-3xl border border-white/10 bg-zinc-900/80 p-6">
                      <h4 className="text-lg font-semibold text-white">Edit submission</h4>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-sm font-medium text-zinc-200">Product name</span>
                          <input
                            value={editForm.name}
                            onChange={(event) => handleEditChange("name", event.target.value)}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium text-zinc-200">Brand</span>
                          <input
                            value={editForm.brand}
                            onChange={(event) => handleEditChange("brand", event.target.value)}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                          />
                        </label>
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-sm font-medium text-zinc-200">Category</span>
                          <input
                            value={editForm.category}
                            onChange={(event) => handleEditChange("category", event.target.value)}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium text-zinc-200">MSRP</span>
                          <input
                            type="text"
                            value={editForm.msrp}
                            onChange={(event) => {
                              const val = event.target.value.replace(/[^0-9]/g, "");
                              handleEditChange("msrp", val);
                            }}
                            disabled={editMsrpIsTba}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400 disabled:opacity-50"
                            placeholder="e.g., 999 (whole numbers only)"
                          />
                          <p className="mt-2 text-xs text-zinc-500">Enter whole numbers only (e.g., 99, 1299). No decimals or symbols.</p>
                        </label>
                        <label className="flex items-center gap-3">
                          <div>
                            <span className="text-sm font-medium text-zinc-200">MSRP is TBA</span>
                            <p className="mt-1 text-xs text-zinc-500">Check if price not yet announced</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={editMsrpIsTba}
                            onChange={(event) => {
                              setEditMsrpIsTba(event.target.checked);
                              if (event.target.checked) {
                                handleEditChange("msrp", "");
                              }
                            }}
                            className="h-5 w-5 rounded border-white/10 bg-zinc-950 text-blue-500"
                          />
                        </label>
                      </div>
                      <label className="mt-4 block">
                        <span className="text-sm font-medium text-zinc-200">Source link</span>
                        <input
                          value={editForm.source}
                          onChange={(event) => handleEditChange("source", event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                        />
                      </label>
                      <label className="mt-4 block">
                        <span className="text-sm font-medium text-zinc-200">Release date</span>
                        <input
                          type="date"
                          value={editForm.releaseDate}
                          onChange={(event) => handleEditChange("releaseDate", event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                        />
                        <p className="mt-2 text-xs text-zinc-500">Leave empty for TBA.</p>
                      </label>
                      <label className="mt-4 block">
                        <span className="text-sm font-medium text-zinc-200">Notes</span>
                        <textarea
                          value={editForm.description}
                          maxLength={300}
                          onChange={(event) => handleEditChange("description", event.target.value)}
                          className="mt-2 min-h-[120px] w-full rounded-3xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                        />
                        <p className="mt-2 text-xs text-zinc-500">Character limit: {editForm.description.length}/300</p>
                      </label>
                      <label className="mt-4 block">
                        <span className="text-sm font-medium text-zinc-200">Replace image</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleEditFileChange}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                        />
                      </label>
                      {editImageName ? (
                        <p className="mt-3 text-sm text-zinc-300">Selected image: {editImageName}</p>
                      ) : null}
                      <div className="mt-6 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(item.id)}
                          className="rounded-3xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-400"
                        >
                          Save changes
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-3xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        {expandedImage ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true">
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

let allProducts = [];
let editId = null;

function showToast(msg, type = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast " + type;
  el.classList.remove("hidden");
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.add("hidden"), 4000);
}

function $(id) { return document.getElementById(id); }

async function fetchStats() {
  try {
    const res = await fetch("/api/stats");
    const stats = await res.json();
    $("statTotal").textContent = stats.total;
    $("statReviewed").textContent = stats.reviewed;
    $("statApproved").textContent = stats.approved;
    $("statSubmitted").textContent = stats.submitted;
    $("statTwitter").textContent = stats.twitter;
    $("statHeadfi").textContent = stats.headfi;
  } catch {}
}

async function fetchProducts() {
  try {
    const res = await fetch("/api/items");
    allProducts = await res.json();
  } catch (err) {
    showToast("Failed to load products", "error");
    allProducts = [];
  }
}

function applyFilters() {
  const search = $("searchInput").value.toLowerCase();
  const showTwitter = $("filterTwitter").checked;
  const showHeadfi = $("filterHeadfi").checked;
  const showReviewed = $("filterReviewed").checked;
  const showApproved = $("filterApproved").checked;
  const showSubmitted = $("filterSubmitted").checked;
  const minConf = parseFloat($("confidenceFilter").value);
  const sort = $("sortFilter").value;

  let filtered = allProducts.filter((p) => {
    if (!showTwitter && p.sourceType === "twitter") return false;
    if (!showHeadfi && p.sourceType === "headfi") return false;
    if (showReviewed && !p.reviewed) return false;
    if (showApproved && !p.approved) return false;
    if (showSubmitted && !p.submitted) return false;
    if (p.confidence < minConf) return false;
    if (search) {
      const text = (p.name + " " + p.brand + " " + p.notes).toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });

  if (sort === "confidence") filtered.sort((a, b) => b.confidence - a.confidence);
  else if (sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));
  else filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  renderProducts(filtered);
}

function renderProducts(products) {
  const list = $("productList");
  const empty = $("emptyState");

  if (products.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  list.innerHTML = products.map((p) => {
    const confPct = Math.round(p.confidence * 100);
    const sourceBadge = p.sourceType === "twitter" ? "badge-twitter" : "badge-headfi";
    const sourceLabel = p.sourceType === "twitter" ? "Twitter/X" : "Head-Fi";

    const badgeHtml = `
      <span class="badge ${sourceBadge}">${sourceLabel}</span>
      <span class="badge badge-confidence">${confPct}%</span>
      ${p.reviewed ? '<span class="badge badge-review">Reviewed</span>' : ""}
      ${p.approved ? '<span class="badge badge-approved">Approved</span>' : ""}
      ${p.submitted ? '<span class="badge badge-submitted">Submitted</span>' : ""}
    `;

    const submittedClass = p.submitted ? "submitted" : "";

    return `
      <div class="product-card ${submittedClass}" data-id="${p.id}">
        <div class="product-card-header">
          <div class="product-card-info">
            <div class="product-category">${p.category}</div>
            <div class="product-name">${escHtml(p.brand)} ${escHtml(p.name)}</div>
            <div class="product-meta">
              <span>💲 ${escHtml(p.msrp || "TBA")}</span>
              <span>📅 ${escHtml(p.releaseDate || "TBA")}</span>
              <span>🕐 ${new Date(p.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          <div class="product-badges">${badgeHtml}</div>
        </div>
        ${p.notes ? `<div class="product-notes">${escHtml(p.notes)}</div>` : ""}
        ${p.submissionError ? `<div class="product-error">${escHtml(p.submissionError)}</div>` : ""}
        ${p.rawContent ? `<div class="product-raw" onclick="this.classList.toggle('expanded')">${escHtml(p.rawContent)}</div>` : ""}
        <a href="${escHtml(p.sourceUrl)}" target="_blank" rel="noreferrer" class="product-source">${escHtml(p.sourceUrl)}</a>
        <div class="product-actions">
          <button class="btn btn-sm btn-outline" onclick="openEdit('${p.id}')">Edit</button>
          ${p.approved && !p.submitted
            ? `<button class="btn btn-sm btn-success" onclick="submitProduct('${p.id}')">Submit to App</button>`
            : ""}
          ${!p.approved
            ? `<button class="btn btn-sm btn-outline" onclick="toggleApproved('${p.id}', true)">Mark Approved</button>`
            : `<button class="btn btn-sm btn-outline" onclick="toggleApproved('${p.id}', false)">Unmark Approved</button>`}
          ${!p.reviewed
            ? `<button class="btn btn-sm btn-outline" onclick="markReviewed('${p.id}')">Mark Reviewed</button>`
            : ""}
          <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

function escHtml(s) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function runScrape() {
  const btn = $("runScrapeBtn");
  btn.disabled = true;
  btn.textContent = "Scraping...";
  $("progressBanner").classList.remove("hidden");

  try {
    const res = await fetch("/api/run/scrape", { method: "POST" });
    const data = await res.json();
    showToast(data.message || "Scrape started", "success");

    await new Promise((r) => setTimeout(r, 3000));
    await fetchProducts();
    await fetchStats();
    applyFilters();
  } catch (err) {
    showToast("Failed to start scrape", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Run Scrape";
    $("progressBanner").classList.add("hidden");
  }
}

async function toggleApproved(id, approved) {
  try {
    const res = await fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved, reviewed: approved ? true : undefined }),
    });
    if (!res.ok) { showToast("Failed to update", "error"); return; }
    await fetchProducts();
    applyFilters();
    await fetchStats();
    showToast(approved ? "Approved" : "Unmarked", "success");
  } catch {
    showToast("Failed to update", "error");
  }
}

async function markReviewed(id) {
  try {
    const res = await fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewed: true }),
    });
    if (!res.ok) { showToast("Failed to update", "error"); return; }
    await fetchProducts();
    applyFilters();
    await fetchStats();
    showToast("Marked as reviewed", "success");
  } catch {
    showToast("Failed to update", "error");
  }
}

async function submitProduct(id) {
  if (!confirm("Submit this product to the main Audio Prophet app?")) return;

  try {
    const res = await fetch(`/api/items/${id}/submit`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Failed to submit", "error"); return; }
    await fetchProducts();
    applyFilters();
    await fetchStats();
    showToast("Submitted to Audio Prophet!", "success");
  } catch {
    showToast("Failed to submit", "error");
  }
}

async function deleteProduct(id) {
  if (!confirm("Delete this product permanently?")) return;

  try {
    const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
    if (!res.ok) { showToast("Failed to delete", "error"); return; }
    await fetchProducts();
    applyFilters();
    await fetchStats();
    showToast("Deleted", "success");
  } catch {
    showToast("Failed to delete", "error");
  }
}

function openEdit(id) {
  const p = allProducts.find((x) => x.id === id);
  if (!p) return;
  editId = id;
  $("editName").value = p.name;
  $("editBrand").value = p.brand;
  $("editCategory").value = p.category;
  $("editMsrp").value = p.msrp && p.msrp !== "TBA" ? p.msrp : "";
  $("editReleaseDate").value = p.releaseDate || "";
  $("editSource").value = p.source || "";
  $("editNotes").value = p.notes || "";
  $("editErrors").classList.add("hidden");
  $("editModal").classList.remove("hidden");
}

function closeEditModal() {
  editId = null;
  $("editModal").classList.add("hidden");
}

async function saveEdit() {
  if (!editId) return;

  const changes = {
    name: $("editName").value.trim(),
    brand: $("editBrand").value.trim(),
    category: $("editCategory").value,
    msrp: $("editMsrp").value.trim() || "TBA",
    releaseDate: $("editReleaseDate").value || "",
    source: $("editSource").value.trim(),
    notes: $("editNotes").value.trim().slice(0, 300),
  };

  const errors = [];
  if (!changes.name) errors.push("Product name is required.");
  if (!changes.brand) errors.push("Brand is required.");
  if (!changes.source) errors.push("Source URL is required.");
  if ((changes.notes || "").length > 300) errors.push("Notes must be 300 characters or less.");
  if (changes.releaseDate && Number.isNaN(Date.parse(changes.releaseDate))) {
    errors.push("Release date is invalid.");
  }

  if (errors.length > 0) {
    const el = $("editErrors");
    el.innerHTML = errors.map((e) => "<div>" + e + "</div>").join("");
    el.classList.remove("hidden");
    return;
  }

  try {
    const res = await fetch(`/api/items/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (!res.ok) { showToast("Failed to save", "error"); return; }
    closeEditModal();
    await fetchProducts();
    applyFilters();
    showToast("Changes saved", "success");
  } catch {
    showToast("Failed to save", "error");
  }
}

// Init
async function init() {
  await fetchStats();
  await fetchProducts();
  applyFilters();
}

init();

const TOKEN_KEY = "dd_admin_token";

const state = {
  token: "",
  products: [],
  orders: [],
};

const el = {
  adminToken: document.getElementById("adminToken"),
  connectBtn: document.getElementById("connectBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  authStatus: document.getElementById("authStatus"),
  productsEditor: document.getElementById("productsEditor"),
  addProductBtn: document.getElementById("addProductBtn"),
  saveProductsBtn: document.getElementById("saveProductsBtn"),
  refreshOrdersBtn: document.getElementById("refreshOrdersBtn"),
  ordersBody: document.getElementById("ordersBody"),
  panelToast: document.getElementById("panelToast"),
};

document.addEventListener("DOMContentLoaded", () => {
  state.token = localStorage.getItem(TOKEN_KEY) || "";
  if (el.adminToken) el.adminToken.value = state.token;

  bindEvents();

  if (state.token) {
    loadOverview();
  }
});

function bindEvents() {
  el.connectBtn?.addEventListener("click", async () => {
    const token = String(el.adminToken?.value || "").trim();
    if (!token) {
      setStatus("Token admin manquant.");
      return;
    }

    state.token = token;
    localStorage.setItem(TOKEN_KEY, token);
    await loadOverview();
  });

  el.logoutBtn?.addEventListener("click", () => {
    state.token = "";
    localStorage.removeItem(TOKEN_KEY);
    if (el.adminToken) el.adminToken.value = "";
    setStatus("Token effacé.");
    state.products = [];
    state.orders = [];
    renderProducts();
    renderOrders();
  });

  el.addProductBtn?.addEventListener("click", () => {
    state.products.push({
      id: `produit-${Date.now()}`,
      title: "Nouveau produit",
      description: "",
      image: "images/products/pull-premium.svg",
      price: 0,
      tag: "",
      active: true,
    });
    renderProducts();
  });

  el.saveProductsBtn?.addEventListener("click", saveProducts);
  el.refreshOrdersBtn?.addEventListener("click", loadOrdersOnly);

  el.productsEditor?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const removeBtn = target.closest("button[data-action='remove-product']");
    if (!removeBtn) return;

    const index = Number(removeBtn.getAttribute("data-index"));
    if (!Number.isInteger(index)) return;

    state.products.splice(index, 1);
    renderProducts();
  });

  el.ordersBody?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest("button[data-action='save-order']");
    if (!button) return;

    const orderId = button.getAttribute("data-id");
    if (!orderId) return;

    const row = button.closest("tr");
    if (!row) return;

    const statusInput = row.querySelector("select[data-role='order-status']");
    const noteInput = row.querySelector("input[data-role='order-note']");

    const status = String(statusInput?.value || "");
    const note = String(noteInput?.value || "");

    await saveOrder(orderId, status, note);
  });
}

async function loadOverview() {
  if (!state.token) {
    setStatus("Connecte-toi avec ADMIN_API_TOKEN.");
    return;
  }

  try {
    const payload = await api("/api/admin/overview", { method: "GET" });
    state.products = Array.isArray(payload.products) ? payload.products : [];
    state.orders = Array.isArray(payload.orders) ? payload.orders : [];

    renderProducts();
    renderOrders();

    setStatus("Connecté. Données chargées.");
  } catch (error) {
    setStatus(error.message || "Échec de connexion admin.");
    showToast(error.message || "Erreur admin");
  }
}

async function loadOrdersOnly() {
  if (!state.token) {
    setStatus("Connecte-toi d'abord.");
    return;
  }

  try {
    const payload = await api("/api/admin/orders", { method: "GET" });
    state.orders = Array.isArray(payload.orders) ? payload.orders : [];
    renderOrders();
    showToast("Commandes rafraîchies.");
  } catch (error) {
    showToast(error.message || "Impossible de charger les commandes.");
  }
}

function renderProducts() {
  if (!el.productsEditor) return;

  if (!state.products.length) {
    el.productsEditor.innerHTML = `<p class="status">Aucun produit. Utilise \"Ajouter\".</p>`;
    return;
  }

  el.productsEditor.innerHTML = state.products
    .map((product, index) => {
      return `
      <article class="product-row" data-index="${index}">
        <div class="product-row-grid">
          <label>
            <span>ID</span>
            <input data-field="id" value="${escapeAttr(product.id || "")}" />
          </label>
          <label>
            <span>Nom</span>
            <input data-field="title" value="${escapeAttr(product.title || "")}" />
          </label>
          <label>
            <span>Prix (EUR)</span>
            <input data-field="price" type="number" min="0" step="0.01" value="${Number(product.price || 0)}" />
          </label>
          <label>
            <span>Tag</span>
            <input data-field="tag" value="${escapeAttr(product.tag || "")}" />
          </label>
          <label>
            <span>Image</span>
            <input data-field="image" value="${escapeAttr(product.image || "")}" />
          </label>
          <label>
            <span>Actif</span>
            <select data-field="active">
              <option value="true" ${product.active !== false ? "selected" : ""}>Oui</option>
              <option value="false" ${product.active === false ? "selected" : ""}>Non</option>
            </select>
          </label>
        </div>
        <label>
          <span>Description</span>
          <textarea data-field="description">${escapeHtml(product.description || "")}</textarea>
        </label>
        <div class="product-tools">
          <button type="button" class="ghost" data-action="remove-product" data-index="${index}">Supprimer</button>
        </div>
      </article>
      `;
    })
    .join("");
}

function collectProductsFromForm() {
  const rows = Array.from(document.querySelectorAll(".product-row"));

  return rows.map((row, index) => {
    const read = (field) => {
      const input = row.querySelector(`[data-field='${field}']`);
      return input ? String(input.value || "") : "";
    };

    const idRaw = read("id").trim();
    const title = read("title").trim() || `Produit ${index + 1}`;

    return {
      id: slugify(idRaw || title),
      title,
      description: read("description").trim(),
      image: read("image").trim(),
      price: Number.parseFloat(read("price")) || 0,
      tag: read("tag").trim(),
      active: read("active") !== "false",
    };
  });
}

async function saveProducts() {
  if (!state.token) {
    setStatus("Connecte-toi d'abord.");
    return;
  }

  const items = collectProductsFromForm();

  try {
    const payload = await api("/api/admin/products", {
      method: "PUT",
      body: JSON.stringify({ items }),
    });

    state.products = Array.isArray(payload.items) ? payload.items : items;
    renderProducts();
    showToast("Produits enregistrés.");
  } catch (error) {
    showToast(error.message || "Échec de sauvegarde produits.");
  }
}

function renderOrders() {
  if (!el.ordersBody) return;

  if (!state.orders.length) {
    el.ordersBody.innerHTML = `<tr><td colspan="6">Aucune commande pour le moment.</td></tr>`;
    return;
  }

  const sorted = state.orders.slice().sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });

  el.ordersBody.innerHTML = sorted
    .map((order) => {
      return `
      <tr>
        <td><code>${escapeHtml(order.id || "")}</code></td>
        <td>${formatDate(order.createdAt)}</td>
        <td>${formatCurrency(order.subtotal || 0)}</td>
        <td>
          <select data-role="order-status">
            ${["checkout_pending", "paid", "processing", "shipped", "delivered", "cancelled"]
              .map((status) => `<option value="${status}" ${order.status === status ? "selected" : ""}>${status}</option>`)
              .join("")}
          </select>
        </td>
        <td>${escapeHtml(order.customerEmail || "-")}</td>
        <td>
          <div class="row">
            <input data-role="order-note" placeholder="Note" value="${escapeAttr(order.note || "")}" />
            <button data-action="save-order" data-id="${escapeAttr(order.id || "")}" type="button">Sauver</button>
          </div>
        </td>
      </tr>
      `;
    })
    .join("");
}

async function saveOrder(orderId, status, note) {
  try {
    await api(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status, note }),
    });

    const order = state.orders.find((entry) => entry.id === orderId);
    if (order) {
      order.status = status;
      order.note = note;
    }

    showToast("Commande mise à jour.");
  } catch (error) {
    showToast(error.message || "Impossible de mettre à jour la commande.");
  }
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": state.token,
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Erreur API (${response.status})`);
  }

  return payload;
}

function setStatus(text) {
  if (!el.authStatus) return;
  el.authStatus.textContent = text;
}

function showToast(message) {
  if (!el.panelToast) return;
  el.panelToast.textContent = message;
  el.panelToast.classList.add("show");
  setTimeout(() => {
    el.panelToast.classList.remove("show");
  }, 2400);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

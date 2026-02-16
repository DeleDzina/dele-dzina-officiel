const TOKEN_KEY = "dd_admin_token";

const state = {
  token: "",
  products: [],
  orders: [],
  site: {},
};

const el = {
  adminToken: document.getElementById("adminToken"),
  connectBtn: document.getElementById("connectBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  authStatus: document.getElementById("authStatus"),

  saveSiteBtn: document.getElementById("saveSiteBtn"),
  addSocialBtn: document.getElementById("addSocialBtn"),
  socialsEditor: document.getElementById("socialsEditor"),
  siteHeroTitle: document.getElementById("siteHeroTitle"),
  siteHeroSubtitle: document.getElementById("siteHeroSubtitle"),
  siteHeroCtaText: document.getElementById("siteHeroCtaText"),
  siteHeroMeta: document.getElementById("siteHeroMeta"),
  siteCollectionsTitle: document.getElementById("siteCollectionsTitle"),
  siteCollectionsSubtitle: document.getElementById("siteCollectionsSubtitle"),
  siteVisionTitle: document.getElementById("siteVisionTitle"),
  siteAboutText: document.getElementById("siteAboutText"),
  siteContactTitle: document.getElementById("siteContactTitle"),
  siteContactSubtitle: document.getElementById("siteContactSubtitle"),
  siteNewsletterTitle: document.getElementById("siteNewsletterTitle"),
  siteNewsletterSubtitle: document.getElementById("siteNewsletterSubtitle"),
  siteSocialsTitle: document.getElementById("siteSocialsTitle"),
  siteDassiTitle: document.getElementById("siteDassiTitle"),
  siteContactEmail: document.getElementById("siteContactEmail"),
  siteContactButtonText: document.getElementById("siteContactButtonText"),
  siteTrustPaymentTitle: document.getElementById("siteTrustPaymentTitle"),
  siteTrustPaymentText: document.getElementById("siteTrustPaymentText"),
  siteTrustShippingTitle: document.getElementById("siteTrustShippingTitle"),
  siteTrustShippingText: document.getElementById("siteTrustShippingText"),
  siteTrustSupportTitle: document.getElementById("siteTrustSupportTitle"),
  siteTrustSupportText: document.getElementById("siteTrustSupportText"),
  siteSiteUrl: document.getElementById("siteSiteUrl"),
  siteGaMeasurementId: document.getElementById("siteGaMeasurementId"),

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
  } else {
    setStatus("Connecte-toi avec ADMIN_API_TOKEN.");
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
    state.site = {};
    renderProducts();
    renderOrders();
    renderSiteForm();
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
  el.saveSiteBtn?.addEventListener("click", saveSite);

  el.addSocialBtn?.addEventListener("click", () => {
    const socials = Array.isArray(state.site.socials) ? state.site.socials : [];
    socials.push({
      name: "Réseau",
      handle: "",
      url: "https://",
    });
    state.site.socials = socials;
    renderSocialsEditor();
  });

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

  el.socialsEditor?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const removeBtn = target.closest("button[data-action='remove-social']");
    if (!removeBtn) return;

    const index = Number(removeBtn.getAttribute("data-index"));
    if (!Number.isInteger(index)) return;

    const socials = Array.isArray(state.site.socials) ? state.site.socials : [];
    socials.splice(index, 1);
    state.site.socials = socials;
    renderSocialsEditor();
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
    state.site = payload.site && typeof payload.site === "object" ? payload.site : {};

    renderSiteForm();
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

function renderSiteForm() {
  writeInput(el.siteHeroTitle, state.site.hero_title);
  writeInput(el.siteHeroSubtitle, state.site.hero_subtitle);
  writeInput(el.siteHeroCtaText, state.site.hero_cta_text);
  writeInput(el.siteHeroMeta, asLines(state.site.hero_meta));
  writeInput(el.siteCollectionsTitle, state.site.collections_title);
  writeInput(el.siteCollectionsSubtitle, state.site.collections_subtitle);
  writeInput(el.siteVisionTitle, state.site.vision_title);
  writeInput(el.siteAboutText, state.site.about_text);
  writeInput(el.siteContactTitle, state.site.contact_title);
  writeInput(el.siteContactSubtitle, state.site.contact_subtitle);
  writeInput(el.siteNewsletterTitle, state.site.newsletter_title);
  writeInput(el.siteNewsletterSubtitle, state.site.newsletter_subtitle);
  writeInput(el.siteSocialsTitle, state.site.socials_title);
  writeInput(el.siteDassiTitle, state.site.dassi_title);
  writeInput(el.siteContactEmail, state.site.contact_email);
  writeInput(el.siteContactButtonText, state.site.contact_button_text);
  writeInput(el.siteTrustPaymentTitle, state.site.trust_payment_title);
  writeInput(el.siteTrustPaymentText, state.site.trust_payment_text);
  writeInput(el.siteTrustShippingTitle, state.site.trust_shipping_title);
  writeInput(el.siteTrustShippingText, state.site.trust_shipping_text);
  writeInput(el.siteTrustSupportTitle, state.site.trust_support_title);
  writeInput(el.siteTrustSupportText, state.site.trust_support_text);
  writeInput(el.siteSiteUrl, state.site.site_url);
  writeInput(el.siteGaMeasurementId, state.site.ga_measurement_id);

  renderSocialsEditor();
}

function renderSocialsEditor() {
  if (!el.socialsEditor) return;
  const socials = Array.isArray(state.site.socials) ? state.site.socials : [];

  if (!socials.length) {
    el.socialsEditor.innerHTML = `<p class="status">Aucun réseau. Clique "Ajouter réseau".</p>`;
    return;
  }

  el.socialsEditor.innerHTML = socials
    .map((social, index) => {
      return `
      <article class="social-row" data-index="${index}">
        <div class="social-row-grid">
          <label>
            <span>Nom</span>
            <input data-field="name" value="${escapeAttr(social.name || "")}" />
          </label>
          <label>
            <span>Handle</span>
            <input data-field="handle" value="${escapeAttr(social.handle || "")}" />
          </label>
          <label>
            <span>Lien</span>
            <input data-field="url" value="${escapeAttr(social.url || "")}" />
          </label>
        </div>
        <div class="product-tools">
          <button type="button" class="ghost" data-action="remove-social" data-index="${index}">Supprimer</button>
        </div>
      </article>
      `;
    })
    .join("");
}

function collectSiteFromForm() {
  const socials = Array.from(document.querySelectorAll(".social-row")).map((row) => {
    const read = (field) => {
      const input = row.querySelector(`[data-field='${field}']`);
      return input ? String(input.value || "").trim() : "";
    };

    return {
      name: read("name"),
      handle: read("handle"),
      url: read("url"),
    };
  });

  return {
    hero_title: readValue(el.siteHeroTitle),
    hero_subtitle: readValue(el.siteHeroSubtitle),
    hero_cta_text: readValue(el.siteHeroCtaText),
    hero_meta: readLines(el.siteHeroMeta),
    collections_title: readValue(el.siteCollectionsTitle),
    collections_subtitle: readValue(el.siteCollectionsSubtitle),
    vision_title: readValue(el.siteVisionTitle),
    about_text: readValue(el.siteAboutText),
    contact_title: readValue(el.siteContactTitle),
    contact_subtitle: readValue(el.siteContactSubtitle),
    newsletter_title: readValue(el.siteNewsletterTitle),
    newsletter_subtitle: readValue(el.siteNewsletterSubtitle),
    socials_title: readValue(el.siteSocialsTitle),
    dassi_title: readValue(el.siteDassiTitle),
    contact_email: readValue(el.siteContactEmail),
    contact_button_text: readValue(el.siteContactButtonText),
    trust_payment_title: readValue(el.siteTrustPaymentTitle),
    trust_payment_text: readValue(el.siteTrustPaymentText),
    trust_shipping_title: readValue(el.siteTrustShippingTitle),
    trust_shipping_text: readValue(el.siteTrustShippingText),
    trust_support_title: readValue(el.siteTrustSupportTitle),
    trust_support_text: readValue(el.siteTrustSupportText),
    site_url: readValue(el.siteSiteUrl),
    ga_measurement_id: readValue(el.siteGaMeasurementId),
    socials: socials.filter((entry) => entry.name),
  };
}

async function saveSite() {
  if (!state.token) {
    setStatus("Connecte-toi d'abord.");
    return;
  }

  const site = collectSiteFromForm();

  try {
    const payload = await api("/api/admin/site", {
      method: "PUT",
      body: JSON.stringify(site),
    });

    state.site = payload.site && typeof payload.site === "object" ? payload.site : site;
    renderSiteForm();
    showToast("Contenu du site enregistré.");
  } catch (error) {
    showToast(error.message || "Échec de sauvegarde du contenu.");
  }
}

function renderProducts() {
  if (!el.productsEditor) return;

  if (!state.products.length) {
    el.productsEditor.innerHTML = `<p class="status">Aucun produit. Utilise "Ajouter".</p>`;
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
            <span>Image (URL ou chemin)</span>
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

function readValue(input) {
  return input ? String(input.value || "").trim() : "";
}

function writeInput(input, value) {
  if (!input) return;
  input.value = String(value || "");
}

function readLines(input) {
  const text = readValue(input);
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function asLines(value) {
  if (!Array.isArray(value)) return "";
  return value.map((entry) => String(entry || "")).filter(Boolean).join("\n");
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

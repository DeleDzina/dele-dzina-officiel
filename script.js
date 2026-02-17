const CART_STORAGE_KEY = "dd_cart_v1";
const ADMIN_PORTAL_PATH = "/dd-portal-269.html";
const ADMIN_SHORTCUT_WINDOW_MS = 700;

const state = {
  site: {},
  products: [],
  cart: [],
  isCheckoutLoading: false,
  analyticsReady: false,
  analyticsMeasurementId: "",
  cartReturnFocusEl: null,
  adminLastDAt: 0,
};

const elements = {
  body: document.body,
  menuToggle: document.querySelector(".menu-toggle"),
  mobileMenu: document.getElementById("mobileMenu"),
  heroScroll: document.getElementById("heroScroll"),
  parallaxItems: document.querySelectorAll("[data-parallax]"),
  heroLogo: document.querySelector(".hero-logo"),
  heroScrollLogo: document.querySelector(".hero-scroll-logo"),
  collectionsGrid: document.getElementById("collectionsGrid"),
  relatedGrid: document.getElementById("relatedGrid"),
  productSearch: document.getElementById("productSearch"),
  searchToggleBtn: document.getElementById("searchToggleBtn"),
  searchPopover: document.getElementById("searchPopover"),
  productSort: document.getElementById("productSort"),
  openCartBtn: document.getElementById("openCartBtn"),
  closeCartBtn: document.getElementById("closeCartBtn"),
  cartDrawer: document.getElementById("cartDrawer"),
  cartBackdrop: document.getElementById("cartBackdrop"),
  cartCount: document.getElementById("cartCount"),
  cartItems: document.getElementById("cartItems"),
  cartTotal: document.getElementById("cartTotal"),
  checkoutBtn: document.getElementById("checkoutBtn"),
  checkoutEmail: document.getElementById("checkoutEmail"),
  toast: document.getElementById("toast"),
  newsletterForm: document.getElementById("newsletterForm"),
  newsletterEmail: document.getElementById("newsletterEmail"),
  newsletterMessage: document.getElementById("newsletterMessage"),
  heroTitle: document.getElementById("heroTitle"),
  heroSubtitle: document.getElementById("heroSubtitle"),
  heroCta: document.getElementById("heroCta"),
  heroMeta: document.getElementById("heroMeta"),
  collectionsTitle: document.getElementById("collectionsTitle"),
  collectionsSubtitle: document.getElementById("collectionsSubtitle"),
  visionTitle: document.getElementById("visionTitle"),
  aboutText: document.getElementById("aboutText"),
  contactTitle: document.getElementById("contactTitle"),
  contactSubtitle: document.getElementById("contactSubtitle"),
  newsletterTitle: document.getElementById("newsletterTitle"),
  newsletterSubtitle: document.getElementById("newsletterSubtitle"),
  socialsTitle: document.getElementById("socialsTitle"),
  dassiTitle: document.getElementById("dassiTitle"),
  socialList: document.getElementById("socialList"),
  contactEmail: document.getElementById("contactEmail"),
  contactMailLink: document.getElementById("contactMailLink"),
  trustPaymentTitle: document.getElementById("trustPaymentTitle"),
  trustPaymentText: document.getElementById("trustPaymentText"),
  trustShippingTitle: document.getElementById("trustShippingTitle"),
  trustShippingText: document.getElementById("trustShippingText"),
  trustSupportTitle: document.getElementById("trustSupportTitle"),
  trustSupportText: document.getElementById("trustSupportText"),
  currentYear: document.getElementById("currentYear"),
  productImage: document.getElementById("productImage"),
  productTitle: document.getElementById("productTitle"),
  productPrice: document.getElementById("productPrice"),
  productDescription: document.getElementById("productDescription"),
  productTag: document.getElementById("productTag"),
  productQty: document.getElementById("productQty"),
  addToCartBtn: document.getElementById("addToCartBtn"),
  buyNowBtn: document.getElementById("buyNowBtn"),
};

document.addEventListener("DOMContentLoaded", async () => {
  state.cart = readCart();
  setupStaticUI();
  setupScrollEffects();
  setupCartEvents();
  setupNewsletter();

  await Promise.all([loadSiteContent(), loadProducts()]);

  const page = elements.body?.dataset?.page || "home";
  if (page === "home") {
    setupHomePage();
  }
  if (page === "product") {
    setupProductPage();
  }

  setupLiveSync(page);

  renderCart();
  updateCartCount();
  revealOnScroll();

  trackEvent("page_view", {
    page: window.location.pathname,
    pageType: elements.body?.dataset?.page || "unknown",
  });
});

function setupStaticUI() {
  if (elements.currentYear) {
    elements.currentYear.textContent = String(new Date().getFullYear());
  }

  if (elements.menuToggle && elements.mobileMenu) {
    elements.menuToggle.setAttribute("aria-expanded", "false");
    elements.menuToggle.setAttribute("aria-controls", "mobileMenu");
    elements.menuToggle.addEventListener("click", () => {
      const isOpen = elements.mobileMenu.classList.toggle("open");
      elements.menuToggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  if (elements.heroScroll) {
    elements.heroScroll.addEventListener("click", () => {
      document.querySelector("#collections")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  if (elements.searchToggleBtn && elements.searchPopover) {
    elements.searchToggleBtn.setAttribute("aria-expanded", "false");
    elements.searchToggleBtn.addEventListener("click", () => {
      if (!elements.searchPopover) return;
      const willOpen = elements.searchPopover.hasAttribute("hidden");
      if (willOpen) {
        elements.searchPopover.removeAttribute("hidden");
        elements.searchToggleBtn?.setAttribute("aria-expanded", "true");
        elements.productSearch?.focus();
      } else {
        elements.searchPopover.setAttribute("hidden", "");
        elements.searchToggleBtn?.setAttribute("aria-expanded", "false");
      }
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (elements.mobileMenu && elements.menuToggle) {
      const clickedInsideMenu = elements.mobileMenu.contains(target) || elements.menuToggle.contains(target);
      if (!clickedInsideMenu) {
        elements.mobileMenu.classList.remove("open");
        elements.menuToggle?.setAttribute("aria-expanded", "false");
      }
    }

    if (elements.searchPopover && elements.searchToggleBtn) {
      const clickedInsideSearch = elements.searchPopover.contains(target) || elements.searchToggleBtn.contains(target);
      if (!clickedInsideSearch) {
        elements.searchPopover.setAttribute("hidden", "");
        elements.searchToggleBtn.setAttribute("aria-expanded", "false");
      }
    }
  });

  // Hidden admin shortcut: press D twice quickly from anywhere on the page.
  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (isEditableTarget(event.target)) return;

    const key = String(event.key || "").toLowerCase();
    if (key !== "d") return;

    const now = Date.now();
    if (now - state.adminLastDAt <= ADMIN_SHORTCUT_WINDOW_MS) {
      state.adminLastDAt = 0;
      window.location.href = ADMIN_PORTAL_PATH;
      return;
    }

    state.adminLastDAt = now;
  });
}

function setupScrollEffects() {
  window.addEventListener("scroll", () => {
    revealOnScroll();
    handleHeaderSwap();
    handleParallax();
    handleLogoMotion();
    handleScrollLogo();
  });

  handleHeaderSwap();
  handleParallax();
  handleLogoMotion();
  handleScrollLogo();
}

function revealOnScroll() {
  const trigger = window.innerHeight * 0.86;
  document.querySelectorAll(".reveal").forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.top < trigger) {
      element.classList.add("visible");
    }
  });
}

function handleHeaderSwap() {
  if (!elements.body) return;
  if (window.scrollY > 60) {
    elements.body.classList.add("scrolled");
  } else {
    elements.body.classList.remove("scrolled");
  }
}

function handleParallax() {
  const offset = window.scrollY * 0.12;
  elements.parallaxItems.forEach((item) => {
    item.style.transform = `translateY(${offset}px)`;
  });
}

function handleLogoMotion() {
  if (!elements.heroLogo) return;
  const scrollY = window.scrollY;
  const tilt = Math.min(8, scrollY / 90);
  const rot = Math.sin(scrollY / 180) * 3;
  elements.heroLogo.style.setProperty("--logo-tilt", `${tilt}deg`);
  elements.heroLogo.style.setProperty("--logo-rot", `${rot}deg`);
}

function handleScrollLogo() {
  if (!elements.heroScrollLogo) return;
  const rotation = (window.scrollY * -0.6) % 360;
  elements.heroScrollLogo.style.transform = `rotate(${rotation}deg)`;
}

async function loadSiteContent() {
  const siteData = await fetchJsonWithFallback("/api/site", "data/site.json", {});
  state.site = siteData;
  initAnalytics(siteData);

  if (elements.heroTitle && siteData.hero_title) elements.heroTitle.textContent = siteData.hero_title;
  if (elements.heroSubtitle && siteData.hero_subtitle) elements.heroSubtitle.textContent = siteData.hero_subtitle;
  if (elements.heroCta && siteData.hero_cta_text) elements.heroCta.textContent = siteData.hero_cta_text;
  if (elements.collectionsTitle && siteData.collections_title) elements.collectionsTitle.textContent = siteData.collections_title;
  if (elements.collectionsSubtitle && siteData.collections_subtitle) elements.collectionsSubtitle.textContent = siteData.collections_subtitle;
  if (elements.visionTitle && siteData.vision_title) elements.visionTitle.textContent = siteData.vision_title;
  if (elements.aboutText && siteData.about_text) elements.aboutText.textContent = siteData.about_text;
  if (elements.contactTitle && siteData.contact_title) elements.contactTitle.textContent = siteData.contact_title;
  if (elements.contactSubtitle && siteData.contact_subtitle) elements.contactSubtitle.textContent = siteData.contact_subtitle;
  if (elements.newsletterTitle && siteData.newsletter_title) elements.newsletterTitle.textContent = siteData.newsletter_title;
  if (elements.newsletterSubtitle && siteData.newsletter_subtitle) {
    elements.newsletterSubtitle.textContent = siteData.newsletter_subtitle;
  }
  if (elements.socialsTitle && siteData.socials_title) elements.socialsTitle.textContent = siteData.socials_title;
  if (elements.dassiTitle && siteData.dassi_title) elements.dassiTitle.textContent = siteData.dassi_title;
  if (elements.contactEmail && siteData.contact_email) elements.contactEmail.textContent = siteData.contact_email;
  if (elements.contactMailLink && siteData.contact_email) elements.contactMailLink.href = `mailto:${siteData.contact_email}`;
  if (elements.contactMailLink && siteData.contact_button_text) {
    elements.contactMailLink.textContent = siteData.contact_button_text;
  }
  if (elements.trustPaymentTitle && siteData.trust_payment_title) {
    elements.trustPaymentTitle.textContent = siteData.trust_payment_title;
  }
  if (elements.trustPaymentText && siteData.trust_payment_text) {
    elements.trustPaymentText.textContent = siteData.trust_payment_text;
  }
  if (elements.trustShippingTitle && siteData.trust_shipping_title) {
    elements.trustShippingTitle.textContent = siteData.trust_shipping_title;
  }
  if (elements.trustShippingText && siteData.trust_shipping_text) {
    elements.trustShippingText.textContent = siteData.trust_shipping_text;
  }
  if (elements.trustSupportTitle && siteData.trust_support_title) {
    elements.trustSupportTitle.textContent = siteData.trust_support_title;
  }
  if (elements.trustSupportText && siteData.trust_support_text) {
    elements.trustSupportText.textContent = siteData.trust_support_text;
  }

  if (elements.heroMeta && Array.isArray(siteData.hero_meta)) {
    elements.heroMeta.innerHTML = "";
    siteData.hero_meta.forEach((entry) => {
      const span = document.createElement("span");
      span.textContent = String(entry);
      elements.heroMeta.appendChild(span);
    });
  }

  if (elements.socialList && Array.isArray(siteData.socials)) {
    elements.socialList.innerHTML = "";
    siteData.socials.forEach((social) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "social-link";
      a.href = social.url || "#";
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML = getSocialIcon(social.name || "");
      a.setAttribute("aria-label", social.name || "Réseau social");
      li.appendChild(a);
      elements.socialList.appendChild(li);
    });
  }

  updateSeoTags({
    title: `${siteData.hero_title || "Délé Dzina"} - Boutique Officielle`,
    description:
      siteData.hero_subtitle ||
      "Site officiel Délé Dzina: collections premium, paiement sécurisé par carte et livraison internationale.",
  });
}

async function loadProducts() {
  const payload = await fetchJsonWithFallback("/api/products", "data/collections.json", { items: [] });
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  state.products = rawItems.map((item, index) => normalizeProduct(item, index));

  // Clean old cart entries that no longer exist in the catalogue.
  const validProductIds = new Set(state.products.map((item) => item.id));
  const nextCart = state.cart.filter((entry) => validProductIds.has(entry.id));
  if (nextCart.length !== state.cart.length) {
    state.cart = nextCart;
    persistCart();
  }
}

function setupHomePage() {
  if (elements.productSearch) {
    const handleSearchUpdate = () => {
      renderHomeProducts();

      // On small screens, jump to the catalogue so the user sees results update instantly.
      if (!window.matchMedia("(max-width: 900px)").matches) return;
      const collectionsSection = document.getElementById("collections");
      if (!collectionsSection) return;
      if (String(elements.productSearch?.value || "").trim().length === 0) return;

      const top = collectionsSection.getBoundingClientRect().top;
      if (top > 180) {
        collectionsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };

    elements.productSearch.addEventListener("input", handleSearchUpdate);
    elements.productSearch.addEventListener("search", handleSearchUpdate);
    elements.productSearch.addEventListener("change", handleSearchUpdate);
  }

  if (elements.productSort) {
    elements.productSort.addEventListener("change", renderHomeProducts);
  }

  if (elements.collectionsGrid) {
    elements.collectionsGrid.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button[data-action='add-to-cart']");
      if (!button) return;

      const productId = button.getAttribute("data-id");
      if (!productId) return;
      addToCart(productId, 1);
      showToast("Produit ajouté au panier.");
    });
  }

  renderHomeProducts();
}

function setupLiveSync(page) {
  if (page !== "home" && page !== "product") return;

  let busy = false;
  const syncNow = async () => {
    if (busy) return;
    busy = true;

    const beforeSite = computeSiteDigest();
    const beforeProducts = computeProductsDigest();

    try {
      await Promise.all([loadSiteContent(), loadProducts()]);

      if (page === "home") {
        renderHomeProducts();
      } else if (page === "product") {
        refreshProductView();
      }

      const afterSite = computeSiteDigest();
      const afterProducts = computeProductsDigest();
      if (beforeSite !== afterSite || beforeProducts !== afterProducts) {
        showToast("Mise à jour du site chargée.");
      }
    } catch (_error) {
      // Silent: keep storefront usable even if sync fails.
    } finally {
      busy = false;
    }
  };

  window.addEventListener("focus", () => {
    void syncNow();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void syncNow();
    }
  });
}

function computeSiteDigest() {
  return JSON.stringify(state.site || {});
}

function computeProductsDigest() {
  return JSON.stringify(
    (state.products || []).map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      image: item.image,
      price: item.price,
      tag: item.tag,
      active: item.active,
    })),
  );
}

function renderHomeProducts() {
  if (!elements.collectionsGrid) return;

  const query = normalizeSearchText(elements.productSearch?.value || "");
  const sort = String(elements.productSort?.value || "featured");

  const filtered = state.products
    .filter((product) => product.active)
    .filter((product) => {
      if (!query) return true;
      const haystack = normalizeSearchText([product.title, product.description, product.tag, product.id].join(" "));
      return haystack.includes(query);
    });

  const sorted = filtered.slice();
  sorted.sort((a, b) => {
    if (sort === "price-asc") return a.price - b.price;
    if (sort === "price-desc") return b.price - a.price;
    if (sort === "name-asc") return a.title.localeCompare(b.title, "fr");
    return 0;
  });

  if (!sorted.length) {
    elements.collectionsGrid.innerHTML = `<article class="card empty-state"><div class="card-body"><h3>Aucun produit</h3><p>Ajuste ta recherche ou vérifie les produits dans l'admin.</p></div></article>`;
    return;
  }

  const html = sorted
    .map((product) => {
      return `
      <article class="card reveal visible">
        <a href="product.html?id=${encodeURIComponent(product.id)}" class="product-link" aria-label="Voir ${escapeHtml(
          product.title,
        )}">
          <div class="card-media">
            <img
              class="card-media-img"
              src="${escapeAttribute(product.image || "images/products/pull-premium.svg")}"
              alt="${escapeAttribute(product.title)}"
              loading="lazy"
              decoding="async"
            />
            ${product.tag ? `<div class="tag">${escapeHtml(product.tag)}</div>` : ""}
          </div>
        </a>
        <div class="card-body">
          <h3>${escapeHtml(product.title)}</h3>
          <p>${escapeHtml(product.description)}</p>
          <div class="card-row">
            <span class="price">${formatCurrency(product.price)}</span>
            <button class="ghost" data-action="add-to-cart" data-id="${escapeAttribute(product.id)}" type="button">Ajouter</button>
          </div>
        </div>
      </article>
    `;
    })
    .join("");

  elements.collectionsGrid.innerHTML = html;
}

function setupProductPage() {
  const productId = new URLSearchParams(window.location.search).get("id");
  const activeProducts = state.products.filter((product) => product.active);

  let selected = activeProducts.find((product) => product.id === productId);
  if (!selected) {
    selected = activeProducts[0] || null;
  }

  if (!selected) {
    showToast("Aucun produit disponible.");
    return;
  }

  renderProductDetails(selected);
  renderRelatedProducts(selected.id);

  if (elements.addToCartBtn) {
    elements.addToCartBtn.addEventListener("click", () => {
      const quantity = clampQuantity(Number(elements.productQty?.value || 1));
      addToCart(selected.id, quantity);
      showToast("Produit ajouté au panier.");
    });
  }

  if (elements.buyNowBtn) {
    elements.buyNowBtn.addEventListener("click", async () => {
      const quantity = clampQuantity(Number(elements.productQty?.value || 1));
      addToCart(selected.id, quantity);
      openCart();
      await startCheckout();
    });
  }

  if (elements.relatedGrid) {
    elements.relatedGrid.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button[data-action='add-to-cart']");
      if (!button) return;
      const id = button.getAttribute("data-id");
      if (!id) return;
      addToCart(id, 1);
      showToast("Produit ajouté au panier.");
    });
  }
}

function refreshProductView() {
  const productId = new URLSearchParams(window.location.search).get("id");
  const activeProducts = state.products.filter((product) => product.active);
  const selected =
    activeProducts.find((product) => product.id === productId) || activeProducts[0] || null;

  if (!selected) return;
  renderProductDetails(selected);
  renderRelatedProducts(selected.id);
}

function renderProductDetails(product) {
  if (elements.productTitle) elements.productTitle.textContent = product.title;
  if (elements.productPrice) elements.productPrice.textContent = formatCurrency(product.price);
  if (elements.productDescription) elements.productDescription.textContent = product.description;
  if (elements.productTag) elements.productTag.textContent = product.tag || "Produit officiel";
  if (elements.productImage) {
    elements.productImage.src = product.image || "images/products/pull-premium.svg";
    elements.productImage.alt = product.title;
  }
  updateSeoTags({
    title: `${product.title} - Délé Dzina`,
    description: product.description,
    image: product.image,
    type: "product",
    price: product.price,
  });
  updateProductStructuredData(product);
}

function renderRelatedProducts(currentId) {
  if (!elements.relatedGrid) return;
  const related = state.products.filter((product) => product.active && product.id !== currentId).slice(0, 4);

  if (!related.length) {
    elements.relatedGrid.innerHTML = "";
    return;
  }

  elements.relatedGrid.innerHTML = related
    .map((product) => {
      return `
      <article class="card reveal visible">
        <a href="product.html?id=${encodeURIComponent(product.id)}" class="product-link" aria-label="Voir ${escapeHtml(
          product.title,
        )}">
          <div class="card-media">
            <img
              class="card-media-img"
              src="${escapeAttribute(product.image || "images/products/pull-premium.svg")}"
              alt="${escapeAttribute(product.title)}"
              loading="lazy"
              decoding="async"
            />
            ${product.tag ? `<div class="tag">${escapeHtml(product.tag)}</div>` : ""}
          </div>
        </a>
        <div class="card-body">
          <h3>${escapeHtml(product.title)}</h3>
          <p>${escapeHtml(product.description)}</p>
          <div class="card-row">
            <span class="price">${formatCurrency(product.price)}</span>
            <button class="ghost" data-action="add-to-cart" data-id="${escapeAttribute(product.id)}" type="button">Ajouter</button>
          </div>
        </div>
      </article>
    `;
    })
    .join("");
}

function setupCartEvents() {
  if (elements.openCartBtn) {
    elements.openCartBtn.setAttribute("aria-controls", "cartDrawer");
    elements.openCartBtn.setAttribute("aria-expanded", "false");
    elements.openCartBtn.addEventListener("click", openCart);
  }
  if (elements.closeCartBtn) {
    elements.closeCartBtn.addEventListener("click", closeCart);
  }
  if (elements.cartBackdrop) {
    elements.cartBackdrop.addEventListener("click", closeCart);
  }

  if (elements.cartItems) {
    elements.cartItems.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest("button[data-action]");
      if (!button) return;

      const action = button.getAttribute("data-action");
      const productId = button.getAttribute("data-id");
      if (!productId || !action) return;

      const item = state.cart.find((entry) => entry.id === productId);
      const currentQty = item ? item.quantity : 0;

      if (action === "increase") setCartQuantity(productId, currentQty + 1);
      if (action === "decrease") setCartQuantity(productId, currentQty - 1);
      if (action === "remove") removeFromCart(productId);
    });
  }

  if (elements.checkoutBtn) {
    elements.checkoutBtn.addEventListener("click", startCheckout);
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCart();
      if (elements.searchPopover && elements.searchToggleBtn) {
        elements.searchPopover.setAttribute("hidden", "");
        elements.searchToggleBtn.setAttribute("aria-expanded", "false");
      }
    }
  });
}

function setupNewsletter() {
  if (!elements.newsletterForm) return;

  elements.newsletterForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = String(elements.newsletterEmail?.value || "").trim();
    if (!email) return;

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error("Newsletter API unavailable");
      }

      if (elements.newsletterMessage) {
        elements.newsletterMessage.textContent = "Inscription confirmée.";
      }
      elements.newsletterForm.reset();
      trackEvent("newsletter_signup", {
        location: window.location.pathname,
      });
    } catch (_error) {
      if (elements.newsletterMessage) {
        elements.newsletterMessage.textContent = "Inscription locale enregistrée. Lance le serveur pour sauvegarder côté backend.";
      }
    }
  });
}

function openCart() {
  if (!elements.cartDrawer || !elements.cartBackdrop) return;
  state.cartReturnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  elements.cartDrawer.classList.add("open");
  elements.cartBackdrop.classList.add("open");
  elements.cartDrawer.setAttribute("aria-hidden", "false");
  elements.openCartBtn?.setAttribute("aria-expanded", "true");
  elements.body?.classList.add("cart-open");
  renderCart();
  elements.closeCartBtn?.focus();
}

function closeCart() {
  if (!elements.cartDrawer || !elements.cartBackdrop) return;
  elements.cartDrawer.classList.remove("open");
  elements.cartBackdrop.classList.remove("open");
  elements.cartDrawer.setAttribute("aria-hidden", "true");
  elements.openCartBtn?.setAttribute("aria-expanded", "false");
  elements.body?.classList.remove("cart-open");
  if (state.cartReturnFocusEl) {
    state.cartReturnFocusEl.focus();
    state.cartReturnFocusEl = null;
  }
}

function addToCart(productId, quantity) {
  const product = state.products.find((item) => item.id === productId);
  if (!product || !product.active) return;

  const qty = clampQuantity(quantity);
  const existing = state.cart.find((entry) => entry.id === productId);

  if (existing) {
    existing.quantity = clampQuantity(existing.quantity + qty);
  } else {
    state.cart.push({ id: productId, quantity: qty });
  }

  persistCart();
  renderCart();
  updateCartCount();
  trackEvent("add_to_cart", {
    productId: product.id,
    productTitle: product.title,
    value: product.price,
    quantity: qty,
  });
}

function setCartQuantity(productId, quantity) {
  const nextQuantity = clampQuantity(quantity);
  const entry = state.cart.find((item) => item.id === productId);
  if (!entry) return;

  if (quantity <= 0) {
    removeFromCart(productId);
    return;
  }

  entry.quantity = nextQuantity;
  persistCart();
  renderCart();
  updateCartCount();
}

function removeFromCart(productId) {
  const removed = state.products.find((item) => item.id === productId);
  state.cart = state.cart.filter((item) => item.id !== productId);
  persistCart();
  renderCart();
  updateCartCount();
  if (removed) {
    trackEvent("remove_from_cart", {
      productId: removed.id,
      productTitle: removed.title,
      value: removed.price,
    });
  }
}

function renderCart() {
  if (!elements.cartItems || !elements.cartTotal) return;

  const enrichedItems = state.cart
    .map((entry) => {
      const product = state.products.find((item) => item.id === entry.id);
      if (!product) return null;
      return {
        ...entry,
        title: product.title,
        price: product.price,
      };
    })
    .filter(Boolean);

  if (!enrichedItems.length) {
    elements.cartItems.innerHTML = `<p class="empty-cart">Ton panier est vide.</p>`;
    elements.cartTotal.textContent = formatCurrency(0);
    return;
  }

  elements.cartItems.innerHTML = enrichedItems
    .map((item) => {
      const rowTotal = item.price * item.quantity;
      return `
      <article class="cart-item">
        <div>
          <h4>${escapeHtml(item.title)}</h4>
          <p>${formatCurrency(item.price)} x ${item.quantity} = ${formatCurrency(rowTotal)}</p>
        </div>
        <div class="cart-actions">
          <button class="icon-btn" data-action="decrease" data-id="${escapeAttribute(item.id)}" type="button">-</button>
          <button class="icon-btn" data-action="increase" data-id="${escapeAttribute(item.id)}" type="button">+</button>
          <button class="icon-btn danger" data-action="remove" data-id="${escapeAttribute(item.id)}" type="button">Suppr</button>
        </div>
      </article>
      `;
    })
    .join("");

  const total = enrichedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  elements.cartTotal.textContent = formatCurrency(total);
}

function updateCartCount() {
  if (!elements.cartCount) return;
  const totalQty = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  elements.cartCount.textContent = String(totalQty);
}

async function startCheckout() {
  if (state.isCheckoutLoading) return;

  if (!state.cart.length) {
    showToast("Panier vide.");
    return;
  }

  if (!elements.checkoutBtn) return;

  state.isCheckoutLoading = true;
  elements.checkoutBtn.disabled = true;
  const originalText = elements.checkoutBtn.textContent;
  elements.checkoutBtn.textContent = "Redirection...";

  try {
    const checkoutValue = state.cart.reduce((sum, item) => {
      const product = state.products.find((entry) => entry.id === item.id);
      return sum + (product ? product.price * item.quantity : 0);
    }, 0);

    trackEvent("begin_checkout", {
      value: Number(checkoutValue.toFixed(2)),
      currency: "EUR",
      itemCount: state.cart.reduce((sum, item) => sum + item.quantity, 0),
    });

    const payload = {
      customerEmail: String(elements.checkoutEmail?.value || "").trim(),
      items: state.cart.map((entry) => ({ id: entry.id, quantity: entry.quantity })),
    };

    const response = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.url) {
      throw new Error(data.error || "Checkout indisponible. Lance le serveur backend et configure Stripe.");
    }

    window.location.href = data.url;
  } catch (error) {
    showToast(error.message || "Impossible de démarrer le paiement.");
    trackEvent("checkout_error", {
      message: String(error.message || "checkout error").slice(0, 140),
    });
  } finally {
    state.isCheckoutLoading = false;
    elements.checkoutBtn.disabled = false;
    elements.checkoutBtn.textContent = originalText;
  }
}

function readCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        id: String(item.id || ""),
        quantity: clampQuantity(Number(item.quantity || 0)),
      }))
      .filter((item) => item.id && item.quantity > 0);
  } catch (_error) {
    return [];
  }
}

function persistCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
}

function normalizeProduct(item, index) {
  const title = String(item?.title || `Produit ${index + 1}`).trim();
  const idSource = String(item?.id || item?.slug || title || `product-${index + 1}`);

  return {
    id: slugify(idSource) || `product-${index + 1}`,
    title,
    description: String(item?.description || "Description à venir").trim(),
    image: String(item?.image || "").trim(),
    price: parsePrice(item?.price),
    tag: String(item?.tag || "").trim(),
    active: item?.active !== false,
  };
}

function parsePrice(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(2));
  }

  const asString = String(value || "")
    .replace(/[^0-9,.-]/g, "")
    .replace(",", ".")
    .trim();
  const parsed = Number.parseFloat(asString);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Number(parsed.toFixed(2));
}

function clampQuantity(value) {
  const number = Number.isFinite(value) ? Math.round(value) : 1;
  if (number < 1) return 1;
  if (number > 20) return 20;
  return number;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));
}

async function fetchJsonWithFallback(primaryUrl, fallbackUrl, fallbackValue) {
  try {
    const primaryRes = await fetch(primaryUrl, { cache: "no-store" });
    if (primaryRes.ok) {
      return await primaryRes.json();
    }
  } catch (_error) {
    // Fallback below.
  }

  try {
    const fallbackRes = await fetch(fallbackUrl, { cache: "no-store" });
    if (fallbackRes.ok) {
      return await fallbackRes.json();
    }
  } catch (_error) {
    // Final fallback below.
  }

  return fallbackValue;
}

function initAnalytics(siteData) {
  const measurementId = String(siteData?.ga_measurement_id || "").trim();
  if (!measurementId || state.analyticsReady || state.analyticsMeasurementId) return;

  state.analyticsMeasurementId = measurementId;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { anonymize_ip: true });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  script.onload = () => {
    state.analyticsReady = true;
  };
  script.onerror = () => {
    state.analyticsReady = false;
  };
  document.head.appendChild(script);
}

function trackEvent(eventName, props = {}) {
  const payload = {
    eventName: String(eventName || "").trim().toLowerCase(),
    props,
  };

  if (typeof window.gtag === "function" && state.analyticsMeasurementId) {
    window.gtag("event", payload.eventName, props || {});
  }

  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Silent fail for tracking.
  });
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function updateSeoTags({ title, description, image, type = "website", price } = {}) {
  const safeTitle = String(title || document.title || "Délé Dzina");
  const safeDescription = String(description || "").trim();
  const pageUrl = window.location.href;
  const imageUrl = toAbsoluteUrl(image || "/logo-dd.png");

  document.title = safeTitle;
  setMetaTag("name", "description", safeDescription);
  setMetaTag("property", "og:title", safeTitle);
  setMetaTag("property", "og:description", safeDescription);
  setMetaTag("property", "og:url", pageUrl);
  setMetaTag("property", "og:type", type);
  setMetaTag("property", "og:image", imageUrl);
  setMetaTag("name", "twitter:title", safeTitle);
  setMetaTag("name", "twitter:description", safeDescription);
  setMetaTag("name", "twitter:image", imageUrl);
  setMetaTag("name", "twitter:card", "summary_large_image");

  if (Number.isFinite(Number(price))) {
    setMetaTag("property", "product:price:amount", String(Number(price)));
    setMetaTag("property", "product:price:currency", "EUR");
  }

  let canonical = document.querySelector("link[rel='canonical']");
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", pageUrl.split("#")[0]);
}

function updateProductStructuredData(product) {
  if (!product) return;

  const payload = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    image: [toAbsoluteUrl(product.image || "/images/products/pull-premium.svg")],
    brand: {
      "@type": "Brand",
      name: "Délé Dzina",
    },
    offers: {
      "@type": "Offer",
      priceCurrency: "EUR",
      price: Number(product.price || 0).toFixed(2),
      availability: "https://schema.org/InStock",
      url: window.location.href,
    },
  };

  let tag = document.getElementById("productStructuredData");
  if (!tag) {
    tag = document.createElement("script");
    tag.id = "productStructuredData";
    tag.type = "application/ld+json";
    document.head.appendChild(tag);
  }
  tag.textContent = JSON.stringify(payload);
}

function setMetaTag(attribute, key, content) {
  if (!content) return;
  let tag = document.querySelector(`meta[${attribute}='${key}']`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function toAbsoluteUrl(input) {
  const preferredOrigin = String(state.site?.site_url || "").trim().replace(/\/+$/, "");
  const origin = preferredOrigin || window.location.origin;
  const value = String(input || "").trim();
  if (!value) return origin;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${origin}${value}`;
  return `${origin}/${value.replace(/^\/+/, "")}`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function showToast(message) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2800);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function getSocialIcon(name = "") {
  const key = name.toLowerCase();

  if (key.includes("instagram")) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm10 2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-5 3.5A4.5 4.5 0 1 1 7.5 13 4.5 4.5 0 0 1 12 8.5zm0 2A2.5 2.5 0 1 0 14.5 13 2.5 2.5 0 0 0 12 10.5zM18 6.5a1 1 0 1 1-1 1 1 1 0 0 1 1-1z"/></svg>`;
  }
  if (key.includes("tiktok")) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3c.3 2.2 2 3.9 4.2 4.2V9c-1.5-.1-2.8-.7-3.8-1.6V15a5 5 0 1 1-5-5c.3 0 .7 0 1 .1v2a3 3 0 1 0 2 2.8V3h1.6z"/></svg>`;
  }
  if (key.includes("youtube")) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 12s0-3.3-.4-4.8c-.2-.9-1-1.6-1.9-1.8C18.6 5 12 5 12 5s-6.6 0-8.7.4c-.9.2-1.7.9-1.9 1.8C1 8.7 1 12 1 12s0 3.3.4 4.8c.2.9 1 1.6 1.9 1.8 2.1.4 8.7.4 8.7.4s6.6 0 8.7-.4c.9-.2 1.7-.9 1.9-1.8.4-1.5.4-4.8.4-4.8zM10 15V9l5 3-5 3z"/></svg>`;
  }
  if (key.includes("snap")) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c2.7 0 4.5 2 4.5 4.8 0 .5 0 1 .1 1.3.2.6 1 .9 1.6 1.1 1 .4 1.3 1 .9 1.6-.4.6-1.3 1-2.1 1.2-.5.2-.6.4-.3 1 .3.7 1 1.5 1.8 2 .8.5.9 1.2.3 1.6-.6.4-1.6.5-2.6.2-.6-.2-1.1-.1-1.5.3-.5.5-1.4 1.2-2.7 1.2s-2.2-.7-2.7-1.2c-.4-.4-.9-.5-1.5-.3-1 .3-2 .2-2.6-.2-.6-.4-.5-1.1.3-1.6.8-.5 1.5-1.3 1.8-2 .3-.6.2-.8-.3-1-.8-.2-1.7-.6-2.1-1.2-.4-.6-.1-1.2.9-1.6.6-.2 1.4-.5 1.6-1.1.1-.3.1-.8.1-1.3C7.5 5 9.3 3 12 3z"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>`;
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

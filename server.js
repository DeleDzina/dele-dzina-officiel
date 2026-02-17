require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const compression = require("compression");
const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const Stripe = require("stripe");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const PRODUCT_IMAGES_DIR = path.join(ROOT_DIR, "images", "products");
const COLLECTIONS_FILE = path.join(DATA_DIR, "collections.json");
const SITE_FILE = path.join(DATA_DIR, "site.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const NEWSLETTER_FILE = path.join(DATA_DIR, "newsletter.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const ADMIN_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || "change-this-admin-token";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const ORDER_FROM_EMAIL = String(process.env.ORDER_FROM_EMAIL || "").trim();
const SUPPORT_EMAIL = String(process.env.SUPPORT_EMAIL || "deledzina@gmail.com").trim();

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const VALID_ORDER_STATUSES = new Set([
  "checkout_pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]);

const TRACKABLE_EVENTS = new Set([
  "page_view",
  "add_to_cart",
  "remove_from_cart",
  "begin_checkout",
  "checkout_error",
  "purchase",
  "newsletter_signup",
]);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requêtes API. Réessaie dans quelques minutes." },
});

const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives de checkout. Réessaie plus tard." },
});

const newsletterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop d'inscriptions. Réessaie plus tard." },
});

const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop d'événements envoyés." },
});

const adminLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requêtes admin. Réessaie plus tard." },
});

const sharedScriptSrc = [
  "'self'",
  "'unsafe-inline'",
  "https://www.googletagmanager.com",
  "https://www.google-analytics.com",
];

const sharedCspDirectives = {
  defaultSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  imgSrc: ["'self'", "data:", "https:"],
  fontSrc: ["'self'", "https://fonts.gstatic.com"],
  connectSrc: [
    "'self'",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
  ],
  frameSrc: ["https://js.stripe.com", "https://hooks.stripe.com"],
  formAction: ["'self'", "https://checkout.stripe.com"],
};

if (IS_PRODUCTION) {
  const defaultHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        ...sharedCspDirectives,
        scriptSrc: sharedScriptSrc,
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });
  app.use(defaultHelmet);
} else {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
    }),
  );
}

app.use(compression());

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(400).send("Stripe webhook is not configured.");
  }

  const signature = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return res.status(400).send(`Webhook signature error: ${error.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session?.metadata?.orderId;

    if (orderId) {
      const ordersDoc = await readJson(ORDERS_FILE, { orders: [] });
      let paidOrder = null;
      let previousStatus = "";
      const nextOrders = (ordersDoc.orders || []).map((order) => {
        if (order.id !== orderId) return order;
        previousStatus = String(order.status || "");
        paidOrder = {
          ...order,
          status: "paid",
          stripePaymentIntentId: session.payment_intent || "",
          stripeSessionId: session.id || order.stripeSessionId,
          paidAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return paidOrder;
      });
      await writeJson(ORDERS_FILE, { orders: nextOrders });

      await appendTrackingEvent({
        eventName: "purchase",
        props: {
          orderId,
          value: session.amount_total ? Number(session.amount_total) / 100 : 0,
          currency: session.currency || "eur",
          source: "stripe_webhook",
        },
      });

      if (paidOrder && previousStatus !== "paid" && isValidEmail(paidOrder.customerEmail)) {
        await sendOrderStatusEmail({
          order: paidOrder,
          status: "paid",
          baseUrl: resolveBaseUrl(req),
        });
      }
    }
  }

  return res.json({ received: true });
});

app.use("/api", apiLimiter);
app.use(express.json({ limit: "12mb" }));

app.get("/api/health", async (_req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || "development",
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    adminConfigured: Boolean(process.env.ADMIN_API_TOKEN),
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/site", async (_req, res) => {
  const site = await readJson(SITE_FILE, {});
  res.json(site);
});

app.get("/api/products", async (req, res) => {
  const products = await readProducts();
  const includeInactive = req.query.includeInactive === "1";
  const items = includeInactive ? products : products.filter((item) => item.active);
  res.json({ items });
});

app.get("/api/order/:orderId/summary", async (req, res) => {
  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) {
    return res.status(400).json({ error: "order_id manquant." });
  }

  const ordersDoc = await readJson(ORDERS_FILE, { orders: [] });
  const order = (Array.isArray(ordersDoc.orders) ? ordersDoc.orders : []).find((entry) => entry.id === orderId);

  if (!order) {
    return res.status(404).json({ error: "Commande introuvable." });
  }

  return res.json({
    id: order.id,
    status: order.status,
    subtotal: order.subtotal,
    currency: order.currency || "EUR",
    createdAt: order.createdAt,
    paidAt: order.paidAt || null,
    itemCount: Array.isArray(order.items)
      ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
      : 0,
  });
});

app.post("/api/newsletter", newsletterLimiter, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Adresse email invalide." });
  }

  const newsletter = await readJson(NEWSLETTER_FILE, { subscribers: [] });
  const subscribers = Array.isArray(newsletter.subscribers) ? newsletter.subscribers : [];

  if (!subscribers.find((entry) => entry.email === email)) {
    subscribers.push({ email, createdAt: new Date().toISOString() });
    await writeJson(NEWSLETTER_FILE, { subscribers });
  }

  await appendTrackingEvent({
    eventName: "newsletter_signup",
    props: { emailDomain: email.split("@")[1] || "unknown" },
    req,
  });

  return res.json({ ok: true });
});

app.post("/api/track", trackLimiter, async (req, res) => {
  const eventName = String(req.body?.eventName || "").trim().toLowerCase();
  const props = sanitizeTrackProps(req.body?.props);

  if (!TRACKABLE_EVENTS.has(eventName)) {
    return res.status(400).json({ error: "Événement non autorisé." });
  }

  await appendTrackingEvent({ eventName, props, req });
  return res.json({ ok: true });
});

app.post("/api/create-checkout-session", checkoutLimiter, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({
      error:
        "Paiement indisponible: STRIPE_SECRET_KEY non configurée. Ajoute ta clé Stripe dans .env.",
    });
  }

  const bodyItems = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!bodyItems.length) {
    return res.status(400).json({ error: "Panier vide." });
  }

  const customerEmail = String(req.body?.customerEmail || "").trim().toLowerCase();
  if (customerEmail && !isValidEmail(customerEmail)) {
    return res.status(400).json({ error: "Email client invalide." });
  }

  const products = await readProducts();
  const productMap = new Map(products.map((item) => [item.id, item]));

  const orderItems = [];
  const lineItems = [];

  for (const cartItem of bodyItems) {
    const productId = String(cartItem?.id || "");
    const quantity = Number(cartItem?.quantity || 0);

    if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return res.status(400).json({ error: "Produit ou quantité invalide." });
    }

    const product = productMap.get(productId);
    if (!product || !product.active) {
      return res.status(404).json({ error: `Produit introuvable: ${productId}` });
    }

    if (!product.price || product.price <= 0) {
      return res.status(400).json({
        error: `Le produit \"${product.title}\" n'a pas de prix valide.`,
      });
    }

    orderItems.push({
      id: product.id,
      title: product.title,
      quantity,
      unitPrice: product.price,
      image: product.image,
    });

    lineItems.push({
      quantity,
      price_data: {
        currency: "eur",
        product_data: {
          name: product.title,
          description: product.description || undefined,
          images: isAbsoluteHttpUrl(product.image) ? [product.image] : undefined,
        },
        unit_amount: Math.round(product.price * 100),
      },
    });
  }

  const subtotal = orderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const orderId = crypto.randomUUID();

  const pendingOrder = {
    id: orderId,
    status: "checkout_pending",
    currency: "EUR",
    subtotal,
    items: orderItems,
    customerEmail: customerEmail || null,
    stripeSessionId: null,
    stripePaymentIntentId: null,
    note: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const ordersDoc = await readJson(ORDERS_FILE, { orders: [] });
  const orders = Array.isArray(ordersDoc.orders) ? ordersDoc.orders : [];
  orders.unshift(pendingOrder);
  await writeJson(ORDERS_FILE, { orders });

  const baseUrl = resolveBaseUrl(req);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${baseUrl}/checkout-success.html?order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout-cancel.html?order_id=${orderId}`,
      customer_email: customerEmail || undefined,
      billing_address_collection: "required",
      shipping_address_collection: {
        allowed_countries: ["FR", "US", "CA", "GB", "DE", "BE", "IT", "ES", "PT", "NL"],
      },
      phone_number_collection: { enabled: true },
      metadata: {
        orderId,
      },
      allow_promotion_codes: true,
    });

    const updatedOrders = orders.map((order) => {
      if (order.id !== orderId) return order;
      return {
        ...order,
        stripeSessionId: session.id,
        updatedAt: new Date().toISOString(),
      };
    });
    await writeJson(ORDERS_FILE, { orders: updatedOrders });

    await appendTrackingEvent({
      eventName: "begin_checkout",
      props: {
        orderId,
        value: subtotal,
        currency: "EUR",
        itemCount: orderItems.reduce((sum, item) => sum + item.quantity, 0),
      },
      req,
    });

    return res.json({ url: session.url, orderId });
  } catch (error) {
    const failedOrders = orders.map((order) => {
      if (order.id !== orderId) return order;
      return {
        ...order,
        status: "cancelled",
        note: `Stripe error: ${error.message}`,
        updatedAt: new Date().toISOString(),
      };
    });
    await writeJson(ORDERS_FILE, { orders: failedOrders });

    await appendTrackingEvent({
      eventName: "checkout_error",
      props: {
        orderId,
        message: sanitizeText(error.message, 180),
      },
      req,
    });

    return res.status(500).json({ error: `Stripe checkout error: ${error.message}` });
  }
});

app.get("/api/admin/overview", adminLimiter, requireAdmin, async (_req, res) => {
  const [products, ordersDoc, site] = await Promise.all([
    readProducts(),
    readJson(ORDERS_FILE, { orders: [] }),
    readJson(SITE_FILE, {}),
  ]);

  res.json({
    products,
    orders: Array.isArray(ordersDoc.orders) ? ordersDoc.orders : [],
    site,
  });
});

app.get("/api/admin/orders", adminLimiter, requireAdmin, async (_req, res) => {
  const ordersDoc = await readJson(ORDERS_FILE, { orders: [] });
  res.json({ orders: Array.isArray(ordersDoc.orders) ? ordersDoc.orders : [] });
});

app.patch("/api/admin/orders/:orderId", adminLimiter, requireAdmin, async (req, res) => {
  const orderId = String(req.params.orderId || "");
  const status = String(req.body?.status || "").trim();
  const note = String(req.body?.note || "").trim();

  if (status && !VALID_ORDER_STATUSES.has(status)) {
    return res.status(400).json({ error: "Statut de commande invalide." });
  }

  const ordersDoc = await readJson(ORDERS_FILE, { orders: [] });
  const orders = Array.isArray(ordersDoc.orders) ? ordersDoc.orders : [];

  let found = false;
  let previousStatus = "";
  let updatedOrder = null;
  const nextOrders = orders.map((order) => {
    if (order.id !== orderId) return order;
    found = true;
    previousStatus = String(order.status || "");
    updatedOrder = {
      ...order,
      status: status || order.status,
      note: sanitizeText(note, 280),
      updatedAt: new Date().toISOString(),
    };
    return updatedOrder;
  });

  if (!found) {
    return res.status(404).json({ error: "Commande introuvable." });
  }

  await writeJson(ORDERS_FILE, { orders: nextOrders });

  if (
    updatedOrder &&
    updatedOrder.status !== previousStatus &&
    shouldNotifyOrderStatus(updatedOrder.status) &&
    isValidEmail(updatedOrder.customerEmail)
  ) {
    await sendOrderStatusEmail({
      order: updatedOrder,
      status: updatedOrder.status,
      baseUrl: resolveBaseUrl(req),
    });
  }

  return res.json({ ok: true });
});

app.put("/api/admin/products", adminLimiter, requireAdmin, async (req, res) => {
  const rawItems = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!rawItems) {
    return res.status(400).json({ error: "Payload invalide: items[] requis." });
  }

  const normalized = rawItems.map((item, index) => normalizeProduct(item, index));
  await writeJson(COLLECTIONS_FILE, { items: normalized });

  return res.json({ ok: true, items: normalized });
});

app.put("/api/admin/site", adminLimiter, requireAdmin, async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Payload invalide: objet requis." });
  }

  const currentSite = await readJson(SITE_FILE, {});
  const site = sanitizeSitePayload(req.body, currentSite);
  await writeJson(SITE_FILE, site);

  return res.json({ ok: true, site });
});

app.post("/api/admin/upload-image", adminLimiter, requireAdmin, async (req, res) => {
  const dataUrl = String(req.body?.dataUrl || "");
  const productId = sanitizeText(req.body?.productId, 80);
  const sourceName = sanitizeText(req.body?.filename, 120);
  const parsed = decodePngDataUrl(dataUrl);

  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }

  const safeBaseName = slugify(productId || sourceName || "produit") || "produit";
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const nonce = crypto.randomBytes(2).toString("hex");
  const fileName = `${safeBaseName}-${stamp}-${nonce}.png`;
  const relativePath = `images/products/${fileName}`;
  const outputPath = path.join(PRODUCT_IMAGES_DIR, fileName);

  await fs.mkdir(PRODUCT_IMAGES_DIR, { recursive: true });
  await fs.writeFile(outputPath, parsed.buffer);

  return res.json({ ok: true, image: relativePath });
});

app.use(
  express.static(ROOT_DIR, {
    extensions: ["html"],
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (!IS_PRODUCTION) {
        res.setHeader("Cache-Control", "no-cache");
        return;
      }

      // Admin assets should never be cached aggressively to avoid stale panel JS/CSS after deploys.
      if (filePath.includes(`${path.sep}admin${path.sep}`)) {
        res.setHeader("Cache-Control", "no-cache");
        return;
      }

      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
        return;
      }

      if (/\.(css|js|mjs|png|jpg|jpeg|webp|svg|woff2|woff|otf|ttf|ico)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=86400");
      }
    },
  }),
);

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Route API introuvable." });
  }

  return res.sendFile(path.join(ROOT_DIR, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error("Unexpected server error:", error);
  if (res.headersSent) return;
  res.status(500).json({ error: "Erreur serveur inattendue." });
});

bootstrapDataFiles()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Délé Dzina server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Startup error:", error);
    process.exit(1);
  });

function requireAdmin(req, res, next) {
  const provided = String(req.headers["x-admin-token"] || "");
  if (!timingSafeEqual(provided, ADMIN_API_TOKEN)) {
    return res.status(401).json({ error: "Accès admin refusé." });
  }
  return next();
}

async function readProducts() {
  const collections = await readJson(COLLECTIONS_FILE, { items: [] });
  const items = Array.isArray(collections.items) ? collections.items : [];
  return items.map((item, index) => normalizeProduct(item, index));
}

function normalizeProduct(item, index) {
  const sourceTitle = String(item?.title || `Produit ${index + 1}`).trim();
  const sourceId = String(item?.id || item?.slug || sourceTitle || `product-${index + 1}`);
  const id = slugify(sourceId) || `product-${index + 1}`;
  const price = parsePrice(item?.price);

  return {
    id,
    title: sourceTitle,
    description: String(item?.description || "").trim(),
    image: String(item?.image || "").trim(),
    price,
    tag: String(item?.tag || "").trim(),
    link: `product.html?id=${encodeURIComponent(id)}`,
    active: item?.active !== false,
  };
}

function parsePrice(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Number(value.toFixed(2)));
  }

  if (typeof value !== "string") return 0;

  const cleaned = value.replace(/[^0-9,.-]/g, "").replace(",", ".").trim();
  const parsed = Number.parseFloat(cleaned);

  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Number(parsed.toFixed(2));
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeMultilineText(value, maxLen = 1000) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLen);
}

function sanitizeSitePayload(input, currentSite = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const current = currentSite && typeof currentSite === "object" ? currentSite : {};

  const rawHeroMeta = Array.isArray(source.hero_meta) ? source.hero_meta : current.hero_meta;
  const heroMeta = (Array.isArray(rawHeroMeta) ? rawHeroMeta : [])
    .map((entry) => sanitizeText(entry, 80))
    .filter(Boolean)
    .slice(0, 6);

  const rawSocials = Array.isArray(source.socials) ? source.socials : current.socials;
  const socials = (Array.isArray(rawSocials) ? rawSocials : [])
    .map((entry) => {
      const name = sanitizeText(entry?.name, 30);
      const handle = sanitizeText(entry?.handle, 60);
      const urlRaw = sanitizeText(entry?.url, 240);
      const url = isAbsoluteHttpUrl(urlRaw) ? urlRaw : "";
      if (!name) return null;
      return { name, handle, url };
    })
    .filter(Boolean)
    .slice(0, 12);

  const siteUrlRaw = sanitizeText(source.site_url ?? current.site_url, 200);
  const gaMeasurementId = sanitizeText(source.ga_measurement_id ?? current.ga_measurement_id, 30).toUpperCase();

  return {
    ...current,
    hero_title: sanitizeText(source.hero_title ?? current.hero_title, 80),
    hero_subtitle: sanitizeMultilineText(source.hero_subtitle ?? current.hero_subtitle, 320),
    hero_cta_text: sanitizeText(source.hero_cta_text ?? current.hero_cta_text, 60),
    hero_meta: heroMeta,
    collections_title: sanitizeText(source.collections_title ?? current.collections_title, 60),
    collections_subtitle: sanitizeMultilineText(source.collections_subtitle ?? current.collections_subtitle, 260),
    vision_title: sanitizeText(source.vision_title ?? current.vision_title, 60),
    about_text: sanitizeMultilineText(source.about_text ?? current.about_text, 1800),
    contact_title: sanitizeText(source.contact_title ?? current.contact_title, 60),
    contact_subtitle: sanitizeMultilineText(source.contact_subtitle ?? current.contact_subtitle, 220),
    newsletter_title: sanitizeText(source.newsletter_title ?? current.newsletter_title, 60),
    newsletter_subtitle: sanitizeMultilineText(source.newsletter_subtitle ?? current.newsletter_subtitle, 220),
    socials_title: sanitizeText(source.socials_title ?? current.socials_title, 60),
    dassi_title: sanitizeText(source.dassi_title ?? current.dassi_title, 60),
    contact_email: sanitizeText(source.contact_email ?? current.contact_email, 120).toLowerCase(),
    contact_button_text: sanitizeText(source.contact_button_text ?? current.contact_button_text, 60),
    contact_cities: sanitizeMultilineText(source.contact_cities ?? current.contact_cities, 180),
    trust_payment_title: sanitizeText(source.trust_payment_title ?? current.trust_payment_title, 60),
    trust_payment_text: sanitizeMultilineText(source.trust_payment_text ?? current.trust_payment_text, 200),
    trust_shipping_title: sanitizeText(source.trust_shipping_title ?? current.trust_shipping_title, 60),
    trust_shipping_text: sanitizeMultilineText(source.trust_shipping_text ?? current.trust_shipping_text, 200),
    trust_support_title: sanitizeText(source.trust_support_title ?? current.trust_support_title, 60),
    trust_support_text: sanitizeMultilineText(source.trust_support_text ?? current.trust_support_text, 200),
    site_url: isAbsoluteHttpUrl(siteUrlRaw) ? siteUrlRaw : "",
    ga_measurement_id: gaMeasurementId,
    socials,
  };
}

function resolveBaseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${protocol}://${host}`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isAbsoluteHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));

  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function sanitizeText(value, maxLen = 120) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLen);
}

function shouldNotifyOrderStatus(status) {
  return new Set(["paid", "processing", "shipped", "delivered", "cancelled"]).has(String(status || ""));
}

function formatOrderStatusLabel(status) {
  const value = String(status || "");
  if (value === "paid") return "Paiement confirmé";
  if (value === "processing") return "Commande en préparation";
  if (value === "shipped") return "Commande expédiée";
  if (value === "delivered") return "Commande livrée";
  if (value === "cancelled") return "Commande annulée";
  return "Mise à jour commande";
}

function formatOrderTotal(order) {
  const amount = Number(order?.subtotal || 0);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function escapeHtmlMinimal(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildOrderItemsHtml(order) {
  const items = Array.isArray(order?.items) ? order.items.slice(0, 6) : [];
  if (!items.length) return "";
  const list = items
    .map((item) => {
      const title = escapeHtmlMinimal(item?.title || "Produit");
      const qty = Number(item?.quantity || 0);
      return `<li style="margin-bottom:6px;">${title} x ${qty}</li>`;
    })
    .join("");
  return `<ul style="margin:0;padding-left:20px;color:#d0c9b8;">${list}</ul>`;
}

async function sendOrderStatusEmail({ order, status, baseUrl }) {
  if (!order || !isValidEmail(order.customerEmail)) return;
  if (!RESEND_API_KEY || !ORDER_FROM_EMAIL) return;

  const label = formatOrderStatusLabel(status);
  const orderId = sanitizeText(order.id, 80);
  const supportEmail = isValidEmail(SUPPORT_EMAIL) ? SUPPORT_EMAIL : "deledzina@gmail.com";
  const total = formatOrderTotal(order);
  const orderLink = `${String(baseUrl || "").replace(/\/+$/, "")}/checkout-success.html?order_id=${encodeURIComponent(orderId)}`;

  const subject = `Délé Dzina - ${label} (${orderId})`;
  const html = `
    <div style="font-family:Arial,sans-serif;background:#0b0b0b;color:#f2eee2;padding:24px;">
      <div style="max-width:560px;margin:0 auto;border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:20px;background:#121212;">
        <h2 style="margin:0 0 12px 0;">${escapeHtmlMinimal(label)}</h2>
        <p style="margin:0 0 12px 0;color:#d0c9b8;">Référence: <strong>${escapeHtmlMinimal(orderId)}</strong></p>
        <p style="margin:0 0 12px 0;color:#d0c9b8;">Montant: <strong>${escapeHtmlMinimal(total)}</strong></p>
        ${buildOrderItemsHtml(order)}
        <p style="margin:16px 0 12px 0;color:#d0c9b8;">Tu peux revoir ta commande ici:</p>
        <p style="margin:0 0 14px 0;">
          <a href="${escapeHtmlMinimal(orderLink)}" style="color:#d6b15d;text-decoration:none;">${escapeHtmlMinimal(orderLink)}</a>
        </p>
        <p style="margin:0;color:#d0c9b8;">Support: <a href="mailto:${escapeHtmlMinimal(
          supportEmail,
        )}" style="color:#d6b15d;text-decoration:none;">${escapeHtmlMinimal(supportEmail)}</a></p>
      </div>
    </div>
  `;

  const text = `${label}\nRéférence: ${orderId}\nMontant: ${total}\nSuivi: ${orderLink}\nSupport: ${supportEmail}`;
  await sendEmailViaResend({
    to: order.customerEmail,
    subject,
    html,
    text,
  });
}

async function sendEmailViaResend({ to, subject, html, text }) {
  if (!RESEND_API_KEY || !ORDER_FROM_EMAIL) return;
  if (!isValidEmail(to)) return;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: ORDER_FROM_EMAIL,
        to: [to],
        subject: sanitizeText(subject, 180),
        html: String(html || ""),
        text: String(text || ""),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("Resend email error:", response.status, body);
    }
  } catch (error) {
    console.error("Resend email exception:", error.message);
  }
}

function decodePngDataUrl(value) {
  const dataUrl = String(value || "").trim();
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) {
    return { ok: false, error: "Format invalide. Envoie un PNG." };
  }

  let buffer;
  try {
    buffer = Buffer.from(match[1], "base64");
  } catch (_error) {
    return { ok: false, error: "Image PNG illisible." };
  }

  if (!buffer || !buffer.length) {
    return { ok: false, error: "Image vide." };
  }

  if (buffer.length > ADMIN_UPLOAD_MAX_BYTES) {
    return { ok: false, error: "Image trop lourde (max 8MB)." };
  }

  if (!isPngBuffer(buffer)) {
    return { ok: false, error: "Signature PNG invalide." };
  }

  return { ok: true, buffer };
}

function isPngBuffer(buffer) {
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!Buffer.isBuffer(buffer) || buffer.length < pngSignature.length) {
    return false;
  }

  return pngSignature.every((byte, index) => buffer[index] === byte);
}

function sanitizeTrackProps(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const entries = Object.entries(input).slice(0, 20);
  const result = {};

  for (const [key, value] of entries) {
    const safeKey = sanitizeText(key, 40);
    if (!safeKey) continue;

    if (typeof value === "number" && Number.isFinite(value)) {
      result[safeKey] = Number(value.toFixed(4));
      continue;
    }

    if (typeof value === "boolean") {
      result[safeKey] = value;
      continue;
    }

    if (typeof value === "string") {
      result[safeKey] = sanitizeText(value, 160);
      continue;
    }
  }

  return result;
}

async function appendTrackingEvent({ eventName, props = {}, req } = {}) {
  const eventsDoc = await readJson(EVENTS_FILE, { events: [] });
  const events = Array.isArray(eventsDoc.events) ? eventsDoc.events : [];

  const nextEvent = {
    id: crypto.randomUUID(),
    eventName: sanitizeText(eventName, 40),
    props,
    path: req ? sanitizeText(req.path, 160) : "",
    referrer: req ? sanitizeText(req.headers.referer, 200) : "",
    userAgentHash: req ? hashIpUa(req) : "system",
    createdAt: new Date().toISOString(),
  };

  events.unshift(nextEvent);
  const capped = events.slice(0, 5000);
  await writeJson(EVENTS_FILE, { events: capped });
}

function hashIpUa(req) {
  const ip = String(req.ip || "");
  const ua = String(req.headers["user-agent"] || "");
  return crypto.createHash("sha256").update(`${ip}::${ua}`).digest("hex").slice(0, 16);
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(filePath, payload, "utf8");
}

async function ensureJsonFile(filePath, fallback) {
  try {
    await fs.access(filePath);
  } catch (_error) {
    await writeJson(filePath, fallback);
  }
}

async function bootstrapDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await ensureJsonFile(ORDERS_FILE, { orders: [] });
  await ensureJsonFile(NEWSLETTER_FILE, { subscribers: [] });
  await ensureJsonFile(EVENTS_FILE, { events: [] });
}

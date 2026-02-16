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
const COLLECTIONS_FILE = path.join(DATA_DIR, "collections.json");
const SITE_FILE = path.join(DATA_DIR, "site.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const NEWSLETTER_FILE = path.join(DATA_DIR, "newsletter.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");

const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || "change-this-admin-token";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

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
  "https://identity.netlify.com",
  "https://cdn.jsdelivr.net",
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
    "https://identity.netlify.com",
    "https://api.netlify.com",
  ],
  frameSrc: ["https://js.stripe.com", "https://hooks.stripe.com", "https://*.netlify.com"],
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

  const adminHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        ...sharedCspDirectives,
        // Decap CMS requires eval on /admin only.
        scriptSrc: [...sharedScriptSrc, "'unsafe-eval'"],
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });

  app.use((req, res, next) => {
    if (req.path.startsWith("/admin")) {
      return adminHelmet(req, res, next);
    }
    return defaultHelmet(req, res, next);
  });
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
      const nextOrders = (ordersDoc.orders || []).map((order) => {
        if (order.id !== orderId) return order;
        return {
          ...order,
          status: "paid",
          stripePaymentIntentId: session.payment_intent || "",
          stripeSessionId: session.id || order.stripeSessionId,
          paidAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
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
    }
  }

  return res.json({ received: true });
});

app.use("/api", apiLimiter);
app.use(express.json({ limit: "1mb" }));

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
  const nextOrders = orders.map((order) => {
    if (order.id !== orderId) return order;
    found = true;
    return {
      ...order,
      status: status || order.status,
      note: sanitizeText(note, 280),
      updatedAt: new Date().toISOString(),
    };
  });

  if (!found) {
    return res.status(404).json({ error: "Commande introuvable." });
  }

  await writeJson(ORDERS_FILE, { orders: nextOrders });
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

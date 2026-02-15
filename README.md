# Délé Dzina - Site officiel e-commerce

## Stack

- Frontend: HTML/CSS/JS (no framework)
- Backend: Node.js + Express
- Paiement carte: Stripe Checkout + webhook
- Admin: panel custom (`/admin/panel.html`) + Decap CMS (`/admin/`)

## Fonctionnalités livrées

- Catalogue dynamique, recherche, tri, fiches produit
- Panier persistant (localStorage)
- Checkout carte sécurisé (`/api/create-checkout-session`)
- Confirmation et annulation checkout (`checkout-success.html`, `checkout-cancel.html`)
- Gestion commandes (statuts) dans admin panel
- Gestion produits dans admin panel
- Inscription newsletter (`/api/newsletter`)
- Tracking conversion (`/api/track`) + option GA4 (`ga_measurement_id` dans `data/site.json`)
- SEO de base: OpenGraph/Twitter tags, canonical, `robots.txt`, `sitemap.xml`, `manifest.webmanifest`
- Hardening backend: `helmet`, `compression`, `rate-limit`, cache headers statiques

## Prérequis

- Node.js 18+
- Compte Stripe (test/live)

## Installation locale

```bash
npm install
cp .env.example .env
```

## Variables `.env`

```env
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
ADMIN_API_TOKEN=change-this-admin-token
```

## Lancer en local

```bash
npm run dev
```

- Site: `http://localhost:3000`
- Admin panel: `http://localhost:3000/admin/panel.html`
- Decap CMS: `http://localhost:3000/admin/`

## Webhook Stripe (local)

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copier le `whsec_...` retourné dans `STRIPE_WEBHOOK_SECRET`.

## API principale

- `GET /api/health`
- `GET /api/site`
- `GET /api/products`
- `GET /api/order/:orderId/summary`
- `POST /api/newsletter`
- `POST /api/track`
- `POST /api/create-checkout-session`
- `POST /api/stripe/webhook`
- `GET /api/admin/overview` (header `x-admin-token`)
- `GET /api/admin/orders` (header `x-admin-token`)
- `PATCH /api/admin/orders/:orderId` (header `x-admin-token`)
- `PUT /api/admin/products` (header `x-admin-token`)

## Tracking conversion

### Tracking interne

Les événements sont stockés dans `data/events.json`.

Événements pris en charge:

- `page_view`
- `add_to_cart`
- `remove_from_cart`
- `begin_checkout`
- `checkout_error`
- `purchase`
- `newsletter_signup`

### Google Analytics 4 (optionnel)

Dans `data/site.json`, renseigner `ga_measurement_id` (ex: `G-XXXXXXXXXX`).
Le frontend charge automatiquement `gtag` et envoie les événements e-commerce.

## Déploiement production

### 1) Render

Fichier prêt: `render.yaml`

1. Créer un nouveau service Web sur Render depuis ce repo.
2. Vérifier:
   - Build command: `npm install`
   - Start command: `npm start`
3. Définir les variables d’environnement:
   - `NODE_ENV=production`
   - `BASE_URL=https://ton-domaine.com`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `ADMIN_API_TOKEN`
4. Configurer le webhook Stripe vers:
   - `https://ton-domaine.com/api/stripe/webhook`

### 2) Railway

Fichier prêt: `railway.json`

1. Créer un projet Railway depuis le repo.
2. Variables d’environnement identiques à Render.
3. Vérifier la route santé: `/api/health`.
4. Configurer webhook Stripe vers le domaine Railway.

### 3) VPS (Docker + Nginx)

Fichiers prêts:

- `Dockerfile`
- `.dockerignore`
- `deploy/nginx.deledzina.conf`

Commande exemple:

```bash
docker build -t dele-dzina-store .
docker run -d --name dele-dzina-store \
  -p 3000:3000 \
  --env-file .env \
  dele-dzina-store
```

Configurer Nginx avec `deploy/nginx.deledzina.conf`, puis SSL via Certbot.

## Checklist mise en ligne

1. Mettre un vrai domaine dans `data/site.json` (`site_url`).
2. Mettre des URLs absolues d’images produit si possible (meilleur rendu Stripe).
3. Remplacer les visuels placeholders dans `images/products/`.
4. Régénérer `sitemap.xml` avec le domaine final.
5. Définir un `ADMIN_API_TOKEN` fort et unique.
6. Vérifier que webhook Stripe est `200 OK`.

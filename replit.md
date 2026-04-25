# carddesign.skin

MVP storefront and backend for a premium card-skin ecommerce site.

## Tech Stack

- **Runtime:** Node.js 20 (no external dependencies — uses only the Node standard library)
- **Server:** Plain `node:http` server in `server.js` that serves static HTML/CSS/JS and exposes JSON API routes
- **Storage:** Local JSON files in `data/` (`orders.json`, `webhook-events.json`)
- **Frontend:** Static HTML/CSS/JS pages (`index.html`, `checkout.html`, `confirmation.html`, `admin.html`, `admin-login.html`)
- **Integrations:** Razorpay (payments), Shiprocket (shipping), Resend / SMTP (email) — all run in demo mode if env vars are missing

## Project Layout

- `server.js` — HTTP server, API routes, webhook handlers, admin sessions
- `store.js`, `app.js`, `checkout.js`, `confirmation.js`, `admin.js`, `admin-login.js` — frontend scripts
- `*.html` + `styles.css` — frontend pages
- `data/` — runtime JSON storage (created on first write)
- `.env.example` — template for environment variables

## Replit Setup

- Workflow `Start application` runs `PORT=5000 node server.js`
- Server binds to `0.0.0.0:5000` so it is reachable through Replit's preview proxy
- Cache-Control no-store headers are added in non-production for static files so the proxied iframe always sees the latest code
- Deployment target: `vm` (single instance) because order/webhook data is persisted to local JSON files
- Production run command: `node server.js`

## Environment Variables

All optional — without them the server runs in demo mode. See `.env.example` for the full list (Razorpay, Shiprocket, admin password, email/SMTP, webhook secrets).

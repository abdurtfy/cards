# carddesign.skin

MVP storefront and backend for a premium card-skin ecommerce site.

## Tech Stack

- **Runtime:** Node.js 20 (no external dependencies — uses only the Node standard library)
- **Server:** Plain `node:http` server in `server.js` that serves static HTML/CSS/JS and exposes JSON API routes
- **Storage:** Local JSON files in `data/` (`orders.json`, `webhook-events.json`)
- **Frontend:** Static HTML/CSS/JS pages (`index.html`, `checkout.html`, `confirmation.html`, `admin.html`, `admin-login.html`)
- **Integrations:** Razorpay (payments), Shiprocket (shipping), Resend / SMTP (email) — all run in demo mode if env vars are missing

## Project Layout

- `server.js` — HTTP server, API routes, webhook handlers, admin sessions. Exports the request handler; only calls `listen()` when invoked directly, so the same module powers both the local Replit server and the Vercel serverless function.
- `api/index.js` — Vercel serverless entry point that delegates every request to the exported `server.js` handler
- `vercel.json` — Vercel build/route config: rewrites all paths to the catch-all function and includes static + data files in the bundle
- `package.json` — Node engine + scripts (no dependencies)
- `store.js`, `app.js`, `checkout.js`, `confirmation.js`, `admin.js`, `admin-login.js` — frontend scripts
- `*.html` + `styles.css` — frontend pages
- `data/` — runtime JSON storage (created on first write)
- `.env.example` — template for environment variables
- `.vercelignore` — excludes Replit/local artifacts from the Vercel bundle

## Replit Setup

- Workflow `Start application` runs `PORT=5000 node server.js`
- Server binds to `0.0.0.0:5000` so it is reachable through Replit's preview proxy
- Cache-Control no-store headers are added in non-production for static files so the proxied iframe always sees the latest code
- Deployment target: `vm` (single instance) because order/webhook data is persisted to local JSON files
- Production run command: `node server.js`

## Environment Variables

All optional — without them the server runs in demo mode. See `.env.example` for the full list (Razorpay, Shiprocket, admin password, email/SMTP, webhook secrets). On Vercel, configure these under Project Settings → Environment Variables.

## Deploying to Vercel

The repo is Vercel-ready: `vercel.json` rewrites every request to a single Node serverless function (`api/index.js`) which delegates to the request handler exported from `server.js`. Static files at the project root are bundled in via `includeFiles`.

**Storage caveat:** Vercel's filesystem is read-only at runtime (only `/tmp` is writable, and per-instance). The current implementation reads/writes JSON files in `data/` and stores image uploads in `uploads/`, so on Vercel:
- Reads work for the data shipped in the deploy bundle (initial product overrides, seeded orders).
- Writes (new orders, stock edits, image uploads) won't survive across invocations and won't be visible to other instances.

For a real Vercel deploy, swap the JSON-file storage in `server.js` for a managed store (Vercel KV / Postgres / Neon for orders + product overrides, and Vercel Blob / S3 / Cloudinary for image uploads). The `serveStatic` and API handlers can stay as-is; only the read/write helpers (`readOrders`, `writeOrders`, `readProductOverrides`, `writeProductOverrides`, the `/api/admin/products/upload` handler) need new backends.

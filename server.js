const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const tls = require("node:tls");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(__dirname, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const WEBHOOK_EVENTS_FILE = path.join(DATA_DIR, "webhook-events.json");
const adminSessions = new Set();

const products = [
  { id: "noir-neon", name: "Noir Neon", price: 299 },
  { id: "cyber-wave", name: "Cyber Wave", price: 279 },
  { id: "metro-midnight", name: "Metro Midnight", price: 249 },
  { id: "anime-surge", name: "Anime Surge", price: 329 },
  { id: "black-gold", name: "Black Gold", price: 349 },
  { id: "pixel-pop", name: "Pixel Pop", price: 229 },
  { id: "carbon-rush", name: "Carbon Rush", price: 299 },
  { id: "silver-static", name: "Silver Static", price: 319 },
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const env = fs.readFileSync(filePath, "utf8");
  for (const line of env.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || "";
  for (const cookie of header.split(";")) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function createSession() {
  const token = crypto.randomBytes(32).toString("base64url");
  adminSessions.add(token);
  return token;
}

function isAdminRequest(req) {
  const token = parseCookies(req).cds_admin_session;
  return Boolean(token && adminSessions.has(token));
}

function cookieOptions(maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `cds_admin_session=${maxAge ? "" : "deleted"}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function safeCompare(value, expected) {
  const first = Buffer.from(String(value || ""));
  const second = Buffer.from(String(expected || ""));
  if (first.length !== second.length) return false;
  return crypto.timingSafeEqual(first, second);
}

function readOrders() {
  return readJsonFile(ORDERS_FILE, []);
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeOrders(orders) {
  writeJsonFile(ORDERS_FILE, orders);
}

function hasProcessedWebhook(id) {
  if (!id) return false;
  return readJsonFile(WEBHOOK_EVENTS_FILE, []).some((event) => event.id === id);
}

function saveProcessedWebhook(id, source, event) {
  if (!id) return;
  const events = readJsonFile(WEBHOOK_EVENTS_FILE, []);
  events.unshift({ id, source, event, processed_at: new Date().toISOString() });
  writeJsonFile(WEBHOOK_EVENTS_FILE, events.slice(0, 500));
}

function saveOrder(order) {
  const orders = readOrders();
  const existingIndex = orders.findIndex((item) => item.id === order.id);
  if (existingIndex >= 0) orders[existingIndex] = order;
  else orders.unshift(order);
  writeOrders(orders);
  return order;
}

function updateOrder(id, patch) {
  const orders = readOrders();
  const order = orders.find((item) => item.id === id || item.razorpay_order_id === id);
  if (!order) return null;
  Object.assign(order, patch, { updated_at: new Date().toISOString() });
  writeOrders(orders);
  return order;
}

function publicOrder(order) {
  return {
    id: order.id,
    razorpay_order_id: order.razorpay_order_id,
    razorpay_payment_id: order.razorpay_payment_id,
    shiprocket_order_id: order.shiprocket_order_id,
    awb_code: order.awb_code,
    status: order.status,
    payment_status: order.payment_status,
    shipping_status: order.shipping_status,
    customer: order.customer,
    lines: order.lines,
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
    email_status: order.email_status,
    shipping_email_status: order.shipping_email_status,
    created_at: order.created_at,
    updated_at: order.updated_at,
    error: order.error,
  };
}

function confirmationOrder(order) {
  return {
    id: order.id,
    status: order.status,
    payment_status: order.payment_status,
    shipping_status: order.shipping_status,
    shiprocket_order_id: order.shiprocket_order_id,
    awb_code: order.awb_code,
    lines: order.lines,
    total: order.total,
    email_status: order.email_status,
    shipping_email_status: order.shipping_email_status,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      try {
        resolve({ raw: body, json: body ? JSON.parse(body) : {} });
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function calculateOrder(items = []) {
  const lines = items.map((item) => {
    const product = products.find((candidate) => candidate.id === item.id);
    const quantity = Number(item.quantity || 0);
    if (!product || quantity < 1) return null;
    return { ...product, quantity };
  });

  if (lines.some((line) => !line) || !lines.length) {
    throw new Error("Invalid cart items");
  }

  const subtotal = lines.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = subtotal > 499 ? 0 : 49;
  return { lines, subtotal, shipping, total: subtotal + shipping };
}

async function shiprocketRequest(pathname, options = {}) {
  if (!process.env.SHIPROCKET_EMAIL || !process.env.SHIPROCKET_PASSWORD) {
    return { demo: true };
  }

  const login = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    }),
  });
  const auth = await login.json();
  if (!login.ok) throw new Error(auth.message || "Shiprocket auth failed");

  const response = await fetch(`https://apiv2.shiprocket.in/v1/external${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.token}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Shiprocket request failed");
  return data;
}

async function sendEmail({ to, subject, html }) {
  if (!to) return { status: "missing_recipient" };
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_FROM) {
    await sendSmtpEmail({ to, subject, html });
    return { status: "sent_smtp" };
  }
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return { status: "demo_not_sent" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Email send failed");
  return { status: "sent", provider_id: data.id };
}

function sendSmtpEmail({ to, subject, html }) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const from = process.env.EMAIL_FROM;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const message = [
    `From: carddesign.skin <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
  ].join("\r\n");

  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host }, () => {
      const commands = [
        `EHLO carddesign.skin`,
        "AUTH LOGIN",
        Buffer.from(user).toString("base64"),
        Buffer.from(pass).toString("base64"),
        `MAIL FROM:<${from}>`,
        `RCPT TO:<${to}>`,
        "DATA",
        `${message.replace(/\r?\n\./g, "\r\n..")}\r\n.`,
        "QUIT",
      ];
      let index = 0;
      const sendNext = () => {
        if (index < commands.length) socket.write(`${commands[index++]}\r\n`);
      };

      socket.on("data", (chunk) => {
        const response = chunk.toString();
        if (/^[45]\d\d/m.test(response)) {
          socket.destroy();
          reject(new Error("SMTP send failed"));
          return;
        }
        if (response.includes("221")) resolve();
        else sendNext();
      });
      sendNext();
    });
    socket.setTimeout(15000, () => {
      socket.destroy();
      reject(new Error("SMTP timed out"));
    });
    socket.on("error", reject);
  });
}

async function sendOrderEmails(order) {
  const items = order.lines.map((item) => `<li>${item.name} x ${item.quantity}</li>`).join("");
  const confirmationEmail = await sendEmail({
    to: order.customer?.email,
    subject: `Order confirmed: ${order.id}`,
    html: `
      <h1>Your carddesign.skin order is confirmed</h1>
      <p>Order ID: <strong>${order.id}</strong></p>
      <p>Total: <strong>Rs ${order.total}</strong></p>
      <ul>${items}</ul>
      <p>We will send another update when shipping moves forward.</p>
    `,
  });

  const shippingEmail = await sendEmail({
    to: order.customer?.email,
    subject: `Shipping update: ${order.id}`,
    html: `
      <h1>Your order is being prepared for shipping</h1>
      <p>Order ID: <strong>${order.id}</strong></p>
      <p>Shiprocket order: <strong>${order.shiprocket_order_id || "Pending"}</strong></p>
      <p>AWB: <strong>${order.awb_code || "Pending"}</strong></p>
    `,
  });

  return { confirmationEmail, shippingEmail };
}

async function fulfillPaidOrder(order, payment = {}) {
  if (!order) throw new Error("Paid order not found");
  const shiprocketOrder = await createShiprocketOrder({
    items: order.lines.map(({ id, quantity }) => ({ id, quantity })),
    customer: order.customer,
    payment: {
      razorpay_order_id: order.razorpay_order_id,
      razorpay_payment_id: payment.razorpay_payment_id || order.razorpay_payment_id,
    },
  });
  const updatedOrder = updateOrder(order.id, {
    status: "ready_to_ship",
    shipping_status: shiprocketOrder.shipping_status || "created",
    shiprocket_order_id: shiprocketOrder.order_id || shiprocketOrder.shiprocket_order_id,
    awb_code: shiprocketOrder.awb_code,
  });
  await markOrderEmails(updatedOrder);
  return { updatedOrder, shiprocketOrder };
}

async function markOrderEmails(order) {
  try {
    const emails = await sendOrderEmails(order);
    updateOrder(order.id, {
      email_status: emails.confirmationEmail.status,
      shipping_email_status: emails.shippingEmail.status,
    });
  } catch (emailError) {
    updateOrder(order.id, {
      email_status: "failed",
      shipping_email_status: "failed",
      email_error: emailError.message,
    });
  }
}

function verifyRazorpayWebhook(rawBody, signature) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  return safeCompare(signature, expected);
}

function findOrderFromWebhookPayload(payload) {
  const payment = payload.payload?.payment?.entity;
  const orderEntity = payload.payload?.order?.entity;
  const razorpayOrderId = payment?.order_id || orderEntity?.id;
  if (!razorpayOrderId) return null;
  return readOrders().find((order) => order.razorpay_order_id === razorpayOrderId);
}

function findShiprocketOrder(payload) {
  const candidates = [
    payload.order_id,
    payload.shiprocket_order_id,
    payload.sr_order_id,
    payload.awb,
    payload.awb_code,
    payload.current_tracking_status?.awb_code,
    payload.shipment?.awb_code,
    payload.shipment?.order_id,
  ].filter(Boolean).map(String);
  return readOrders().find((order) =>
    candidates.includes(String(order.shiprocket_order_id)) ||
    candidates.includes(String(order.awb_code)) ||
    candidates.includes(String(order.razorpay_order_id)) ||
    candidates.includes(String(order.id)),
  );
}

async function createRazorpayOrder(payload) {
  const order = calculateOrder(payload.items);
  const amount = order.total * 100;
  const localOrderId = `cds_${Date.now()}`;

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    const demoOrderId = `order_demo_${Date.now()}`;
    saveOrder({
      id: localOrderId,
      razorpay_order_id: demoOrderId,
      status: "payment_pending",
      payment_status: "created_demo",
      shipping_status: "not_created",
      customer: payload.customer,
      ...order,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return {
      demo: true,
      id: demoOrderId,
      local_order_id: localOrderId,
      amount,
      currency: "INR",
      order,
    };
  }

  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount,
      currency: "INR",
      receipt: localOrderId,
      notes: { customer_phone: payload.customer?.phone || "" },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.description || "Razorpay order failed");
  saveOrder({
    id: localOrderId,
    razorpay_order_id: data.id,
    status: "payment_pending",
    payment_status: data.status || "created",
    shipping_status: "not_created",
    customer: payload.customer,
    ...order,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return { ...data, key: process.env.RAZORPAY_KEY_ID, local_order_id: localOrderId, order };
}

function verifyRazorpaySignature(payment) {
  if (!process.env.RAZORPAY_KEY_SECRET) return true;

  const payload = `${payment.razorpay_order_id}|${payment.razorpay_payment_id}`;
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(payload).digest("hex");
  return expected === payment.razorpay_signature;
}

async function createShiprocketOrder({ items, customer, payment }) {
  const order = calculateOrder(items);
  const body = {
    order_id: payment?.razorpay_order_id || `cds_${Date.now()}`,
    order_date: new Date().toISOString().slice(0, 10),
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || "Primary",
    billing_customer_name: customer.name,
    billing_address: customer.address,
    billing_city: customer.city,
    billing_pincode: customer.pin,
    billing_state: customer.state,
    billing_country: "India",
    billing_email: customer.email,
    billing_phone: customer.phone,
    shipping_is_billing: true,
    order_items: order.lines.map((item) => ({
      name: item.name,
      sku: item.id,
      units: item.quantity,
      selling_price: item.price,
    })),
    payment_method: "Prepaid",
    sub_total: order.subtotal,
    length: 12,
    breadth: 9,
    height: 1,
    weight: 0.2,
  };

  const data = await shiprocketRequest("/orders/create/adhoc", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (data.demo) return { demo: true, shiprocket_order_id: `shiprocket_demo_${Date.now()}`, shipping_status: "created_demo" };
  return data;
}

async function handleApi(req, res, url) {
  try {
    const body = req.method === "GET" ? { raw: "", json: {} } : await readBody(req);
    const payload = body.json;

    if (req.method === "POST" && url.pathname === "/api/admin/login") {
      if (!process.env.ADMIN_PASSWORD) {
        return json(res, 500, { error: "Admin password is not configured" });
      }
      if (!safeCompare(payload.password, process.env.ADMIN_PASSWORD)) {
        return json(res, 401, { error: "Wrong password" });
      }
      res.setHeader("Set-Cookie", cookieOptions(60 * 60 * 12).replace("cds_admin_session=", `cds_admin_session=${createSession()}`));
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/logout") {
      const token = parseCookies(req).cds_admin_session;
      if (token) adminSessions.delete(token);
      res.setHeader("Set-Cookie", cookieOptions(0));
      return json(res, 200, { ok: true });
    }

    if (url.pathname.startsWith("/api/admin/") && !isAdminRequest(req)) {
      return json(res, 401, { error: "Admin login required" });
    }

    if (req.method === "GET" && url.pathname === "/api/admin/orders") {
      return json(res, 200, { orders: readOrders().map(publicOrder) });
    }

    if (req.method === "GET" && url.pathname === "/api/order/confirmation") {
      const order = readOrders().find((item) => item.id === url.searchParams.get("id"));
      if (!order) return json(res, 404, { error: "Order not found" });
      return json(res, 200, { order: confirmationOrder(order) });
    }

    if (req.method === "POST" && url.pathname === "/api/webhooks/razorpay") {
      const eventId = req.headers["x-razorpay-event-id"];
      if (!verifyRazorpayWebhook(body.raw, req.headers["x-razorpay-signature"])) {
        return json(res, 400, { error: "Invalid Razorpay webhook signature" });
      }
      if (hasProcessedWebhook(eventId)) return json(res, 200, { ok: true, duplicate: true });

      const order = findOrderFromWebhookPayload(payload);
      const payment = payload.payload?.payment?.entity || {};
      if (order && payload.event === "payment.captured") {
        const paidOrder = updateOrder(order.id, {
          status: "paid",
          payment_status: "captured",
          razorpay_payment_id: payment.id,
        });
        if (paidOrder.shipping_status === "not_created" || paidOrder.shipping_status === "failed") {
          try {
            await fulfillPaidOrder(paidOrder, { razorpay_payment_id: payment.id });
          } catch (error) {
            updateOrder(paidOrder.id, {
              status: "paid_shipping_failed",
              shipping_status: "failed",
              error: error.message,
            });
          }
        }
      } else if (order && payload.event === "payment.failed") {
        updateOrder(order.id, {
          status: "payment_failed",
          payment_status: "failed",
          error: payment.error_description || "Payment failed",
        });
      } else if (order && payload.event === "payment.authorized") {
        updateOrder(order.id, { payment_status: "authorized" });
      }

      saveProcessedWebhook(eventId, "razorpay", payload.event);
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/webhooks/shiprocket") {
      const token = req.headers["x-shiprocket-token"] || url.searchParams.get("token");
      if (process.env.SHIPROCKET_WEBHOOK_TOKEN && token !== process.env.SHIPROCKET_WEBHOOK_TOKEN) {
        return json(res, 401, { error: "Invalid Shiprocket webhook token" });
      }

      const order = findShiprocketOrder(payload);
      if (order) {
        const shippingStatus =
          payload.current_status ||
          payload.shipment_status ||
          payload.status ||
          payload.current_tracking_status?.current_status ||
          "updated";
        updateOrder(order.id, {
          shipping_status: shippingStatus,
          status: String(shippingStatus).toLowerCase().includes("delivered") ? "delivered" : order.status,
          shiprocket_order_id: payload.order_id || payload.shiprocket_order_id || payload.sr_order_id || order.shiprocket_order_id,
          awb_code: payload.awb || payload.awb_code || payload.current_tracking_status?.awb_code || order.awb_code,
        });
      }
      saveProcessedWebhook(payload.event_id || payload.id || `${Date.now()}`, "shiprocket", payload.event || payload.status || "shipment_update");
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/razorpay/order") {
      return json(res, 200, await createRazorpayOrder(payload));
    }

    if (req.method === "POST" && url.pathname === "/api/razorpay/verify") {
      if (!verifyRazorpaySignature(payload.payment || {})) {
        updateOrder(payload.payment?.razorpay_order_id, {
          status: "payment_failed",
          payment_status: "signature_failed",
          error: "Payment signature verification failed",
        });
        return json(res, 400, { error: "Payment signature verification failed" });
      }
      updateOrder(payload.payment.razorpay_order_id, {
        status: "paid",
        payment_status: "captured",
        razorpay_payment_id: payload.payment.razorpay_payment_id,
      });
      try {
        const paidOrder = readOrders().find((order) => order.razorpay_order_id === payload.payment.razorpay_order_id);
        const { updatedOrder, shiprocketOrder } = await fulfillPaidOrder(paidOrder, payload.payment);
        return json(res, 200, { verified: true, order: publicOrder(updatedOrder), ...shiprocketOrder });
      } catch (error) {
        const updatedOrder = updateOrder(payload.payment.razorpay_order_id, {
          status: "paid_shipping_failed",
          shipping_status: "failed",
          error: error.message,
        });
        try {
          const confirmationEmail = await sendEmail({
            to: updatedOrder.customer?.email,
            subject: `Order confirmed: ${updatedOrder.id}`,
            html: `<h1>Your carddesign.skin order is confirmed</h1><p>Order ID: <strong>${updatedOrder.id}</strong></p><p>We will follow up on shipping shortly.</p>`,
          });
          updateOrder(updatedOrder.id, { email_status: confirmationEmail.status });
        } catch (emailError) {
          updateOrder(updatedOrder.id, { email_status: "failed", email_error: emailError.message });
        }
        return json(res, 200, { verified: true, order: publicOrder(updatedOrder), shipping_error: error.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/shiprocket/serviceability") {
      const data = await shiprocketRequest(
        `/courier/serviceability/?pickup_postcode=${payload.pickup_postcode}&delivery_postcode=${payload.delivery_postcode}&cod=${payload.cod || 0}&weight=${payload.weight || 0.2}`,
      );
      if (data.demo) return json(res, 200, { demo: true, available: true, freight: 49 });
      const courier = data.data?.available_courier_companies?.[0];
      return json(res, 200, { available: Boolean(courier), freight: courier?.freight_charge || 0, courier });
    }

    return json(res, 404, { error: "API route not found" });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
}

function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const baseName = path.basename(filePath);
  const isProtectedAdminAsset = requestedPath === "/admin.html" || requestedPath === "/admin.js";
  const isPrivateFile =
    baseName.startsWith(".") ||
    requestedPath.startsWith("/data/") ||
    requestedPath === "/server.js" ||
    requestedPath === "/README.md";

  if (isPrivateFile) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  if (isProtectedAdminAsset && !isAdminRequest(req)) {
    res.writeHead(302, { Location: "/admin-login.html" });
    res.end();
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const headers = {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    };
    if (process.env.NODE_ENV !== "production") {
      headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
    }
    res.writeHead(200, headers);
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url);
    return;
  }
  serveStatic(req, res, url);
});

const HOST = process.env.HOST || "0.0.0.0";
server.listen(PORT, HOST, () => {
  console.log(`carddesign.skin running at http://${HOST}:${PORT}`);
});

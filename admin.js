const ordersList = document.querySelector("#ordersList");
const orderCount = document.querySelector("#orderCount");
const refreshOrders = document.querySelector("#refreshOrders");
const logoutButton = document.querySelector("#logoutButton");

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function renderOrders(orders) {
  orderCount.textContent = `${orders.length} ${orders.length === 1 ? "order" : "orders"}`;
  ordersList.innerHTML = orders.length
    ? orders
        .map(
          (order) => `
            <article class="admin-order">
              <div class="admin-order-head">
                <div>
                  <h2>${order.id}</h2>
                  <p class="muted">${formatDate(order.created_at)}</p>
                </div>
                <span class="status-pill">${order.status || "unknown"}</span>
              </div>

              <div class="admin-grid">
                <div>
                  <h3>Customer</h3>
                  <p>${order.customer?.name || "Not provided"}</p>
                  <p>${order.customer?.phone || ""}</p>
                  <p>${order.customer?.email || ""}</p>
                </div>
                <div>
                  <h3>Address</h3>
                  <p>${order.customer?.address || "Not provided"}</p>
                  <p>${[order.customer?.city, order.customer?.state, order.customer?.pin].filter(Boolean).join(", ")}</p>
                </div>
                <div>
                  <h3>Status</h3>
                  <p>Payment: ${order.payment_status || "pending"}</p>
                  <p>Shipping: ${order.shipping_status || "not_created"}</p>
                  <p>Shiprocket: ${order.shiprocket_order_id || "pending"}</p>
                  <p>Email: ${order.email_status || "pending"}</p>
                  <p>Shipping email: ${order.shipping_email_status || "pending"}</p>
                </div>
                <div>
                  <h3>Total</h3>
                  <p>${formatCurrency(order.total)}</p>
                  <p>Razorpay: ${order.razorpay_order_id || "pending"}</p>
                  <p>AWB: ${order.awb_code || "pending"}</p>
                </div>
              </div>

              <div class="admin-items">
                ${(order.lines || [])
                  .map((item) => `<span>${item.name} x ${item.quantity}</span>`)
                  .join("")}
              </div>

              ${order.error ? `<p class="status-line">${order.error}</p>` : ""}
            </article>
          `,
        )
        .join("")
    : `<p class="muted">No orders yet. Create one from checkout and it will appear here.</p>`;
}

async function loadOrders() {
  ordersList.innerHTML = `<p class="muted">Loading orders...</p>`;
  try {
    const response = await fetch("/api/admin/orders");
    const data = await response.json();
    if (response.status === 401) {
      window.location.href = "./admin-login.html";
      return;
    }
    if (!response.ok) throw new Error(data.error || "Could not load orders");
    renderOrders(data.orders);
  } catch (error) {
    ordersList.innerHTML = `<p class="status-line">${error.message}</p>`;
  }
}

logoutButton.addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  window.location.href = "./admin-login.html";
});

refreshOrders.addEventListener("click", loadOrders);
loadOrders();

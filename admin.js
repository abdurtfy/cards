const ordersList = document.querySelector("#ordersList");
const orderCount = document.querySelector("#orderCount");
const refreshOrders = document.querySelector("#refreshOrders");
const logoutButton = document.querySelector("#logoutButton");
const catalogList = document.querySelector("#catalogList");
const imagesList = document.querySelector("#imagesList");
const tabs = document.querySelectorAll(".admin-tab");
const sections = document.querySelectorAll(".admin-section");

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

function activateTab(name) {
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  sections.forEach((section) => {
    section.hidden = section.dataset.section !== name;
  });
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
});

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

function renderCatalog(items) {
  catalogList.innerHTML = items
    .map(
      (p) => `
        <div class="catalog-row" data-id="${p.id}">
          <div>
            <label>Name</label>
            <input type="text" data-field="name" value="${p.name.replace(/"/g, "&quot;")}" />
            <span class="stock-tag ${p.stock > 0 ? "in" : "out"}">${p.stock > 0 ? "Available" : "Out of stock"}</span>
          </div>
          <div>
            <label>Price (Rs)</label>
            <input type="number" min="0" step="1" data-field="price" value="${p.price}" />
          </div>
          <div>
            <label>Stock</label>
            <input type="number" min="0" step="1" data-field="stock" value="${p.stock}" />
          </div>
          <button class="secondary-action" type="button" data-save="${p.id}">Save</button>
        </div>
      `,
    )
    .join("");
}

function renderImages(items) {
  imagesList.innerHTML = items
    .map(
      (p) => `
        <div class="image-row" data-id="${p.id}">
          <div class="image-preview" style="${p.image ? `background:#111 center/cover url('${p.image}');` : `--skin-bg: linear-gradient(135deg, #1f2937, #111827);`}"></div>
          <div class="image-info">
            <strong>${p.name}</strong>
            <p class="muted">${p.image ? p.image.split("/").pop() : "No image uploaded"}</p>
          </div>
          <div class="image-actions">
            <label class="secondary-action upload-label">
              Upload
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-upload="${p.id}" hidden />
            </label>
            ${p.image ? `<button class="secondary-action" type="button" data-remove-image="${p.id}">Remove</button>` : ""}
          </div>
        </div>
      `,
    )
    .join("");
}

async function loadCatalog() {
  try {
    const response = await fetch("/api/admin/products");
    if (response.status === 401) {
      window.location.href = "./admin-login.html";
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load products");
    renderCatalog(data.products);
    renderImages(data.products);
  } catch (error) {
    catalogList.innerHTML = `<p class="status-line">${error.message}</p>`;
    imagesList.innerHTML = `<p class="status-line">${error.message}</p>`;
  }
}

catalogList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-save]");
  if (!button) return;
  const row = button.closest(".catalog-row");
  const id = button.dataset.save;
  const name = row.querySelector('[data-field="name"]').value.trim();
  const price = Number(row.querySelector('[data-field="price"]').value);
  const stock = Number(row.querySelector('[data-field="stock"]').value);
  if (!name) {
    alert("Name cannot be empty");
    return;
  }
  button.disabled = true;
  button.textContent = "Saving...";
  try {
    const response = await fetch("/api/admin/products", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name, price, stock }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not save");
    button.textContent = "Saved";
    setTimeout(() => {
      button.textContent = "Save";
      button.disabled = false;
    }, 900);
    const tag = row.querySelector(".stock-tag");
    if (tag) {
      tag.className = `stock-tag ${data.product.stock > 0 ? "in" : "out"}`;
      tag.textContent = data.product.stock > 0 ? "Available" : "Out of stock";
    }
  } catch (error) {
    button.textContent = "Retry";
    button.disabled = false;
    alert(error.message);
  }
});

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

imagesList.addEventListener("change", async (event) => {
  const input = event.target.closest("[data-upload]");
  if (!input || !input.files || !input.files[0]) return;
  const id = input.dataset.upload;
  const file = input.files[0];
  if (file.size > 4_000_000) {
    alert("Image must be under 4 MB");
    input.value = "";
    return;
  }
  const row = input.closest(".image-row");
  const label = input.closest(".upload-label");
  const original = label.firstChild.textContent;
  label.firstChild.textContent = " Uploading...";
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const response = await fetch("/api/admin/products/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, dataUrl }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upload failed");
    row.querySelector(".image-preview").style.cssText = `background:#111 center/cover url('${data.product.image}');`;
    row.querySelector(".image-info p").textContent = data.product.image.split("/").pop();
    if (!row.querySelector("[data-remove-image]")) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "secondary-action";
      removeBtn.type = "button";
      removeBtn.dataset.removeImage = id;
      removeBtn.textContent = "Remove";
      row.querySelector(".image-actions").appendChild(removeBtn);
    }
  } catch (error) {
    alert(error.message);
  } finally {
    label.firstChild.textContent = original;
    input.value = "";
  }
});

imagesList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-image]");
  if (!button) return;
  const id = button.dataset.removeImage;
  if (!confirm("Remove this image?")) return;
  button.disabled = true;
  try {
    const response = await fetch("/api/admin/products/image", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not remove");
    const row = button.closest(".image-row");
    row.querySelector(".image-preview").style.cssText = `--skin-bg: linear-gradient(135deg, #1f2937, #111827);`;
    row.querySelector(".image-info p").textContent = "No image uploaded";
    button.remove();
  } catch (error) {
    button.disabled = false;
    alert(error.message);
  }
});

refreshOrders.addEventListener("click", loadOrders);
loadCatalog();
loadOrders();

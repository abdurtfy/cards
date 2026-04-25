const summaryItems = document.querySelector("#summaryItems");
const subtotal = document.querySelector("#subtotal");
const shipping = document.querySelector("#shipping");
const total = document.querySelector("#total");
const serviceabilityButton = document.querySelector("#serviceabilityButton");
const checkoutForm = document.querySelector("#checkoutForm");
const checkoutStatus = document.querySelector("#checkoutStatus");

function renderSummary() {
  const lines = getCartLines();
  subtotal.textContent = formatCurrency(getSubtotal());
  shipping.textContent = formatCurrency(getShippingCost());
  total.textContent = formatCurrency(getTotal());

  summaryItems.innerHTML = lines.length
    ? lines
        .map(
          (item) => `
            <div class="summary-item">
              <div>
                <strong>${item.name}</strong>
                <span>Qty ${item.quantity}</span>
              </div>
              <strong>${formatCurrency(item.price * item.quantity)}</strong>
            </div>
          `,
        )
        .join("")
    : `<p class="muted">Your cart is empty. Add products before checkout.</p>`;
}

function getCustomerPayload() {
  const formData = new FormData(checkoutForm);
  return Object.fromEntries(formData.entries());
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

serviceabilityButton.addEventListener("click", async () => {
  const customer = getCustomerPayload();
  if (!/^\d{6}$/.test(customer.pin || "")) {
    checkoutStatus.textContent = "Enter a valid 6-digit PIN code.";
    return;
  }

  checkoutStatus.textContent = "Checking Shiprocket serviceability...";
  try {
    const result = await postJson("/api/shiprocket/serviceability", {
      pickup_postcode: "110001",
      delivery_postcode: customer.pin,
      weight: 0.2,
      cod: 0,
    });
    checkoutStatus.textContent = result.available
      ? `Shiprocket delivery available. Estimated freight: ${formatCurrency(result.freight || 0)}.`
      : "Shiprocket did not return an available courier for this PIN.";
  } catch (error) {
    checkoutStatus.textContent = error.message;
  }
});

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const lines = getCartLines();
  if (!lines.length) {
    checkoutStatus.textContent = "Add at least one product before checkout.";
    return;
  }

  checkoutStatus.textContent = "Creating Razorpay order...";
  try {
    const customer = getCustomerPayload();
    const order = await postJson("/api/razorpay/order", {
      items: lines.map(({ id, quantity }) => ({ id, quantity })),
      customer,
    });

    if (!window.Razorpay || order.demo) {
      checkoutStatus.textContent = `Backend order created in demo mode. Add Razorpay keys to launch live payment. Order: ${order.id}`;
      return;
    }

    const razorpay = new window.Razorpay({
      key: order.key,
      amount: order.amount,
      currency: order.currency,
      name: "carddesign.skin",
      description: "Premium card skins",
      order_id: order.id,
      prefill: {
        name: customer.name,
        email: customer.email,
        contact: customer.phone,
      },
      handler: async (payment) => {
        checkoutStatus.textContent = "Verifying payment and creating Shiprocket order...";
        const verified = await postJson("/api/razorpay/verify", {
          payment,
          customer,
          items: lines.map(({ id, quantity }) => ({ id, quantity })),
        });
        localStorage.removeItem("carddesign-cart");
        window.location.href = `./confirmation.html?order=${encodeURIComponent(verified.order?.id || order.local_order_id)}`;
      },
      theme: { color: "#ff3c8a" },
    });

    razorpay.open();
  } catch (error) {
    checkoutStatus.textContent = error.message;
  }
});

renderSummary();

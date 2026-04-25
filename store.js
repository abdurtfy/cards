const products = [
  {
    id: "noir-neon",
    name: "Noir Neon",
    category: "Credit",
    price: 99,
    finish: "Matte vinyl",
    bg: "linear-gradient(135deg, #08090f, #ff3c8a 48%, #cbff38)",
  },
  {
    id: "cyber-wave",
    name: "Cyber Wave",
    category: "Debit",
    price: 99,
    finish: "Gloss vinyl",
    bg: "linear-gradient(135deg, #25d9ff, #3924ff 44%, #07080d)",
  },
  {
    id: "metro-midnight",
    name: "Metro Midnight",
    category: "Metro",
    price: 99,
    finish: "Matte vinyl",
    bg: "linear-gradient(135deg, #050608, #ffb627 28%, #ff3c8a 58%, #25d9ff)",
  },
  {
    id: "anime-surge",
    name: "Anime Surge",
    category: "Credit",
    price: 99,
    finish: "Satin vinyl",
    bg: "linear-gradient(135deg, #ffffff, #e11d48 38%, #1d4ed8 74%, #09090b)",
  },
  {
    id: "black-gold",
    name: "Black Gold",
    category: "Debit",
    price: 99,
    finish: "Soft-touch vinyl",
    bg: "linear-gradient(135deg, #030712, #111827 42%, #ffb627 43%, #f59e0b)",
  },
  {
    id: "pixel-pop",
    name: "Pixel Pop",
    category: "Metro",
    price: 99,
    finish: "Gloss vinyl",
    bg: "linear-gradient(135deg, #cbff38, #25d9ff 32%, #ff3c8a 64%, #111827)",
  },
  {
    id: "carbon-rush",
    name: "Carbon Rush",
    category: "Credit",
    price: 99,
    finish: "Textured vinyl",
    bg: "linear-gradient(135deg, #111827, #374151 40%, #ff6b35 41%, #ffb627)",
  },
  {
    id: "silver-static",
    name: "Silver Static",
    category: "Debit",
    price: 99,
    finish: "Satin vinyl",
    bg: "linear-gradient(135deg, #e5e7eb, #94a3b8 45%, #25d9ff 46%, #0f172a)",
  },
];

let cart = JSON.parse(localStorage.getItem("carddesign-cart") || "{}");

function formatCurrency(value) {
  return `Rs ${value.toLocaleString("en-IN")}`;
}

function saveCart() {
  localStorage.setItem("carddesign-cart", JSON.stringify(cart));
}

function getCartLines() {
  return Object.entries(cart)
    .map(([id, quantity]) => {
      const product = products.find((item) => item.id === id);
      return product ? { ...product, quantity } : null;
    })
    .filter(Boolean);
}

function getGrossSubtotal() {
  return getCartLines().reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function getBuy2Get1Discount() {
  const lines = getCartLines();
  const unitPrices = [];
  lines.forEach((item) => {
    for (let i = 0; i < item.quantity; i += 1) unitPrices.push(item.price);
  });
  unitPrices.sort((a, b) => a - b);
  const freeCount = Math.floor(unitPrices.length / 3);
  let discount = 0;
  for (let i = 0; i < freeCount; i += 1) discount += unitPrices[i];
  return discount;
}

function getSubtotal() {
  return getGrossSubtotal() - getBuy2Get1Discount();
}

function getShippingCost() {
  const subtotal = getSubtotal();
  return subtotal >= 499 || subtotal === 0 ? 0 : 49;
}

function getTotal() {
  return getSubtotal() + getShippingCost();
}

function addToCart(id) {
  cart[id] = (cart[id] || 0) + 1;
  saveCart();
  renderSharedCart();
}

function decreaseCart(id) {
  if (!cart[id]) return;
  cart[id] -= 1;
  if (cart[id] <= 0) delete cart[id];
  saveCart();
  renderSharedCart();
}

function renderSharedCart() {
  const lines = getCartLines();
  const itemCount = lines.reduce((sum, item) => sum + item.quantity, 0);
  const cartCount = document.querySelector("#cartCount");
  const drawerTotal = document.querySelector("#drawerTotal");
  const cartItems = document.querySelector("#cartItems");

  if (cartCount) cartCount.textContent = itemCount;
  if (drawerTotal) drawerTotal.textContent = formatCurrency(getTotal());
  if (cartItems) {
    cartItems.innerHTML = lines.length
      ? lines
          .map(
            (item) => `
              <div class="cart-item">
                <div class="cart-thumb" style="--skin-bg: ${item.bg}"></div>
                <div>
                  <strong>${item.name}</strong>
                  <span>${formatCurrency(item.price)} · ${item.finish}</span>
                </div>
                <div class="qty-controls" aria-label="${item.name} quantity controls">
                  <button type="button" data-decrease="${item.id}">-</button>
                  <strong>${item.quantity}</strong>
                  <button type="button" data-add="${item.id}">+</button>
                </div>
              </div>
            `,
          )
          .join("")
      : `<p class="muted">Your cart is empty.</p>`;
  }
}

function setupCartDrawer() {
  const cartButton = document.querySelector("#cartButton");
  const closeCartButton = document.querySelector("#closeCartButton");
  const cartDrawer = document.querySelector("#cartDrawer");

  if (!cartDrawer) return;

  cartButton?.addEventListener("click", () => {
    cartDrawer.classList.add("open");
    cartDrawer.setAttribute("aria-hidden", "false");
  });

  closeCartButton?.addEventListener("click", () => {
    cartDrawer.classList.remove("open");
    cartDrawer.setAttribute("aria-hidden", "true");
  });

  cartDrawer.addEventListener("click", (event) => {
    if (event.target === cartDrawer) {
      cartDrawer.classList.remove("open");
      cartDrawer.setAttribute("aria-hidden", "true");
    }
  });
}

document.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add]");
  const decreaseButton = event.target.closest("[data-decrease]");

  if (addButton) addToCart(addButton.dataset.add);
  if (decreaseButton) decreaseCart(decreaseButton.dataset.decrease);
});

setupCartDrawer();
renderSharedCart();

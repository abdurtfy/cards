const productGrid = document.querySelector("#productGrid");

function renderProducts() {
  productGrid.innerHTML = products
    .map((product) => {
      const out = product.stock <= 0;
      return `
        <article class="product-card${out ? " out-of-stock" : ""}">
          <div class="product-art" style="--skin-bg: ${product.bg}">
            ${out ? `<span class="stock-badge">Out of stock</span>` : ""}
          </div>
          <div class="product-body">
            <h3>${product.name}</h3>
            <p class="product-meta">${product.category} card skin · ${product.finish}</p>
            <div class="product-footer">
              <span class="price">${formatCurrency(product.price)}</span>
              <button class="add-button" type="button" data-add="${product.id}"${out ? " disabled" : ""}>${out ? "Sold out" : "Add to cart"}</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

renderProducts();
document.addEventListener("products:updated", renderProducts);

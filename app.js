const productGrid = document.querySelector("#productGrid");

function renderProducts() {
  productGrid.innerHTML = products
    .map(
      (product) => `
        <article class="product-card">
          <div class="product-art" style="--skin-bg: ${product.bg}"></div>
          <div class="product-body">
            <h3>${product.name}</h3>
            <p class="product-meta">${product.category} card skin · ${product.finish}</p>
            <div class="product-footer">
              <span class="price">${formatCurrency(product.price)}</span>
              <button class="add-button" type="button" data-add="${product.id}">Add to cart</button>
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

renderProducts();

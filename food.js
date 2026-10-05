(() => {
    "use strict";

    const catalog = window.THA_ONE_FOOD || { categories: [], restaurants: [], dishes: [] };
    const restaurants = catalog.restaurants || [];
    const dishes = catalog.dishes || [];
    const categoryIcons = { Pizza: "🍕", Burgers: "🍔", Chicken: "🍗", Chinese: "🍜", "South Indian": "🍛", Healthy: "🥗", Desserts: "🍰", Beverages: "🥤" };
    const storageKey = "tha-one-food-cart";
    const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
    const state = {
        cart: readCart(),
        category: "All",
        query: "",
        restaurantId: "",
        detailDish: null,
        lastFocus: null
    };

    function readCart() {
        try {
            const parsed = JSON.parse(localStorage.getItem(storageKey));
            return Array.isArray(parsed) ? parsed.filter((item) => typeof item.dishId === "string" && Number(item.quantity) > 0) : [];
        } catch {
            return [];
        }
    }

    function persistCart() {
        try { localStorage.setItem(storageKey, JSON.stringify(state.cart)); } catch { showToast("Your browser couldn’t save this food order."); }
        renderCart();
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    }

    function icon(name) {
        return `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
    }

    function dishById(id) {
        return dishes.find((dish) => dish.id === id);
    }

    function restaurantById(id) {
        return restaurants.find((restaurant) => restaurant.id === id);
    }

    function showToast(message) {
        const region = document.getElementById("food-toast-region");
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.setAttribute("role", "status");
        toast.textContent = message;
        region.append(toast);
        window.setTimeout(() => toast.remove(), 2800);
    }

    function renderCategories() {
        const topList = document.getElementById("food-category-list");
        const tiles = document.getElementById("food-category-tiles");
        const allCategories = ["All", ...catalog.categories];
        topList.innerHTML = allCategories.map((category) => `<button class="category-link${state.category === category ? " active" : ""}" type="button" data-food-category="${escapeHtml(category)}" aria-pressed="${state.category === category}"><span aria-hidden="true">${categoryIcons[category] || "✳"}</span>${escapeHtml(category)}</button>`).join("");
        tiles.innerHTML = catalog.categories.map((category) => `<button class="food-category-tile${state.category === category ? " active" : ""}" type="button" data-food-category="${escapeHtml(category)}" aria-pressed="${state.category === category}"><span class="food-category-icon" aria-hidden="true">${categoryIcons[category] || "✳"}</span><span>${escapeHtml(category)}</span></button>`).join("");
    }

    function getVisibleRestaurants() {
        let visible = restaurants.filter((restaurant) => {
            const restaurantDishes = dishes.filter((dish) => dish.restaurantId === restaurant.id);
            const categoryMatch = state.category === "All" || state.category === "More" || restaurantDishes.some((dish) => dish.category === state.category);
            const restaurantText = `${restaurant.name} ${restaurant.cuisine}`.toLocaleLowerCase();
            const queryMatch = !state.query || restaurantText.includes(state.query) || restaurantDishes.some((dish) => `${dish.name} ${dish.category} ${dish.description}`.toLocaleLowerCase().includes(state.query));
            const selectedMatch = !state.restaurantId || restaurant.id === state.restaurantId;
            return categoryMatch && queryMatch && selectedMatch;
        });
        const sort = document.getElementById("restaurant-sort")?.value;
        if (sort === "rating") visible.sort((a, b) => b.rating - a.rating);
        if (sort === "time") visible.sort((a, b) => Number.parseInt(a.time, 10) - Number.parseInt(b.time, 10));
        return visible;
    }

    function renderRestaurants() {
        const grid = document.getElementById("restaurant-grid");
        const visible = getVisibleRestaurants();
        document.getElementById("restaurant-count").textContent = `${visible.length} nearby ${visible.length === 1 ? "kitchen" : "kitchens"} worth knowing.`;
        grid.innerHTML = visible.length ? visible.map((restaurant) => `<article class="restaurant-card" data-restaurant-card="${escapeHtml(restaurant.id)}">
            <a class="restaurant-image-link" href="#popular-dishes" data-browse-restaurant="${escapeHtml(restaurant.id)}" aria-label="Browse ${escapeHtml(restaurant.name)} menu"><img class="restaurant-image" src="${escapeHtml(restaurant.image)}" alt="${escapeHtml(restaurant.alt)}" loading="lazy" decoding="async"><span class="restaurant-offer">${escapeHtml(restaurant.offer)}</span></a>
            <div class="restaurant-info"><div class="restaurant-title-row"><h3>${escapeHtml(restaurant.name)}</h3><span class="restaurant-rating">${icon("star")}${Number(restaurant.rating).toFixed(1)}</span></div><p class="restaurant-cuisine">${escapeHtml(restaurant.cuisine)}</p><div class="restaurant-meta"><span>${icon("clock")}${escapeHtml(restaurant.time)}</span><span>${icon("bike")}${money.format(restaurant.fee)} delivery</span><span>${escapeHtml(restaurant.priceRange)}</span></div><button class="restaurant-open" type="button" data-browse-restaurant="${escapeHtml(restaurant.id)}">Browse menu</button></div>
        </article>`).join("") : '<p class="service-empty">No nearby restaurants match just yet. Try another category or search.</p>';
    }

    function getVisibleDishes() {
        return dishes.filter((dish) => {
            const restaurant = restaurantById(dish.restaurantId);
            const categoryMatch = state.category === "All" || state.category === "More" || dish.category === state.category;
            const queryMatch = !state.query || `${dish.name} ${dish.category} ${dish.description} ${restaurant?.name || ""}`.toLocaleLowerCase().includes(state.query);
            const restaurantMatch = !state.restaurantId || dish.restaurantId === state.restaurantId;
            return categoryMatch && queryMatch && restaurantMatch;
        });
    }

    function renderDishes() {
        const grid = document.getElementById("dish-grid");
        const visible = getVisibleDishes();
        document.getElementById("dish-count").textContent = state.restaurantId
            ? `${visible.length} dishes from ${restaurantById(state.restaurantId)?.name || "this kitchen"}.`
            : state.query ? `${visible.length} good ${visible.length === 1 ? "find" : "finds"} for “${state.query}”.` : "Something delicious for later, or right now.";
        grid.innerHTML = visible.length ? visible.map((dish) => `<article class="food-dish-card">
            <div class="food-dish-image-wrap"><img class="food-dish-image" src="${escapeHtml(dish.image)}" alt="${escapeHtml(dish.alt)}" loading="lazy" decoding="async">${dish.vegetarian ? '<span class="food-veg-mark" role="img" aria-label="Vegetarian"></span>' : ""}</div>
            <div class="food-dish-info"><p class="food-dish-restaurant">${escapeHtml(restaurantById(dish.restaurantId)?.name || "THA ONE kitchen")}</p><button class="food-dish-name" type="button" data-food-detail="${escapeHtml(dish.id)}">${escapeHtml(dish.name)}</button><p>${escapeHtml(dish.description)}</p><div class="food-dish-bottom"><span><span class="food-dish-price">${money.format(dish.price)}</span><span class="food-dish-rating"> · ★ ${Number(dish.rating).toFixed(1)}</span></span><button class="food-add-button" type="button" data-food-add="${escapeHtml(dish.id)}" aria-label="Add ${escapeHtml(dish.name)} to food bag">${icon("plus")}</button></div></div>
        </article>`).join("") : '<p class="service-empty">No dishes match this selection. Try another category or search.</p>';
    }

    function renderCart() {
        const cartItems = document.getElementById("food-cart-items");
        const quantity = state.cart.reduce((total, item) => total + item.quantity, 0);
        const subtotal = state.cart.reduce((total, item) => total + (dishById(item.dishId)?.price || 0) * item.quantity, 0);
        ["food-cart-count", "food-mobile-cart-count"].forEach((id) => {
            const badge = document.getElementById(id);
            if (badge) badge.textContent = String(quantity);
        });
        document.getElementById("food-cart-title-count").textContent = `(${quantity})`;
        document.getElementById("food-cart-subtotal").textContent = money.format(subtotal);
        if (!state.cart.length) {
            cartItems.innerHTML = '<p class="empty-state">Your food bag is empty.</p>';
            return;
        }
        cartItems.innerHTML = state.cart.map((item) => {
            const dish = dishById(item.dishId);
            if (!dish) return "";
            return `<div class="cart-line"><img src="${escapeHtml(dish.image)}" alt="" loading="lazy"><div class="cart-line-info"><span class="cart-line-name">${escapeHtml(dish.name)}</span><span class="cart-line-price">${item.option ? `${escapeHtml(item.option)} · ` : ""}${money.format(dish.price)}</span><div class="quantity-control"><button type="button" data-food-quantity="-1" data-dish-id="${escapeHtml(dish.id)}" data-option="${escapeHtml(item.option || "")}" aria-label="Decrease ${escapeHtml(dish.name)} quantity">${icon("minus")}</button><span>${item.quantity}</span><button type="button" data-food-quantity="1" data-dish-id="${escapeHtml(dish.id)}" data-option="${escapeHtml(item.option || "")}" aria-label="Increase ${escapeHtml(dish.name)} quantity">${icon("plus")}</button></div></div><button class="remove-line" type="button" data-food-remove="${escapeHtml(dish.id)}" data-option="${escapeHtml(item.option || "")}" aria-label="Remove ${escapeHtml(dish.name)}">${icon("close")}</button></div>`;
        }).join("");
    }

    async function addDish(dishId, quantity = 1, option = "") {
        const dish = dishById(dishId);
        if (!dish) return showToast("We couldn’t find that dish.");
        const availability = await window.THA_ONE_LOCATION?.checkAvailability("food", { dishIds: [dishId] });
        if (availability?.available !== true) {
            return showToast(availability?.message || "Currently unavailable at your location.");
        }
        const existing = state.cart.find((item) => item.dishId === dishId && item.option === option);
        if (existing) existing.quantity += quantity;
        else state.cart.push({ dishId, quantity, option });
        persistCart();
        showToast(`${dish.name} added to your food bag`);
    }

    function toggleFoodCart(open) {
        const drawer = document.getElementById("food-cart-drawer");
        const backdrop = document.getElementById("food-cart-backdrop");
        const shouldOpen = typeof open === "boolean" ? open : !drawer.classList.contains("is-open");
        drawer.inert = !shouldOpen;
        drawer.setAttribute("aria-hidden", String(!shouldOpen));
        drawer.classList.toggle("is-open", shouldOpen);
        backdrop.classList.toggle("is-open", shouldOpen);
        document.body.classList.toggle("cart-open", shouldOpen);
        if (shouldOpen) {
            state.lastFocus = document.activeElement;
            drawer.querySelector("[data-food-close-cart]")?.focus();
        } else state.lastFocus?.focus?.();
    }

    function openDish(dishId) {
        const dish = dishById(dishId);
        if (!dish) return;
        state.detailDish = dish;
        const restaurant = restaurantById(dish.restaurantId);
        const dialog = document.getElementById("food-detail-dialog");
        const optionMarkup = (dish.options || []).map((option, index) => `<option value="${escapeHtml(option)}"${index === 0 ? " selected" : ""}>${escapeHtml(option)}</option>`).join("");
        document.getElementById("food-detail-content").innerHTML = `<img class="food-detail-image" src="${escapeHtml(dish.image)}" alt="${escapeHtml(dish.alt)}"><div class="food-detail-content"><div class="service-dialog-heading"><div><p class="food-eyebrow">${escapeHtml(dish.category)} · ${escapeHtml(restaurant?.name || "THA ONE kitchen")}</p><h2 id="food-detail-title">${escapeHtml(dish.name)}</h2><p>${escapeHtml(dish.description)}</p><div class="food-detail-meta"><span>★ ${Number(dish.rating).toFixed(1)}</span><span>${money.format(dish.price)}</span></div></div><button class="dialog-close" type="button" data-food-detail-close aria-label="Close dish details">${icon("close")}</button></div><div class="food-detail-controls"><label>Choose an option<select id="food-option">${optionMarkup}</select></label><label>Quantity<input id="food-quantity" type="number" min="1" max="20" value="1" inputmode="numeric"></label></div><div class="food-detail-actions"><button type="button" id="food-detail-add">Add to food bag · ${money.format(dish.price)}</button><button class="dialog-close" type="button" data-food-detail-close aria-label="Close dish details">${icon("close")}</button></div></div>`;
        dialog.showModal();
    }

    function setCategory(category) {
        state.category = category;
        state.restaurantId = "";
        renderCategories();
        renderRestaurants();
        renderDishes();
        if (window.innerWidth <= 780) {
            document.getElementById("food-category-nav").classList.remove("is-open");
            document.getElementById("food-menu-toggle").setAttribute("aria-expanded", "false");
        }
        document.getElementById("popular-dishes").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function setupSearch() {
        const input = document.getElementById("food-search");
        const form = document.getElementById("food-search-form");
        input.addEventListener("input", () => {
            state.query = input.value.trim().toLocaleLowerCase();
            state.restaurantId = "";
            renderRestaurants();
            renderDishes();
        });
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            state.query = input.value.trim().toLocaleLowerCase();
            state.restaurantId = "";
            renderRestaurants();
            renderDishes();
            document.getElementById("restaurants").scrollIntoView({ behavior: "smooth" });
            input.blur();
        });
    }

    function setupLocation() {
        window.THA_ONE_LOCATION?.bindHeaders();
    }

    function setupOrder() {
        document.getElementById("place-food-order").addEventListener("click", () => {
            if (!state.cart.length) return showToast("Add something to your food bag first.");
            window.location.assign("checkout.html?service=food");
        });
    }

    function init() {
        document.querySelectorAll("[data-current-year]").forEach((node) => { node.textContent = String(new Date().getFullYear()); });
        renderCategories();
        renderRestaurants();
        renderDishes();
        renderCart();
        setupSearch();
        setupLocation();
        setupOrder();

        document.getElementById("food-category-list").addEventListener("click", (event) => {
            const button = event.target.closest("[data-food-category]");
            if (button) setCategory(button.dataset.foodCategory);
        });
        document.getElementById("food-category-tiles").addEventListener("click", (event) => {
            const button = event.target.closest("[data-food-category]");
            if (button) setCategory(button.dataset.foodCategory);
        });
        document.getElementById("food-reset").addEventListener("click", () => {
            state.category = "All";
            state.restaurantId = "";
            state.query = "";
            document.getElementById("food-search").value = "";
            renderCategories();
            renderRestaurants();
            renderDishes();
        });
        document.getElementById("restaurant-sort").addEventListener("change", renderRestaurants);
        document.getElementById("restaurant-grid").addEventListener("click", async (event) => {
            const trigger = event.target.closest("[data-browse-restaurant]");
            if (!trigger) return;
            event.preventDefault();
            const availability = await window.THA_ONE_LOCATION?.checkAvailability("food", { restaurantIds: [trigger.dataset.browseRestaurant] });
            if (availability?.verified === true && availability.available !== true) {
                showToast(availability?.message || "Currently unavailable at your location.");
                return;
            }
            if (availability?.verified !== true) {
                showToast("You can browse the menu; delivery availability will be checked before ordering.");
            }
            state.restaurantId = trigger.dataset.browseRestaurant;
            state.category = "All";
            renderCategories();
            renderRestaurants();
            renderDishes();
            document.getElementById("popular-dishes").scrollIntoView({ behavior: "smooth" });
        });
        document.getElementById("dish-grid").addEventListener("click", (event) => {
            const add = event.target.closest("[data-food-add]");
            const detail = event.target.closest("[data-food-detail]");
            if (add) addDish(add.dataset.foodAdd);
            if (detail) openDish(detail.dataset.foodDetail);
        });
        document.getElementById("food-detail-content").addEventListener("click", (event) => {
            if (event.target.closest("[data-food-detail-close]")) document.getElementById("food-detail-dialog").close();
            if (event.target.closest("#food-detail-add") && state.detailDish) {
                const quantityInput = document.getElementById("food-quantity");
                const quantity = Math.max(1, Math.min(20, Number.parseInt(quantityInput.value, 10) || 1));
                const option = document.getElementById("food-option").value;
                addDish(state.detailDish.id, quantity, option);
                document.getElementById("food-detail-dialog").close();
            }
        });
        document.getElementById("food-cart-open").addEventListener("click", () => toggleFoodCart(true));
        document.getElementById("food-cart-open-mobile").addEventListener("click", () => toggleFoodCart(true));
        document.querySelectorAll("[data-food-close-cart]").forEach((button) => button.addEventListener("click", () => toggleFoodCart(false)));
        document.getElementById("food-cart-items").addEventListener("click", (event) => {
            const quantityButton = event.target.closest("[data-food-quantity]");
            if (quantityButton) {
                const item = state.cart.find((entry) => entry.dishId === quantityButton.dataset.dishId && entry.option === quantityButton.dataset.option);
                if (!item) return;
                item.quantity += Number(quantityButton.dataset.foodQuantity);
                if (item.quantity <= 0) state.cart = state.cart.filter((entry) => entry !== item);
                persistCart();
            }
            const remove = event.target.closest("[data-food-remove]");
            if (remove) {
                state.cart = state.cart.filter((entry) => !(entry.dishId === remove.dataset.foodRemove && entry.option === remove.dataset.option));
                persistCart();
            }
        });
        document.getElementById("food-menu-toggle").addEventListener("click", (event) => {
            const nav = document.getElementById("food-category-nav");
            const expanded = nav.classList.toggle("is-open");
            event.currentTarget.setAttribute("aria-expanded", String(expanded));
        });
        document.querySelector("[data-food-open-categories]").addEventListener("click", () => {
            document.getElementById("food-category-nav").classList.add("is-open");
            document.getElementById("food-menu-toggle").setAttribute("aria-expanded", "true");
            document.getElementById("food-category-nav").scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        document.querySelector("[data-food-focus-search]").addEventListener("click", () => {
            const input = document.getElementById("food-search");
            input.focus();
            input.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        document.getElementById("food-detail-dialog").addEventListener("click", (event) => {
            if (event.target === event.currentTarget) event.currentTarget.close();
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") toggleFoodCart(false);
        });
    }

    init();
})();

(() => {
    "use strict";

    const products = Array.isArray(window.THA_ONE_PRODUCTS) ? window.THA_ONE_PRODUCTS : [];
    const storageKeys = { cart: "tha-one-cart", wishlist: "tha-one-wishlist", recentlyViewed: "tha-one-recently-viewed" };
    const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
    const categories = ["All", "Electronics", "Fashion", "Mobiles", "Beauty", "Home", "Grocery", "Accessories", "Sports", "Offers"];
    const heroBanners = [
        {
            kicker: "The THA ONE edit",
            title: "Good things for your everyday.",
            description: "Small upgrades, thoughtful finds and the pieces you’ll reach for again tomorrow.",
            cta: "Explore the edit",
            href: "#featured",
            image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1800&q=84",
            alt: "A considered edit of clothing and everyday essentials"
        },
        {
            kicker: "A little less ordinary",
            title: "Find your next favourite thing.",
            description: "Good design, useful details and a few surprises for wherever the day takes you.",
            cta: "Shop the collection",
            href: "#featured",
            image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1800&q=84",
            alt: "A thoughtful collection of wardrobe pieces"
        },
        {
            kicker: "Everyday, made better",
            title: "Small finds. Big good energy.",
            description: "Discover useful little upgrades chosen to make the everyday feel a bit more yours.",
            cta: "See what’s new",
            href: "#deals",
            image: "https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?auto=format&fit=crop&w=1800&q=84",
            alt: "A warm, carefully arranged home and lifestyle collection"
        }
    ];

    function readStorage(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return value ?? fallback;
        } catch {
            return fallback;
        }
    }

    function writeStorage(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { showToast("Your browser couldn’t save this change."); }
    }

    const state = {
        cart: Array.isArray(readStorage(storageKeys.cart, [])) ? readStorage(storageKeys.cart, []) : [],
        wishlist: new Set(Array.isArray(readStorage(storageKeys.wishlist, [])) ? readStorage(storageKeys.wishlist, []) : []),
        recentlyViewed: Array.isArray(readStorage(storageKeys.recentlyViewed, [])) ? readStorage(storageKeys.recentlyViewed, []).filter((id) => typeof id === "string") : [],
        category: "All",
        query: "",
        sort: "featured",
        wishlistOnly: false,
        activeProduct: null,
        heroIndex: 0,
        heroTimer: null,
        focusedBeforeCart: null
    };

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    }

    function discountPercent(product) {
        return Math.max(0, Math.round((1 - product.price / product.originalPrice) * 100));
    }

    function productById(id) {
        return products.find((product) => product.id === id);
    }

    function productUrl(product) {
        return `product.html?id=${encodeURIComponent(product.id)}`;
    }

    function icon(name, extraClass = "") {
        return `<svg class="icon ${extraClass}" aria-hidden="true"><use href="#icon-${escapeHtml(name)}"/></svg>`;
    }

    function productCard(product, { compact = false, showDescription = true } = {}) {
        const isSaved = state.wishlist.has(product.id);
        const label = `${isSaved ? "Remove from" : "Add to"} wishlist: ${product.name}`;
        return `<article class="product-card${compact ? " compact-card" : ""}">
            <a class="product-image-link" href="${productUrl(product)}" aria-label="View ${escapeHtml(product.name)}">
                <img class="product-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.alt)}" loading="lazy" decoding="async">
                <span class="product-badge">${escapeHtml(product.badge)}</span>
            </a>
            <button class="wishlist-button${isSaved ? " is-active" : ""}" type="button" data-toggle-wishlist="${escapeHtml(product.id)}" aria-label="${escapeHtml(label)}" aria-pressed="${isSaved}" title="${escapeHtml(isSaved ? "Remove from wishlist" : "Add to wishlist")}">${icon("heart")}</button>
            <div class="product-info">
                <p class="product-category">${escapeHtml(product.category)}</p>
                <a class="product-name" href="${productUrl(product)}">${escapeHtml(product.name)}</a>
                ${showDescription ? `<p class="product-description">${escapeHtml(product.description)}</p>` : ""}
                <div class="product-rating" aria-label="Rated ${product.rating} out of 5"><span class="rating-star" aria-hidden="true">★</span><strong>${Number(product.rating).toFixed(1)}</strong><span class="rating-count">(${Number(product.reviews).toLocaleString("en-IN")})</span></div>
                <div class="product-price-row"><span class="product-price">${money.format(product.price)}</span><span class="product-original">${money.format(product.originalPrice)}</span><span class="product-discount">${discountPercent(product)}% off</span></div>
                <button class="add-button" type="button" data-add-cart="${escapeHtml(product.id)}" aria-label="Add ${escapeHtml(product.name)} to cart">${icon("bag")}<span>Add to bag</span></button>
            </div>
        </article>`;
    }

    function showToast(message) {
        const region = document.getElementById("toast-region");
        if (!region) return;
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.setAttribute("role", "status");
        toast.textContent = message;
        region.append(toast);
        window.setTimeout(() => toast.remove(), 2600);
    }

    function persistCart() {
        writeStorage(storageKeys.cart, state.cart);
        renderCart();
        updateBadges();
    }

    function persistWishlist() {
        writeStorage(storageKeys.wishlist, [...state.wishlist]);
        renderAllProductCards();
        updateBadges();
    }

    async function addToCart(id, quantity = 1, variant = "") {
        const product = productById(id);
        if (!product) return showToast("We couldn’t find that item.");
        const availability = await window.THA_ONE_LOCATION?.checkAvailability("shopping", { productIds: [id] });
        if (availability?.available !== true) {
            return showToast(availability?.message || "Delivery availability could not be confirmed. Try again shortly.");
        }
        const existing = state.cart.find((item) => item.id === id && item.variant === variant);
        if (existing) existing.quantity += quantity;
        else state.cart.push({ id, quantity, variant });
        persistCart();
        showToast(`${product.name} added to your bag`);
    }

    function changeQuantity(id, variant, amount) {
        const item = state.cart.find((entry) => entry.id === id && entry.variant === variant);
        if (!item) return;
        item.quantity += amount;
        if (item.quantity <= 0) state.cart = state.cart.filter((entry) => entry !== item);
        persistCart();
    }

    function toggleWishlist(id) {
        const product = productById(id);
        if (!product) return;
        if (state.wishlist.has(id)) {
            state.wishlist.delete(id);
            showToast(`${product.name} removed from wishlist`);
        } else {
            state.wishlist.add(id);
            showToast(`${product.name} saved to your wishlist`);
        }
        persistWishlist();
        if (state.activeProduct?.id === id) renderProductDetail();
    }

    function updateBadges() {
        const quantity = state.cart.reduce((total, item) => total + item.quantity, 0);
        const cartTotal = money.format(state.cart.reduce((total, item) => {
            const product = productById(item.id);
            return total + (product ? product.price * item.quantity : 0);
        }, 0));
        const wishlistCount = state.wishlist.size;
        ["cart-count", "mobile-cart-count"].forEach((id) => {
            const badge = document.getElementById(id);
            if (badge) badge.textContent = String(quantity);
        });
        const wishBadge = document.getElementById("wishlist-count");
        if (wishBadge) wishBadge.textContent = String(wishlistCount);
        const titleCount = document.getElementById("cart-title-count");
        if (titleCount) titleCount.textContent = `(${quantity})`;
        const subtotal = document.getElementById("cart-subtotal");
        if (subtotal) subtotal.textContent = cartTotal;
    }

    function renderCart() {
        const list = document.getElementById("cart-items");
        if (!list) return;
        if (!state.cart.length) {
            list.innerHTML = '<p class="empty-state">Your bag is waiting for something good.</p>';
            updateBadges();
            return;
        }
        list.innerHTML = state.cart.map((item) => {
            const product = productById(item.id);
            if (!product) return "";
            return `<div class="cart-line">
                <a href="${productUrl(product)}" aria-label="View ${escapeHtml(product.name)}"><img src="${escapeHtml(product.image)}" alt="" loading="lazy"></a>
                <div class="cart-line-info"><a class="cart-line-name" href="${productUrl(product)}">${escapeHtml(product.name)}</a>${item.variant ? `<span class="cart-line-price">${escapeHtml(item.variant)} · </span>` : ""}<span class="cart-line-price">${money.format(product.price)}</span><div class="quantity-control" aria-label="Quantity for ${escapeHtml(product.name)}"><button type="button" data-quantity="-1" data-id="${escapeHtml(item.id)}" data-variant="${escapeHtml(item.variant)}" aria-label="Decrease quantity">${icon("minus")}</button><span>${item.quantity}</span><button type="button" data-quantity="1" data-id="${escapeHtml(item.id)}" data-variant="${escapeHtml(item.variant)}" aria-label="Increase quantity">${icon("plus")}</button></div></div>
                <button class="remove-line" type="button" data-remove-cart="${escapeHtml(item.id)}" data-variant="${escapeHtml(item.variant)}" aria-label="Remove ${escapeHtml(product.name)} from cart">${icon("close")}</button>
            </div>`;
        }).join("");
        updateBadges();
    }

    function renderAllProductCards() {
        if (document.body.dataset.page === "home") {
            renderDeals();
            renderFeatured();
            renderTrending();
            renderRecentlyViewed();
            renderRecommendations();
        } else {
            renderRelatedProducts();
        }
    }

    function renderDeals() {
        const grid = document.getElementById("deal-grid");
        if (!grid) return;
        const deals = products.filter((product) => product.deals).slice(0, 5);
        grid.innerHTML = deals.length ? deals.map((product) => productCard(product, { compact: true, showDescription: false })).join("") : '<p class="empty-state">No deals are available right now. Check back soon.</p>';
    }

    function getVisibleProducts() {
        let result = products.filter((product) => {
            const matchesCategory = state.category === "All" || state.category === "More"
                || (state.category === "Offers" ? product.deals : product.category === state.category);
            const query = state.query.trim().toLocaleLowerCase();
            const matchesQuery = !query || `${product.name} ${product.category} ${product.description}`.toLocaleLowerCase().includes(query);
            const matchesWishlist = !state.wishlistOnly || state.wishlist.has(product.id);
            return matchesCategory && matchesQuery && matchesWishlist;
        });
        if (state.sort === "price-low") result.sort((a, b) => a.price - b.price);
        if (state.sort === "price-high") result.sort((a, b) => b.price - a.price);
        if (state.sort === "rating") result.sort((a, b) => b.rating - a.rating);
        return result;
    }

    function renderCategoryChips() {
        const row = document.getElementById("filter-chip-row");
        if (!row) return;
        row.innerHTML = categories.map((category) => `<button class="filter-chip${state.category === category ? " active" : ""}" type="button" data-chip-category="${escapeHtml(category)}" aria-pressed="${state.category === category}">${escapeHtml(category)}</button>`).join("");
    }

    function renderFeatured() {
        const grid = document.getElementById("featured-grid");
        if (!grid) return;
        const visible = getVisibleProducts();
        const heading = document.getElementById("featured-title");
        const subtitle = document.getElementById("featured-subtitle");
        if (heading) heading.textContent = state.wishlistOnly ? "Your Wishlist" : state.query ? "Search Results" : "Featured Products";
        if (subtitle) subtitle.textContent = state.wishlistOnly
            ? `${visible.length} saved ${visible.length === 1 ? "favourite" : "favourites"}.`
            : state.query ? `Results for “${state.query}” · ${visible.length} ${visible.length === 1 ? "find" : "finds"}.` : "A few good things we think you’ll love.";
        grid.innerHTML = visible.length
            ? visible.map((product) => productCard(product)).join("")
            : `<p class="empty-state">${state.wishlistOnly ? "Your wishlist is empty. Save a few favourites as you browse." : state.query ? "Nothing found just yet. Try a different search." : "No products in this selection right now."}</p>`;
        renderCategoryChips();
        document.querySelectorAll("#category-list [data-category]").forEach((button) => {
            button.classList.toggle("active", button.dataset.category === state.category);
            button.setAttribute("aria-pressed", String(button.dataset.category === state.category));
        });
    }

    function renderTrending() {
        const track = document.getElementById("trending-track");
        if (!track) return;
        const trending = [...products].sort((a, b) => b.reviews - a.reviews).slice(0, 8);
        track.innerHTML = trending.length ? trending.map((product) => productCard(product, { compact: true, showDescription: false })).join("") : '<p class="empty-state">Trending finds will be here soon.</p>';
    }

    function renderRecentlyViewed() {
        const section = document.getElementById("recently-viewed");
        const grid = document.getElementById("recently-grid");
        if (!section || !grid) return;
        const viewed = state.recentlyViewed.map(productById).filter(Boolean).slice(0, 4);
        section.hidden = !viewed.length;
        grid.innerHTML = viewed.map((product) => productCard(product, { showDescription: false })).join("");
    }

    function recordRecentlyViewed(product) {
        if (!product) return;
        state.recentlyViewed = [product.id, ...state.recentlyViewed.filter((id) => id !== product.id)].slice(0, 12);
        writeStorage(storageKeys.recentlyViewed, state.recentlyViewed);
    }

    function renderRecommendations() {
        const section = document.getElementById("recommended");
        const grid = document.getElementById("recommended-grid");
        if (!section || !grid) return;
        const recommendations = products.filter((product) => ["arc-headphones", "daylight-lamp", "daily-serum", "halo-watch"].includes(product.id));
        if (recommendations.length) {
            grid.innerHTML = recommendations.map((product) => productCard(product)).join("");
            section.classList.add("is-visible");
        }
    }

    function renderProductDetail() {
        const container = document.getElementById("product-detail");
        if (!container) return;
        const product = state.activeProduct;
        if (!product) {
            container.innerHTML = '<p class="empty-state">We couldn’t find that product. <a href="home.html#featured">Explore the collection</a>.</p>';
            document.title = "Product not found | THA ONE";
            return;
        }
        const saved = state.wishlist.has(product.id);
        const gallery = (Array.isArray(product.gallery) && product.gallery.length ? product.gallery : [product.image]).filter((image) => typeof image === "string").slice(0, 6);
        const galleryMarkup = `<div class="detail-gallery"><div class="detail-image-wrap"><img class="detail-image" id="detail-gallery-main" src="${escapeHtml(gallery[0] || product.image)}" alt="${escapeHtml(product.alt)}" fetchpriority="high" decoding="async"><span class="product-badge">${escapeHtml(product.badge)}</span><button class="wishlist-button${saved ? " is-active" : ""}" type="button" data-toggle-wishlist="${escapeHtml(product.id)}" aria-label="${saved ? "Remove from" : "Add to"} wishlist: ${escapeHtml(product.name)}" aria-pressed="${saved}">${icon("heart")}</button></div>${gallery.length > 1 ? `<div class="detail-thumbnails" role="group" aria-label="Product images">${gallery.map((image, index) => `<button class="detail-thumbnail${index === 0 ? " active" : ""}" type="button" data-detail-image-index="${index}" data-detail-image="${escapeHtml(image)}" data-detail-alt="${escapeHtml(product.alt)}" aria-label="View image ${index + 1} of ${escapeHtml(product.name)}" aria-pressed="${index === 0}"><img src="${escapeHtml(image)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}</div>`;
        const variantMarkup = product.variants?.length ? `<div class="variant-group"><p class="variant-heading">Choose your option</p><div class="variant-options" role="group" aria-label="Choose a product option">${product.variants.map((variant, index) => `<button class="variant-option${index === 0 ? " is-selected" : ""}" type="button" data-variant="${escapeHtml(variant)}" aria-pressed="${index === 0}">${escapeHtml(variant)}</button>`).join("")}</div></div>` : "";
        const specifications = [["Category", product.category], ["Rating", `${Number(product.rating).toFixed(1)} / 5`], ["Options", (product.variants || []).join(", ") || "Standard"]];
        const detailsMarkup = `<section class="detail-facts" aria-labelledby="detail-specifications-title"><h2 id="detail-specifications-title">Specifications</h2><dl>${specifications.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl><h3>Available offers</h3><ul><li>Free delivery on Shopping orders over ₹999</li><li>Easy 7-day returns on eligible items</li></ul></section>`;
        container.innerHTML = `${galleryMarkup}
            <div class="detail-copy">
                <p class="detail-category"><a href="home.html#featured">${escapeHtml(product.category)}</a> · THA ONE edit</p>
                <h1 class="detail-title">${escapeHtml(product.name)}</h1>
                <div class="detail-review" aria-label="Rated ${product.rating} out of 5"><span class="rating-star" aria-hidden="true">★</span><strong>${Number(product.rating).toFixed(1)}</strong><span>${Number(product.reviews).toLocaleString("en-IN")} thoughtful reviews</span></div>
                <div class="detail-price"><span class="product-price">${money.format(product.price)}</span><span class="product-original">${money.format(product.originalPrice)}</span><span class="product-discount">${discountPercent(product)}% off</span></div>
                <p class="detail-description">${escapeHtml(product.description)}</p>
                ${variantMarkup}
                ${detailsMarkup}
                <div class="detail-buy-row"><div class="detail-quantity" aria-label="Quantity"><button type="button" data-detail-quantity="-1" aria-label="Decrease quantity">${icon("minus")}</button><output id="detail-quantity" aria-live="polite">1</output><button type="button" data-detail-quantity="1" aria-label="Increase quantity">${icon("plus")}</button></div><button class="detail-add" type="button" data-detail-add="${escapeHtml(product.id)}">${icon("bag")}Add to bag</button></div>
                <button class="detail-buy-now" type="button" data-buy-now="${escapeHtml(product.id)}">Buy now</button>
                <div class="detail-policies"><span class="policy-item">${icon("truck")}Free delivery over ₹999</span><span class="policy-item">${icon("refresh")}Easy 7-day returns</span></div>
            </div>`;
        const categoryLabel = document.querySelector(".breadcrumbs span:last-child");
        if (categoryLabel) categoryLabel.textContent = product.name;
        document.title = `${product.name} | THA ONE`;
        const description = document.querySelector('meta[name="description"]');
        if (description) description.content = product.description;
        renderRelatedProducts();
    }

    function renderRelatedProducts() {
        const grid = document.getElementById("related-grid");
        if (!grid) return;
        const related = products.filter((product) => product.id !== state.activeProduct?.id)
            .sort((a, b) => Number(b.category === state.activeProduct?.category) - Number(a.category === state.activeProduct?.category))
            .slice(0, 4);
        grid.innerHTML = related.length ? related.map((product) => productCard(product)).join("") : '<p class="empty-state">More good things are on the way.</p>';
    }

    function openCart() {
        const drawer = document.getElementById("cart-drawer");
        if (!drawer) return;
        state.focusedBeforeCart = document.activeElement;
        drawer.inert = false;
        drawer.setAttribute("aria-hidden", "false");
        drawer.classList.add("is-open");
        document.getElementById("cart-backdrop").classList.add("is-open");
        document.body.classList.add("cart-open");
        drawer.querySelector("[data-close-cart]")?.focus();
    }

    function closeCart() {
        const drawer = document.getElementById("cart-drawer");
        if (!drawer) return;
        drawer.classList.remove("is-open");
        document.getElementById("cart-backdrop").classList.remove("is-open");
        drawer.setAttribute("aria-hidden", "true");
        drawer.inert = true;
        document.body.classList.remove("cart-open");
        state.focusedBeforeCart?.focus?.();
    }

    function openWishlist() {
        if (document.body.dataset.page !== "home") {
            window.location.assign("home.html?wishlist=1#featured");
            return;
        }
        state.query = "";
        state.category = "All";
        state.wishlistOnly = true;
        renderFeatured();
        document.getElementById("featured")?.scrollIntoView({ behavior: "smooth" });
    }

    function setCategory(category) {
        state.category = categories.includes(category) ? category : "All";
        state.wishlistOnly = false;
        renderFeatured();
        if (window.innerWidth <= 780) {
            const nav = document.getElementById("category-nav");
            nav?.classList.remove("is-open");
            document.getElementById("menu-toggle")?.setAttribute("aria-expanded", "false");
        }
        document.getElementById("featured")?.scrollIntoView({ behavior: "smooth" });
    }

    function applySearch(query, shouldScroll = false) {
        state.query = query.trim();
        if (state.query) state.category = "All";
        state.wishlistOnly = false;
        const input = document.getElementById("product-search");
        if (input && input.value !== query) input.value = query;
        renderFeatured();
        if (shouldScroll) document.getElementById("featured")?.scrollIntoView({ behavior: "smooth" });
    }

    function setupSearch() {
        const form = document.getElementById("search-form");
        const input = document.getElementById("product-search");
        if (!form || !input) return;
        const params = new URLSearchParams(window.location.search);
        if (document.body.dataset.page === "home" && params.get("q")) applySearch(params.get("q"));
        if (document.body.dataset.page === "home" && params.get("wishlist") === "1") {
            state.wishlistOnly = true;
            renderFeatured();
        }
        if (document.body.dataset.page === "home") input.addEventListener("input", () => applySearch(input.value));
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            if (document.body.dataset.page === "home") {
                applySearch(input.value, true);
                input.blur();
            } else {
                const query = input.value.trim();
                window.location.assign(`home.html${query ? `?q=${encodeURIComponent(query)}` : ""}#featured`);
            }
        });
    }

    function setupHero() {
        const hero = document.getElementById("hero");
        const dots = document.getElementById("hero-dots");
        if (!hero || !dots) return;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        dots.innerHTML = heroBanners.map((banner, index) => `<button class="hero-dot${index === 0 ? " active" : ""}" type="button" data-hero-index="${index}" aria-label="Show banner ${index + 1}: ${escapeHtml(banner.title)}" aria-pressed="${index === 0}"></button>`).join("");
        const showBanner = (index) => {
            state.heroIndex = (index + heroBanners.length) % heroBanners.length;
            const banner = heroBanners[state.heroIndex];
            const image = document.getElementById("hero-image");
            image.src = banner.image;
            image.alt = banner.alt;
            document.getElementById("hero-kicker").textContent = banner.kicker;
            document.getElementById("hero-title").textContent = banner.title;
            document.getElementById("hero-description").textContent = banner.description;
            const cta = document.getElementById("hero-cta");
            cta.href = banner.href;
            cta.querySelector("span").textContent = banner.cta;
            dots.querySelectorAll(".hero-dot").forEach((dot, dotIndex) => {
                const active = dotIndex === state.heroIndex;
                dot.classList.toggle("active", active);
                dot.setAttribute("aria-pressed", String(active));
            });
        };
        const stop = () => { if (state.heroTimer) window.clearInterval(state.heroTimer); state.heroTimer = null; };
        const start = () => {
            stop();
            if (!reducedMotion) state.heroTimer = window.setInterval(() => showBanner(state.heroIndex + 1), 6500);
        };
        document.getElementById("hero-previous").addEventListener("click", () => { showBanner(state.heroIndex - 1); start(); });
        document.getElementById("hero-next").addEventListener("click", () => { showBanner(state.heroIndex + 1); start(); });
        dots.addEventListener("click", (event) => {
            const button = event.target.closest("[data-hero-index]");
            if (button) { showBanner(Number(button.dataset.heroIndex)); start(); }
        });
        hero.addEventListener("mouseenter", stop);
        hero.addEventListener("mouseleave", start);
        hero.addEventListener("focusin", stop);
        hero.addEventListener("focusout", (event) => { if (!hero.contains(event.relatedTarget)) start(); });
        document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
        start();
    }

    function setupDealTimer() {
        const update = () => {
            const now = new Date();
            const end = new Date(now);
            end.setHours(24, 0, 0, 0);
            const remaining = Math.max(0, Math.floor((end - now) / 1000));
            const hours = String(Math.floor(remaining / 3600)).padStart(2, "0");
            const minutes = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
            const seconds = String(remaining % 60).padStart(2, "0");
            const hourNode = document.getElementById("timer-hours");
            if (!hourNode) return;
            hourNode.textContent = hours;
            document.getElementById("timer-minutes").textContent = minutes;
            document.getElementById("timer-seconds").textContent = seconds;
        };
        update();
        window.setInterval(update, 1000);
    }

    function setupLocation() {
        window.THA_ONE_LOCATION?.bindHeaders();
    }

    function setupCartControls() {
        document.querySelectorAll("[data-open-cart]").forEach((button) => button.addEventListener("click", openCart));
        document.querySelectorAll("[data-close-cart]").forEach((button) => button.addEventListener("click", closeCart));
        document.querySelectorAll("[data-open-wishlist]").forEach((button) => button.addEventListener("click", openWishlist));
        document.getElementById("cart-items")?.addEventListener("click", (event) => {
            const quantity = event.target.closest("[data-quantity]");
            if (quantity) changeQuantity(quantity.dataset.id, quantity.dataset.variant || "", Number(quantity.dataset.quantity));
            const remove = event.target.closest("[data-remove-cart]");
            if (remove) {
                state.cart = state.cart.filter((item) => !(item.id === remove.dataset.removeCart && item.variant === (remove.dataset.variant || "")));
                persistCart();
            }
        });
        document.getElementById("checkout-button")?.addEventListener("click", () => {
            if (!state.cart.length) return showToast("Add something to your bag first.");
            window.location.assign("checkout.html?service=shopping");
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") closeCart();
            const drawer = document.getElementById("cart-drawer");
            if (event.key !== "Tab" || !drawer?.classList.contains("is-open")) return;
            const focusable = [...drawer.querySelectorAll("button:not(:disabled), a[href]")];
            if (!focusable.length) return;
            if (event.shiftKey && document.activeElement === focusable[0]) {
                event.preventDefault();
                focusable.at(-1).focus();
            } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
                event.preventDefault();
                focusable[0].focus();
            }
        });
        renderCart();
    }

    function setupMobileNavigation() {
        const menu = document.getElementById("menu-toggle");
        const categoriesNav = document.getElementById("category-nav");
        menu?.addEventListener("click", () => {
            const open = categoriesNav.classList.toggle("is-open");
            menu.setAttribute("aria-expanded", String(open));
            menu.setAttribute("aria-label", open ? "Close categories" : "Open categories");
        });
        document.querySelectorAll("[data-open-categories]").forEach((button) => button.addEventListener("click", () => {
            categoriesNav?.classList.add("is-open");
            menu?.setAttribute("aria-expanded", "true");
            categoriesNav?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }));
        document.querySelectorAll("[data-focus-search]").forEach((button) => button.addEventListener("click", () => {
            const input = document.getElementById("product-search");
            input?.focus();
            input?.scrollIntoView({ behavior: "smooth", block: "center" });
        }));
    }

    function setupHome() {
        renderDeals();
        renderFeatured();
        renderTrending();
        renderRecentlyViewed();
        renderRecommendations();
        setupHero();
        setupDealTimer();
        setupSearch();
        document.getElementById("sort-products")?.addEventListener("change", (event) => {
            state.sort = event.currentTarget.value;
            renderFeatured();
        });
        document.getElementById("category-list")?.addEventListener("click", (event) => {
            const button = event.target.closest("[data-category]");
            if (button) setCategory(button.dataset.category);
        });
        document.getElementById("filter-chip-row")?.addEventListener("click", (event) => {
            const button = event.target.closest("[data-chip-category]");
            if (button) setCategory(button.dataset.chipCategory);
        });
        document.querySelectorAll("[data-scroll-trending]").forEach((button) => button.addEventListener("click", () => {
            const track = document.getElementById("trending-track");
            track.scrollBy({ left: button.dataset.scrollTrending === "right" ? track.clientWidth * .75 : -track.clientWidth * .75, behavior: "smooth" });
        }));
    }

    function setupProductPage() {
        const id = new URLSearchParams(window.location.search).get("id");
        state.activeProduct = productById(id);
        recordRecentlyViewed(state.activeProduct);
        renderProductDetail();
        setupSearch();
        document.getElementById("product-detail")?.addEventListener("click", (event) => {
            const galleryButton = event.target.closest("[data-detail-image-index]");
            if (galleryButton) {
                const mainImage = document.getElementById("detail-gallery-main");
                mainImage.src = galleryButton.dataset.detailImage;
                mainImage.alt = galleryButton.dataset.detailAlt;
                document.querySelectorAll(".detail-thumbnail").forEach((thumbnail) => {
                    const selected = thumbnail === galleryButton;
                    thumbnail.classList.toggle("active", selected);
                    thumbnail.setAttribute("aria-pressed", String(selected));
                });
            }
            const variant = event.target.closest("[data-variant]");
            if (variant) {
                document.querySelectorAll("#product-detail .variant-option").forEach((option) => {
                    const selected = option === variant;
                    option.classList.toggle("is-selected", selected);
                    option.setAttribute("aria-pressed", String(selected));
                });
            }
            const quantity = event.target.closest("[data-detail-quantity]");
            if (quantity) {
                const output = document.getElementById("detail-quantity");
                output.value = String(Math.max(1, Number(output.value || output.textContent) + Number(quantity.dataset.detailQuantity)));
                output.textContent = output.value;
            }
            const addButton = event.target.closest("[data-detail-add]");
            const buyNow = event.target.closest("[data-buy-now]");
            if (addButton || buyNow) {
                const productId = (addButton || buyNow).dataset.detailAdd || (addButton || buyNow).dataset.buyNow;
                const selectedVariant = document.querySelector("#product-detail .variant-option.is-selected")?.dataset.variant || "";
                addToCart(productId, Number(document.getElementById("detail-quantity")?.value || 1), selectedVariant);
                if (buyNow) {
                    window.location.assign("checkout.html?service=shopping");
                }
            }
        });
    }

    function setupDelegatedActions() {
        document.addEventListener("click", (event) => {
            const add = event.target.closest("[data-add-cart]");
            if (add) addToCart(add.dataset.addCart);
            const wishlist = event.target.closest("[data-toggle-wishlist]");
            if (wishlist) toggleWishlist(wishlist.dataset.toggleWishlist);
        });
        document.addEventListener("error", (event) => {
            if (!(event.target instanceof HTMLImageElement)) return;
            event.target.classList.add("image-unavailable");
            event.target.alt = event.target.alt || "Product image unavailable";
        }, true);
    }

    function initialize() {
        document.getElementById("copyright-year")?.replaceChildren(String(new Date().getFullYear()));
        if (!products.length) {
            document.querySelectorAll("#featured-grid, #deal-grid, #trending-track").forEach((grid) => {
                grid.innerHTML = '<p class="empty-state">We couldn’t load the collection just now. Please refresh and try again.</p>';
            });
        }
        setupCartControls();
        setupLocation();
        setupMobileNavigation();
        setupDelegatedActions();
        if (document.body.dataset.page === "home") setupHome();
        if (document.body.dataset.page === "product") setupProductPage();
        updateBadges();
    }

    initialize();
})();

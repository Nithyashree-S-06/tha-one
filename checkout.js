(() => {
    "use strict";

    const params = new URLSearchParams(location.search);
    const service = params.get("service") === "food" ? "food" : "shopping";
    const config = window.THA_ONE_CONFIG || {};
    const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
    const products = window.THA_ONE_PRODUCTS || [];
    const foodCatalog = window.THA_ONE_FOOD || { dishes: [], restaurants: [] };
    const cartKey = service === "food" ? "tha-one-food-cart" : "tha-one-cart";
    const state = { items: readCart(), addresses: [], selectedAddress: null, address: null, step: "address", customerReady: false, quote: null };

    function readCart() {
        try {
            const parsed = JSON.parse(localStorage.getItem(cartKey) || "[]");
            return Array.isArray(parsed) ? parsed.filter((item) => item && Number(item.quantity) > 0) : [];
        } catch { return []; }
    }

    function productFor(item) {
        return service === "food"
            ? foodCatalog.dishes.find((dish) => dish.id === item.dishId)
            : products.find((product) => product.id === item.id);
    }

    function setStatus(message, kind = "info") {
        const status = document.getElementById("checkout-status");
        status.className = `checkout-status ${kind}`;
        status.textContent = message;
    }

    function renderCart() {
        const container = document.getElementById("checkout-cart-items");
        if (!state.items.length) {
            container.innerHTML = '<div class="checkout-empty"><strong>Your bag is empty.</strong><a href="home.html">Continue Shopping</a></div>';
            document.getElementById("checkout-place-order").disabled = true;
            return;
        }
        const lines = state.items.map((item) => {
            const product = productFor(item);
            if (!product) return "";
            const name = product.name || "Item";
            return `<div class="checkout-cart-line"><img src="${escapeHtml(product.image)}" alt=""><div><strong>${escapeHtml(name)}</strong><small>${item.option ? `${escapeHtml(item.option)} · ` : item.variant ? `${escapeHtml(item.variant)} · ` : ""}Qty ${Number(item.quantity)}</small></div><b>${money.format((Number(product.price) || 0) * Number(item.quantity))}</b></div>`;
        }).join("");
        container.innerHTML = lines || '<div class="checkout-empty">One or more cart items are no longer available. Return to the service and refresh your bag.</div>';
        const subtotal = state.items.reduce((sum, item) => sum + (Number(productFor(item)?.price) || 0) * Number(item.quantity), 0);
        document.getElementById("checkout-subtotal").textContent = money.format(subtotal);
        document.getElementById("checkout-grand-total").textContent = state.quote?.total ? money.format(state.quote.total) : "Calculated at checkout";
        document.getElementById("checkout-delivery").textContent = state.quote ? money.format(state.quote.deliveryFee || 0) : "Calculated at checkout";
        document.getElementById("checkout-discount").textContent = state.quote ? `−${money.format(state.quote.discount || 0)}` : "Applied at checkout";
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    }

    function setStep(name) {
        state.step = name;
        document.querySelectorAll("[data-checkout-step]").forEach((section) => {
            const active = section.dataset.checkoutStep === name;
            section.hidden = !active;
            section.classList.toggle("active", active);
        });
        document.querySelectorAll("[data-checkout-progress]").forEach((indicator) => {
            const order = ["address", "payment", "review"];
            const currentIndex = order.indexOf(name);
            const index = order.indexOf(indicator.dataset.checkoutProgress);
            indicator.classList.toggle("active", index === currentIndex);
            indicator.classList.toggle("complete", index < currentIndex);
        });
        document.querySelector(".checkout-page-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function currentAddress() {
        return {
            recipientName: document.getElementById("checkout-recipient").value.trim(),
            phone: document.getElementById("checkout-phone").value.trim(),
            line1: document.getElementById("checkout-address-line").value.trim(),
            city: document.getElementById("checkout-city").value.trim(),
            state: document.getElementById("checkout-state").value.trim(),
            pincode: document.getElementById("checkout-pincode").value.trim()
        };
    }

    function fillAddress(address) {
        state.selectedAddress = address.id || null;
        document.getElementById("checkout-recipient").value = address.recipientName || "";
        document.getElementById("checkout-phone").value = address.phone || "";
        document.getElementById("checkout-address-line").value = address.line1 || "";
        document.getElementById("checkout-city").value = address.city || "";
        document.getElementById("checkout-state").value = address.state || "";
        document.getElementById("checkout-pincode").value = address.pincode || "";
        renderSavedAddresses();
    }

    function renderSavedAddresses() {
        const container = document.getElementById("saved-addresses");
        container.replaceChildren();
        state.addresses.forEach((address) => {
            const label = document.createElement("label");
            label.className = "saved-address-option";
            const input = document.createElement("input");
            input.type = "radio";
            input.name = "saved-address";
            input.checked = state.selectedAddress === address.id;
            input.addEventListener("change", () => fillAddress(address));
            const copy = document.createElement("span");
            const title = document.createElement("strong");
            title.textContent = address.label || "Saved address";
            const summary = document.createElement("small");
            summary.textContent = [address.line1, address.city, address.state, address.pincode].filter(Boolean).join(", ");
            copy.append(title, summary);
            label.append(input, copy);
            container.append(label);
        });
    }

    async function loadCustomerData() {
        try {
            const profile = await window.THA_ONE_API.request("profileEndpoint");
            if (profile.authenticated !== true) throw new Error("Sign in to continue checkout.");
            state.customerReady = true;
            const recipient = profile.profile || {};
            document.getElementById("checkout-recipient").value = recipient.fullName || "";
            document.getElementById("checkout-phone").value = recipient.mobile || "";
        } catch (error) {
            setStatus(error.message || "Sign in to continue checkout.", "warning");
            document.getElementById("checkout-place-order").disabled = true;
            return;
        }

        try {
            const response = await window.THA_ONE_API.request("addressesEndpoint");
            state.addresses = Array.isArray(response.addresses) ? response.addresses : [];
            renderSavedAddresses();
            const defaultAddress = state.addresses.find((address) => address.isDefault) || state.addresses[0];
            if (defaultAddress) fillAddress(defaultAddress);
        } catch {
            setStatus("Saved addresses couldn’t be loaded. You can enter an address for this checkout.", "warning");
        }

        const placeButton = document.getElementById("checkout-place-order");
        placeButton.disabled = !state.items.length;
        placeButton.textContent = "Place order securely";
        setStatus("Your address and order are processed securely with your THA ONE shared session.", "info");
    }

    async function updateQuote() {
        const endpoint = service === "food" ? "foodQuoteEndpoint" : "shoppingQuoteEndpoint";
        if (!state.customerReady) return;
        try {
            const quote = await window.THA_ONE_API.request(endpoint, { method: "POST", body: { items: state.items, address: currentAddress() } });
            state.quote = quote.quote || quote || null;
            renderCart();
        } catch {
            state.quote = null;
            renderCart();
            setStatus("Delivery, taxes and discounts will be calculated at order placement.", "warning");
        }
    }

    function renderReview() {
        const address = currentAddress();
        document.getElementById("checkout-review-address").textContent = `${address.recipientName} · ${address.phone} · ${address.line1}, ${address.city}, ${address.state} ${address.pincode}`;
        document.getElementById("checkout-review-items").replaceChildren(...state.items.map((item) => {
            const product = productFor(item);
            const row = document.createElement("div");
            row.className = "checkout-review-line";
            const label = document.createElement("span");
            label.textContent = `${product?.name || "Unavailable item"}${item.option ? ` · ${item.option}` : item.variant ? ` · ${item.variant}` : ""} × ${item.quantity}`;
            const amount = document.createElement("strong");
            amount.textContent = money.format((Number(product?.price) || 0) * Number(item.quantity));
            row.append(label, amount);
            return row;
        }));
        const placeButton = document.getElementById("checkout-place-order");
        placeButton.disabled = !state.customerReady || !state.items.length;
        placeButton.textContent = "Place order securely";
    }

    async function placeOrder() {
        const endpoint = service === "food" ? "foodCheckoutEndpoint" : "shoppingCheckoutEndpoint";
        const button = document.getElementById("checkout-place-order");
        const payload = {
            service,
            items: state.items.map((item) => service === "food"
                ? { itemId: item.dishId, quantity: item.quantity, option: item.option || "" }
                : { productId: item.id, quantity: item.quantity, variant: item.variant || "" }),
            address: currentAddress(),
            paymentMethod: document.querySelector('input[name="payment-method"]:checked')?.value || "upi"
        };
        button.disabled = true;
        button.textContent = "Connecting securely…";
        try {
            const result = await window.THA_ONE_API.request(endpoint, { method: "POST", body: payload });
            if (typeof result.paymentUrl === "string") {
                const paymentUrl = window.THA_ONE_API.safeRedirect(result.paymentUrl);
                if (!paymentUrl) throw new Error("The payment service returned an invalid redirect.");
                clearCart();
                window.location.assign(paymentUrl.href);
                return;
            }
            if (typeof result.orderId !== "string") throw new Error("Checkout did not return a valid order reference.");
            clearCart();
            window.location.assign(`order-tracking.html?service=${service}&id=${encodeURIComponent(result.orderId)}`);
        } catch (error) {
            setStatus(error.message || "Checkout could not be completed. Your cart is unchanged.", "error");
            button.disabled = false;
            button.textContent = "Place order securely";
        } finally {
            Object.keys(payload.address).forEach((key) => { payload.address[key] = ""; });
        }
    }

    function clearCart() {
        try { localStorage.removeItem(service === "food" ? "tha-one-food-cart" : "tha-one-cart"); } catch { /* The server order remains authoritative. */ }
    }

    function init() {
        const isFood = service === "food";
        document.body.dataset.checkout = service;
        document.getElementById("checkout-service-name").textContent = isFood ? "Food checkout" : "Shopping checkout";
        document.getElementById("checkout-footer-brand").textContent = isFood ? "THA ONE Food · Secure provider handoff" : "THA ONE Shopping · Secure provider handoff";
        document.getElementById("checkout-return-link").href = isFood ? "food.html" : "home.html";
        document.getElementById("continue-shopping").href = isFood ? "food.html" : "home.html";
        const switcher = document.querySelector("tha-app-switcher");
        switcher?.setAttribute("current", isFood ? "food" : "shopping");
        document.getElementById("checkout-service-name").textContent = isFood ? "Food checkout" : "Shopping checkout";
        document.querySelector("#cod-option").hidden = isFood;
        renderCart();
        loadCustomerData();
        document.querySelectorAll("[data-checkout-next]").forEach((button) => button.addEventListener("click", () => {
            if (button.dataset.checkoutNext === "payment") {
                const form = document.getElementById("checkout-address-form");
                const invalid = [...form.querySelectorAll("input,textarea")].find((field) => !field.checkValidity());
                if (invalid) { invalid.reportValidity(); invalid.focus(); return; }
                state.address = currentAddress();
                updateQuote();
            }
            if (button.dataset.checkoutNext === "review") renderReview();
            setStep(button.dataset.checkoutNext);
        }));
        document.querySelectorAll("[data-checkout-back]").forEach((button) => button.addEventListener("click", () => setStep(button.dataset.checkoutBack)));
        document.getElementById("checkout-place-order").addEventListener("click", placeOrder);
    }

    init();
})();

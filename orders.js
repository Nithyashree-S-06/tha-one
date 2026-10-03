(() => {
    "use strict";

    const endpoint = window.THA_ONE_CONFIG?.ordersEndpoint || "";
    const states = { filter: "all", sort: "newest", orders: [], loading: false, error: "" };

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    }

    function money(value) {
        return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value) || 0);
    }

    function orderStatus(order) {
        const value = String(order.status || "").toLowerCase();
        if (["delivered", "complete", "completed"].includes(value)) return "delivered";
        if (["cancelled", "canceled", "refunded"].includes(value)) return "cancelled";
        return "active";
    }

    function visibleOrders() {
        let orders = states.orders.filter((order) => states.filter === "all" || orderStatus(order) === states.filter);
        orders = [...orders].sort((a, b) => {
            const left = new Date(a.createdAt || a.date || 0).getTime();
            const right = new Date(b.createdAt || b.date || 0).getTime();
            return states.sort === "newest" ? right - left : left - right;
        });
        return orders;
    }

    function render() {
        const list = document.getElementById("orders-list");
        if (states.loading) {
            list.innerHTML = '<div class="orders-loading"><span></span><p>Loading your orders…</p></div>';
            return;
        }
        if (states.error) {
            list.innerHTML = `<div class="orders-state"><span class="orders-state-icon">!</span><h2>We couldn’t load your orders.</h2><p>${escapeHtml(states.error)}</p><button class="orders-retry" type="button" id="orders-retry">Try again</button></div>`;
            document.getElementById("orders-retry").addEventListener("click", loadOrders);
            return;
        }
        const orders = visibleOrders();
        if (!orders.length) {
            const title = states.filter === "all" ? "Your next order starts here." : "Nothing in this order view yet.";
            const message = states.filter === "all"
                ? "Shopping orders will appear here once checkout is connected and you place an order. Your account session will carry across THA ONE services."
                : "When an order matches this view, you’ll find its status and delivery updates here.";
            list.innerHTML = `<div class="orders-state"><span class="orders-state-icon">${states.filter === "delivered" ? "✓" : "T"}</span><h2>${title}</h2><p>${message}</p><a href="home.html">Explore Shopping <span aria-hidden="true">→</span></a></div>`;
            return;
        }
        list.innerHTML = orders.map((order) => {
            const status = orderStatus(order);
            const items = Array.isArray(order.items) ? order.items : [];
            const itemNames = items.map((item) => typeof item === "string" ? item : `${item.name || item.productName || "Item"}${item.quantity > 1 ? ` × ${item.quantity}` : ""}`);
            const progress = ["Confirmed", "Preparing", "On the way", "Delivered"];
            const current = status === "delivered" ? 3 : Math.max(0, Number(order.progressIndex || 1));
            const progressMarkup = status === "cancelled" ? `<p class="order-cancel-note">This order was ${escapeHtml(order.status)}.</p>` : `<div class="order-progress" aria-label="Order progress">${progress.map((step, index) => `<span class="order-progress-step${index <= current ? " complete" : ""}"><i aria-hidden="true">${index < current ? "✓" : index + 1}</i><b>${step}</b></span>`).join("")}</div>`;
            return `<article class="order-card"><header class="order-card-head"><div><p class="order-number">Order ${escapeHtml(order.orderNumber || order.id || "")}</p><p class="order-date">Placed ${escapeHtml(order.createdAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(order.createdAt)) : order.date || "recently")}</p></div><span class="order-status-pill ${status}">${escapeHtml(order.status || "Processing")}</span></header><div class="order-card-summary"><div><strong>${money(order.total ?? order.amount)}</strong><span>${itemNames.length || order.itemCount || 1} ${itemNames.length === 1 ? "item" : "items"}</span></div><span>${escapeHtml(order.estimatedDelivery || "Delivery updates from your order service")}</span></div>${progressMarkup}${itemNames.length ? `<details class="order-item-details"><summary>View items</summary><ul>${itemNames.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>` : ""}</article>`;
        }).join("");
    }

    async function loadOrders() {
        if (!endpoint) {
            states.loading = false;
            states.error = "";
            render();
            return;
        }
        states.loading = true;
        states.error = "";
        render();
        try {
            const response = await fetch(endpoint, { credentials: "include", headers: { Accept: "application/json" } });
            if (!response.ok) throw new Error(response.status === 401 ? "Sign in to view your order history." : "Please try again in a moment.");
            const result = await response.json();
            if (!Array.isArray(result.orders)) throw new Error("The orders service returned an unexpected response.");
            states.orders = result.orders;
        } catch (error) {
            states.error = error.message || "Please try again in a moment.";
        } finally {
            states.loading = false;
            render();
        }
    }

    document.querySelectorAll("[data-order-filter]").forEach((button) => button.addEventListener("click", () => {
        states.filter = button.dataset.orderFilter;
        document.querySelectorAll("[data-order-filter]").forEach((tab) => {
            const active = tab === button;
            tab.classList.toggle("active", active);
            tab.setAttribute("aria-pressed", String(active));
        });
        render();
    }));
    document.getElementById("orders-sort").addEventListener("change", (event) => {
        states.sort = event.currentTarget.value;
        render();
    });
    loadOrders();
})();

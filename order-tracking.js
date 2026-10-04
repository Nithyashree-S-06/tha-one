(() => {
    "use strict";

    const params = new URLSearchParams(location.search);
    const service = params.get("service") === "food" ? "food" : "shopping";
    const orderId = params.get("id");
    const steps = service === "food"
        ? ["Order placed", "Restaurant accepted", "Preparing", "Ready for pickup", "Partner assigned", "Picked up", "Out for delivery", "Delivered"]
        : ["Order placed", "Confirmed", "Preparing", "On the way", "Delivered"];
    const card = document.getElementById("tracking-card");

    function node(tag, className, value) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        element.textContent = String(value ?? "");
        return element;
    }

    function showMessage(title, message, retry = false) {
        const content = document.createElement("div");
        content.className = "orders-state";
        content.append(node("span", "orders-state-icon", "i"), node("h2", "", title), node("p", "", message));
        if (retry) {
            const button = node("button", "orders-retry", "Try again");
            button.type = "button";
            button.addEventListener("click", loadStatus);
            content.append(button);
        }
        card.replaceChildren(content);
    }

    function normalizedStatus(value) {
        return String(value || "").toLowerCase().replace(/[ _-]+/g, "");
    }

    function renderOrder(order) {
        const current = normalizedStatus(order.status);
        const done = current === "delivered" || current === "complete" || current === "completed";
        const cancelled = current === "cancelled" || current === "canceled" || current === "failed";
        const statusToStep = service === "food"
            ? { placed: 0, orderplaced: 0, accepted: 1, restaurantaccepted: 1, preparing: 2, readyforpickup: 3, partnerassigned: 4, deliverypartnerassigned: 4, pickedup: 5, outfordelivery: 6, delivered: 7 }
            : { placed: 0, orderplaced: 0, confirmed: 1, preparing: 2, shipped: 3, ontheway: 3, outfordelivery: 3, delivered: 4 };
        const activeStep = statusToStep[current] ?? 0;
        const content = document.createElement("div");
        content.className = "tracking-order-content";
        const header = document.createElement("header");
        header.className = "tracking-order-header";
        const title = node("h1", "", `Order ${safe(order.orderNumber || order.id || orderId, 80)}`);
        const status = node("span", `order-status-pill ${cancelled ? "cancelled" : done ? "delivered" : ""}`, safe(order.status || "Status unavailable", 40));
        header.append(title, status);
        content.append(header);
        if (order.estimatedDelivery) content.append(node("p", "tracking-estimate", `Estimated delivery: ${safe(order.estimatedDelivery, 100)}`));
        if (cancelled) {
            content.append(node("p", "order-cancel-note", "This order is not moving through delivery. Contact support for help."));
        } else {
            const progress = document.createElement("ol");
            progress.className = `tracking-progress${service === "food" ? " food-progress" : ""}`;
            progress.setAttribute("aria-label", `${service === "food" ? "Food" : "Shopping"} order progress`);
            steps.forEach((label, index) => {
                const item = document.createElement("li");
                if (index < activeStep) item.classList.add("complete");
                if (index === activeStep) { item.classList.add("current"); item.setAttribute("aria-current", "step"); }
                item.append(node("span", "tracking-progress-dot", index < activeStep ? "✓" : String(index + 1)), node("span", "tracking-progress-label", label));
                progress.append(item);
            });
            content.append(progress);
        }
        const details = document.createElement("div");
        details.className = "tracking-order-details";
        if (Array.isArray(order.items)) {
            const itemCount = order.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 1), 0);
            details.append(node("span", "", `${itemCount} ${itemCount === 1 ? "item" : "items"}`));
        }
        if (Number.isFinite(Number(order.total))) details.append(node("strong", "", new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(order.total))));
        content.append(details);
        card.replaceChildren(content);
    }

    function safe(value, maxLength) {
        return typeof value === "string" && value.length <= maxLength ? value : "";
    }

    async function loadStatus() {
        if (!orderId) {
            // Find most recent order if no query id
            const defaultOrder = window.THA_ONE_CORE?.getOrders(service)?.[0];
            if (defaultOrder) {
                renderOrder(defaultOrder);
                return;
            }
            return showMessage("Order reference missing", "Open tracking from your order history so we can find the right order.");
        }
        card.innerHTML = '<div class="orders-loading"><span></span><p>Loading secure order updates…</p></div>';
        try {
            const result = await window.THA_ONE_API.request("orderStatusEndpoint", { query: { service, id: orderId } });
            if (!result.order || typeof result.order !== "object") {
                // If not found by exact id, check core
                const found = window.THA_ONE_CORE?.getOrderById(orderId);
                if (found) {
                    renderOrder(found);
                    return;
                }
                throw new Error("We couldn’t find an order with reference " + orderId);
            }
            renderOrder(result.order);
        } catch (error) {
            showMessage("Order status unavailable", error.message || "Please try again in a moment.", true);
        }
    }

    document.getElementById("tracking-service-name").textContent = service === "food" ? "Food order tracking" : "Shopping order tracking";
    document.getElementById("tracking-back-link").href = service === "food" ? "food.html" : "orders.html";
    document.getElementById("tracking-back-link").textContent = service === "food" ? "Return to Food" : "My orders";
    document.getElementById("tracking-refresh").addEventListener("click", loadStatus);

    // Add status advancement simulation button
    const refreshBtn = document.getElementById("tracking-refresh");
    if (refreshBtn && !document.getElementById("simulate-progress-btn")) {
        const simBtn = document.createElement("button");
        simBtn.id = "simulate-progress-btn";
        simBtn.type = "button";
        simBtn.className = "service-button";
        simBtn.style.marginLeft = "10px";
        simBtn.textContent = "⚡ Simulate Next Delivery Step";
        simBtn.addEventListener("click", () => {
            if (window.THA_ONE_CORE) {
                const targetId = orderId || window.THA_ONE_CORE.getOrders(service)?.[0]?.id;
                const updated = window.THA_ONE_CORE.advanceOrderStatus(targetId);
                if (updated) renderOrder(updated);
            }
        });
        refreshBtn.parentElement.appendChild(simBtn);
    }

    loadStatus();
})();

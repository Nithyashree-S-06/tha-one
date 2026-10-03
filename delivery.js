(() => {
    "use strict";

    try { localStorage.removeItem("tha-one-delivery-profile"); } catch {}

    const keys = { online: "tha-one-delivery-online", active: "tha-one-delivery-active", requests: "tha-one-delivery-requests", history: "tha-one-delivery-history", notifications: "tha-one-delivery-notifications" };
    const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
    const flow = ["Accepted", "At pickup", "Picked up", "Out for delivery", "Delivered"];
    const initialRequests = [
        { id: "DLV-58241", pickup: "The Little Oven", pickupAddress: "18, 12th Main Road", dropoff: "Cedar Residency, Indiranagar", distance: "3.2 km", time: "18 min", earnings: 82, placed: "2 min ago" },
        { id: "DLV-58238", pickup: "Green Table Kitchen", pickupAddress: "45, 100 Feet Road", dropoff: "Lakeview Apartments, Domlur", distance: "4.6 km", time: "24 min", earnings: 104, placed: "5 min ago" },
        { id: "DLV-58235", pickup: "Rice & Spice", pickupAddress: "7, CMH Road", dropoff: "Parkside Homes, Jeevan Bima Nagar", distance: "2.1 km", time: "14 min", earnings: 68, placed: "8 min ago" }
    ];

    function read(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
        catch { return fallback; }
    }

    const state = {
        online: read(keys.online, true) === true,
        active: read(keys.active, null),
        requests: read(keys.requests, structuredClone(initialRequests)),
        history: read(keys.history, [
            { id: "DLV-58212", pickup: "Soft Serve Studio", dropoff: "Old Airport Road", date: "Today, 10:42 AM", distance: "2.8 km", earnings: 76 },
            { id: "DLV-58197", pickup: "Bao House", dropoff: "Cambridge Layout", date: "Today, 9:16 AM", distance: "3.9 km", earnings: 92 },
            { id: "DLV-58180", pickup: "The Little Oven", dropoff: "Ulsoor Lake View", date: "Yesterday, 8:34 PM", distance: "4.1 km", earnings: 98 }
        ]),
        notifications: read(keys.notifications, [
            { title: "Welcome to THA ONE Delivery", message: "You’re all set to explore your delivery partner workspace.", time: "Today", unread: true },
            { title: "Peak-hour routes", message: "More delivery requests are usually available around dinner time.", time: "Today", unread: true }
        ]),
        profile: { name: "", phone: "", vehicle: "", registration: "" }
    };

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    }

    function icon(name) {
        return `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
    }

    function persist(name) {
        try { localStorage.setItem(keys[name], JSON.stringify(state[name])); }
        catch { toast("This change couldn’t be saved in your browser."); }
    }

    function toast(message) {
        const node = document.createElement("div");
        node.className = "toast";
        node.setAttribute("role", "status");
        node.textContent = message;
        document.getElementById("delivery-toast-region").append(node);
        window.setTimeout(() => node.remove(), 2700);
    }

    function setView(view) {
        document.querySelectorAll("[data-delivery-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.deliveryPanel === view));
        document.querySelectorAll(".ops-nav-button[data-delivery-view]").forEach((button) => {
            const active = button.dataset.deliveryView === view;
            button.classList.toggle("active", active);
            if (active) button.setAttribute("aria-current", "page");
            else button.removeAttribute("aria-current");
        });
        document.querySelector(`[data-delivery-panel="${view}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function routeFlowMarkup(status) {
        const activeIndex = flow.indexOf(status);
        return `<div class="delivery-flow delivery-active-flow" aria-label="Delivery progress">${flow.map((label, index) => {
            const complete = index < activeIndex;
            const current = index === activeIndex;
            return `<div class="delivery-step${complete ? " complete" : ""}${current ? " current" : ""}" aria-current="${current ? "step" : "false"}"><span class="delivery-step-dot">${complete ? "✓" : index + 1}</span><span>${label}</span></div>`;
        }).join("")}</div>`;
    }

    function nextStepLabel(status) {
        const labels = { Accepted: "Start pickup", "At pickup": "Confirm pickup", "Picked up": "Out for delivery", "Out for delivery": "Mark delivered" };
        return labels[status] || "Delivery complete";
    }

    function requestCard(request, compact = false) {
        return `<article class="delivery-request-card"><div><h3>${escapeHtml(request.id)} <span class="ops-status pending">New</span></h3><p>${escapeHtml(request.pickup)} · ${escapeHtml(request.distance)} · about ${escapeHtml(request.time)}</p><p>${escapeHtml(request.pickupAddress)} → ${escapeHtml(request.dropoff)}</p></div><strong class="delivery-request-pay">${money.format(request.earnings)}</strong><div class="delivery-request-actions"><button class="service-button${state.online && !state.active ? "" : " secondary"}" type="button" data-delivery-accept="${escapeHtml(request.id)}" ${!state.online || state.active ? "disabled" : ""}>${state.active ? "Finish active delivery first" : state.online ? "Accept delivery" : "Go online to accept"}</button>${compact ? `<button class="service-button secondary" type="button" data-delivery-view="requests">Details</button>` : ""}</div></article>`;
    }

    function activeCardMarkup() {
        const delivery = state.active;
        if (!delivery) return '<div class="delivery-route-empty">No active delivery right now. Accept a nearby request when you’re ready.</div>';
        return `<article class="delivery-active-card"><div class="delivery-active-head"><div><h2>${escapeHtml(delivery.id)} <span class="ops-status">${escapeHtml(delivery.status)}</span></h2><p>Accepted just now · ${escapeHtml(delivery.distance)} route</p></div><strong class="delivery-active-pay">${money.format(delivery.earnings)}</strong></div><div class="delivery-route-points"><div class="delivery-route-point">${icon("pin")}<span>Pickup · ${escapeHtml(delivery.pickup)}<small>${escapeHtml(delivery.pickupAddress)}</small></span></div><div class="delivery-route-point">${icon("pin")}<span>Drop-off · ${escapeHtml(delivery.dropoff)}<small>Customer delivery address</small></span></div></div>${routeFlowMarkup(delivery.status)}<div class="delivery-active-action"><button class="service-button" type="button" data-delivery-next ${delivery.status === "Delivered" ? "disabled" : ""}>${nextStepLabel(delivery.status)} ${icon("arrow-right")}</button></div></article>`;
    }

    function renderRequests() {
        const list = document.getElementById("delivery-request-list");
        const subtitle = document.getElementById("delivery-request-subtitle");
        document.getElementById("delivery-request-count").textContent = String(state.requests.length);
        subtitle.textContent = !state.online ? "Go online to see and accept nearby requests." : state.active ? "Complete your active delivery before accepting another." : `${state.requests.length} requests currently available near you.`;
        list.innerHTML = state.requests.length ? state.requests.map((request) => requestCard(request)).join("") : '<div class="delivery-route-empty">No requests are available right now. Stay online and we’ll let you know when one comes up.</div>';
        document.getElementById("delivery-overview-requests").innerHTML = state.requests.length
            ? state.requests.slice(0, 2).map((request) => requestCard(request, true)).join("")
            : '<div class="delivery-route-empty">No nearby requests right now. We’ll let you know when something comes up.</div>';
    }

    function renderHistory() {
        const body = document.getElementById("delivery-history-rows");
        body.innerHTML = state.history.length ? state.history.map((item) => `<tr><td><strong>${escapeHtml(item.id)}</strong></td><td>${escapeHtml(item.pickup)}</td><td>${escapeHtml(item.dropoff)}</td><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.distance)}</td><td>${money.format(item.earnings)}</td></tr>`).join("") : '<tr><td colspan="6"><p class="service-empty">Completed deliveries will appear here.</p></td></tr>';
    }

    function renderStats() {
        const completed = state.history.length;
        const earnings = state.history.reduce((total, item) => total + Number(item.earnings || 0), 0);
        const items = [
            ["Today’s earnings", money.format(state.history.slice(0, 2).reduce((sum, item) => sum + Number(item.earnings || 0), 0)), "From completed deliveries"],
            ["Completed trips", String(completed), "You’re making a difference"],
            ["Available requests", String(state.requests.length), state.online ? "Near your current area" : "Go online to receive requests"],
            ["Active delivery", state.active ? "1" : "0", state.active ? state.active.status : "No active route"]
        ];
        const markup = items.map(([label, value, note]) => `<article class="ops-stat-card"><p class="ops-stat-label">${label}</p><p class="ops-stat-value">${value}</p><p class="ops-stat-foot">${note}</p></article>`).join("");
        document.getElementById("delivery-overview-stats").innerHTML = markup;
        document.getElementById("delivery-earning-stats").innerHTML = `<article class="ops-stat-card"><p class="ops-stat-label">Total earnings</p><p class="ops-stat-value">${money.format(earnings)}</p><p class="ops-stat-foot">From ${completed} completed trips</p></article><article class="ops-stat-card"><p class="ops-stat-label">Completed deliveries</p><p class="ops-stat-value">${completed}</p><p class="ops-stat-foot">Across your recent history</p></article><article class="ops-stat-card"><p class="ops-stat-label">Average per delivery</p><p class="ops-stat-value">${money.format(earnings / Math.max(1, completed))}</p><p class="ops-stat-foot">Calculated from completed trips</p></article><article class="ops-stat-card"><p class="ops-stat-label">Payout status</p><p class="ops-stat-value">Pending</p><p class="ops-stat-foot">Provider connection required</p></article>`;
        const chartBars = [35, 56, 42, 74, 60, 89, 68];
        const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        document.getElementById("delivery-earnings-chart").innerHTML = chartBars.map((height, index) => `<div class="ops-chart-column"><div class="ops-chart-bar" style="height:${height}%" title="${labels[index]} delivery earnings"></div><span>${labels[index]}</span></div>`).join("");
        document.querySelector(".delivery-online-toggle #delivery-online-label").textContent = state.online ? "You’re online" : "You’re offline";
        document.querySelector(".delivery-online-toggle").classList.toggle("is-paused", !state.online);
        document.getElementById("delivery-online").checked = state.online;
        document.querySelector("[data-delivery-online-copy]").checked = state.online;
    }

    function renderActive() {
        document.getElementById("delivery-active-content").innerHTML = activeCardMarkup();
        document.getElementById("delivery-overview-active").innerHTML = activeCardMarkup();
    }

    function renderNotifications() {
        const unread = state.notifications.filter((notification) => notification.unread).length;
        document.getElementById("delivery-notification-count").textContent = String(unread);
        const list = document.getElementById("delivery-notifications-list");
        list.innerHTML = state.notifications.length ? state.notifications.map((notification) => `<article class="delivery-notification${notification.unread ? " unread" : ""}"><span class="delivery-notification-icon">${icon("bell")}</span><div><strong>${escapeHtml(notification.title)}</strong><p>${escapeHtml(notification.message)}</p></div><time>${escapeHtml(notification.time)}</time></article>`).join("") : '<p class="service-empty">You’re all caught up. New updates will appear here.</p>';
    }

    function renderAll() {
        renderRequests();
        renderActive();
        renderHistory();
        renderStats();
        renderNotifications();
    }

    function addNotification(title, message) {
        state.notifications.unshift({ title, message, time: "Just now", unread: true });
        state.notifications = state.notifications.slice(0, 20);
        persist("notifications");
        renderNotifications();
    }

    function acceptRequest(id) {
        if (!state.online) return toast("Go online before accepting a delivery request.");
        if (state.active) return toast("Finish your active delivery first.");
        const index = state.requests.findIndex((request) => request.id === id);
        if (index === -1) return;
        state.active = { ...state.requests.splice(index, 1)[0], status: "Accepted", acceptedAt: new Date().toISOString() };
        persist("active");
        persist("requests");
        addNotification("Delivery accepted", `${state.active.id} is now on your active route.`);
        renderAll();
        setView("active");
    }

    function advanceDelivery() {
        if (!state.active) return;
        const currentIndex = flow.indexOf(state.active.status);
        if (currentIndex < 0 || currentIndex >= flow.length - 1) return;
        state.active.status = flow[currentIndex + 1];
        if (state.active.status === "Delivered") {
            state.history.unshift({
                id: state.active.id,
                pickup: state.active.pickup,
                dropoff: state.active.dropoff,
                date: `Today, ${new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`,
                distance: state.active.distance,
                earnings: state.active.earnings
            });
            state.history = state.history.slice(0, 50);
            state.active = null;
            persist("history");
            persist("active");
            addNotification("Delivery completed", "Thanks for getting another good thing there safely.");
            toast("Delivery completed. Your earnings have been updated.");
            setView("overview");
        } else {
            persist("active");
            addNotification("Delivery progress updated", `Your route is now at ${state.active.status.toLowerCase()}.`);
            toast(`Status updated: ${state.active.status}`);
        }
        renderAll();
    }

    function loadProfile() {
        document.getElementById("delivery-name").value = state.profile.name;
        document.getElementById("delivery-phone").value = state.profile.phone;
        document.getElementById("delivery-vehicle").value = state.profile.vehicle;
        document.getElementById("delivery-registration").value = state.profile.registration;
    }

    async function init() {
        const gate = document.getElementById("delivery-access-gate");
        const dashboard = document.getElementById("delivery-dashboard");
        const access = window.THA_ONE_KYC_ACCESS;
        if (!access) {
            gate.querySelector("[data-gate-title]").textContent = "Verification service unavailable";
            gate.querySelector("[data-gate-message]").textContent = "Delivery dashboard access remains closed until verification can be confirmed securely.";
            return;
        }
        if (!await access.requireVerified("delivery", gate, dashboard)) return;
        renderAll();
        loadProfile();
        document.querySelectorAll("[data-delivery-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.deliveryView)));
        document.addEventListener("click", (event) => {
            const accept = event.target.closest("[data-delivery-accept]");
            if (accept) acceptRequest(accept.dataset.deliveryAccept);
            if (event.target.closest("[data-delivery-next]")) advanceDelivery();
        });
        [document.getElementById("delivery-online"), document.querySelector("[data-delivery-online-copy]")].forEach((toggle) => toggle.addEventListener("change", () => {
            state.online = toggle.checked;
            persist("online");
            renderAll();
            toast(state.online ? "You’re online. Nearby requests are ready." : "You’re offline. You won’t receive new requests.");
        }));
        document.getElementById("delivery-mark-read").addEventListener("click", () => {
            state.notifications = state.notifications.map((notification) => ({ ...notification, unread: false }));
            persist("notifications");
            renderNotifications();
            toast("Notifications marked as read.");
        });
        document.getElementById("delivery-profile-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            state.profile = {
                name: document.getElementById("delivery-name").value.trim(),
                phone: document.getElementById("delivery-phone").value.trim(),
                vehicle: document.getElementById("delivery-vehicle").value,
                registration: document.getElementById("delivery-registration").value.trim()
            };
            try {
                await window.THA_ONE_KYC_ACCESS.updateProfile("delivery", state.profile);
                toast("Delivery profile saved securely.");
            } catch (error) {
                toast(error.message || "Delivery profile could not be saved.");
            }
        });
        document.getElementById("delivery-earnings-range").addEventListener("change", (event) => {
            const range = event.currentTarget.value === "7" ? "this week" : "this month";
            document.getElementById("delivery-earnings-chart").setAttribute("aria-label", `Delivery earnings for ${range}`);
        });
    }

    init();
})();

(() => {
    "use strict";

    const workspace = document.getElementById("profile-workspace");
    const stateNode = document.getElementById("profile-state");
    const state = { profile: null, addresses: [], orders: 0 };

    function text(tag, className, value) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        node.textContent = String(value ?? "");
        return node;
    }

    function toast(message) {
        const node = text("div", "toast", message);
        node.setAttribute("role", "status");
        document.getElementById("profile-toast-region").append(node);
        window.setTimeout(() => node.remove(), 2600);
    }

    function setUnavailable(title, message, requiresSignIn = false) {
        const panel = document.createElement("div");
        panel.className = "profile-state-card";
        panel.append(text("p", "service-eyebrow", "Your shared THA ONE account"), text("h1", "", title), text("p", "", message));
        const link = document.createElement("a");
        link.className = "service-button";
        link.href = requiresSignIn ? "intex.html" : "home.html";
        link.textContent = requiresSignIn ? "Sign in to THA ONE" : "Continue Shopping";
        panel.append(link);
        stateNode.replaceChildren(panel);
        workspace.hidden = true;
    }

    function safeText(value, maxLength = 160) {
        return typeof value === "string" && value.length <= maxLength ? value : "";
    }

    function showSection(name) {
        document.querySelectorAll("[data-profile-panel]").forEach((section) => {
            const active = section.dataset.profilePanel === name;
            section.hidden = !active;
            section.classList.toggle("active", active);
        });
        document.querySelectorAll("[data-profile-section]").forEach((tab) => {
            const active = tab.dataset.profileSection === name;
            tab.classList.toggle("active", active);
            if (active) tab.setAttribute("aria-current", "page");
            else tab.removeAttribute("aria-current");
        });
    }

    function renderProfile() {
        const profile = state.profile;
        const name = safeText(profile.fullName, 100) || "THA ONE customer";
        const email = safeText(profile.email, 254);
        const mobile = safeText(profile.mobileMasked || profile.mobile, 30);
        document.getElementById("profile-name").textContent = name;
        document.getElementById("profile-contact").textContent = [email, mobile].filter(Boolean).join(" · ");
        document.getElementById("profile-avatar").textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "T";
        document.getElementById("profile-edit-name").value = safeText(profile.fullName, 100);
        document.getElementById("profile-edit-email").value = email;
        document.getElementById("profile-edit-mobile").value = safeText(profile.mobile, 30);
        document.getElementById("profile-wishlist-summary").textContent = `${readWishlistCount()} saved Shopping favourites`;
        const session = document.getElementById("session-state");
        session.textContent = "Connected";
        session.classList.add("available");
        renderRoles(profile.roles || {});
        renderAddresses();
        renderWishlist();
        renderActivity(Array.isArray(profile.notifications) ? profile.notifications : []);
    }

    function readWishlistCount() {
        try {
            const items = JSON.parse(localStorage.getItem("tha-one-wishlist") || "[]");
            return Array.isArray(items) ? items.length : 0;
        } catch {
            return 0;
        }
    }

    function renderRoles(roles) {
        ["seller", "deliveryPartner"].forEach((role) => {
            const prefix = role === "seller" ? "seller" : "delivery";
            const status = String(roles[role]?.status || "not_applied").toLowerCase();
            const statusNode = document.getElementById(`${prefix}-role-status`);
            const pill = document.getElementById(`${prefix}-role-pill`);
            const link = document.getElementById(`${prefix}-role-link`);
            const teaser = document.getElementById(`profile-${prefix}-teaser`);

            const labels = {
                verified: ["Verified", "available"],
                pending: ["Pending", "pending"],
                needs_correction: ["Needs Correction", "pending"],
                rejected: ["Rejected", "failed"],
                failed: ["Rejected", "failed"],
                not_applied: [role === "seller" ? "Apply to sell on THA ONE" : "Apply to deliver with THA ONE", ""]
            };
            const [label, className] = labels[status] || labels.not_applied;
            statusNode.textContent = label;
            pill.textContent = labels[status] ? labels[status][0] : "Not applied";
            pill.className = `role-state ${className}`;

            if (status === "verified") {
                link.textContent = role === "seller" ? "Open Seller Dashboard" : "Open Delivery Dashboard";
                link.href = role === "seller" ? "seller.html" : "delivery.html";
                if (teaser) teaser.textContent = "Verified partner · Open workspace";
            } else if (status === "pending") {
                link.textContent = "View Status";
                link.href = role === "seller" ? "seller-onboarding.html" : "delivery-onboarding.html";
                if (teaser) teaser.textContent = "Application submitted · Pending verification";
            } else if (status === "needs_correction") {
                link.textContent = "Correct Details";
                link.href = role === "seller" ? "seller-onboarding.html" : "delivery-onboarding.html";
                if (teaser) teaser.textContent = "Corrections requested by verification provider";
            } else if (status === "rejected" || status === "failed") {
                link.textContent = "Review & Reapply";
                link.href = role === "seller" ? "seller-onboarding.html" : "delivery-onboarding.html";
                if (teaser) teaser.textContent = "Verification rejected · Click to review criteria";
            } else {
                link.textContent = role === "seller" ? "Become a Seller" : "Become a Partner";
                link.href = role === "seller" ? "seller-onboarding.html" : "delivery-onboarding.html";
            }
        });
    }

    function renderAddresses() {
        const list = document.getElementById("profile-address-list");
        if (!state.addresses.length) {
            list.replaceChildren(text("p", "service-empty", "No saved addresses yet. Add one to make checkout quicker."));
            return;
        }
        list.replaceChildren(...state.addresses.map((address) => {
            const card = document.createElement("article");
            card.className = "profile-address-card";
            const heading = document.createElement("div");
            heading.className = "profile-address-heading";
            heading.append(text("strong", "", safeText(address.label, 40) || "Address"));
            if (address.isDefault === true) heading.append(text("span", "role-state available", "Default"));
            card.append(heading);
            card.append(text("p", "", safeText(address.recipientName, 100)));
            card.append(text("p", "", safeText(address.line1, 300)));
            card.append(text("p", "profile-address-location", [safeText(address.city, 80), safeText(address.state, 80), safeText(address.pincode, 12)].filter(Boolean).join(", ")));
            const actions = document.createElement("div");
            actions.className = "profile-address-actions";
            const remove = text("button", "profile-inline-button danger", "Remove");
            remove.type = "button";
            remove.addEventListener("click", () => deleteAddress(address.id));
            actions.append(remove);
            if (address.isDefault !== true) {
                const makeDefault = text("button", "profile-inline-button", "Set as default");
                makeDefault.type = "button";
                makeDefault.addEventListener("click", () => saveAddress({ ...address, isDefault: true }));
                actions.append(makeDefault);
            }
            card.append(actions);
            return card;
        }));
    }

    function renderWishlist() {
        const list = document.getElementById("profile-wishlist-list");
        const count = readWishlistCount();
        list.replaceChildren(text("p", "profile-list-note", `${count} saved Shopping ${count === 1 ? "favourite" : "favourites"}.`));
    }

    function renderActivity(notifications) {
        const region = document.getElementById("profile-activity");
        const entries = notifications.filter((item) => item && typeof item.message === "string").slice(0, 4);
        if (!entries.length) {
            region.replaceChildren(text("p", "profile-list-note", "Your service updates will appear here."));
            return;
        }
        region.replaceChildren(...entries.map((item) => {
            const row = document.createElement("article");
            row.className = "profile-activity-row";
            row.append(text("strong", "", safeText(item.title, 100) || "Account update"), text("p", "", safeText(item.message, 240)));
            return row;
        }));
    }

    async function loadProfile() {
        stateNode.innerHTML = '<div class="orders-loading"><span></span><p>Checking your THA ONE account…</p></div>';
        try {
            const response = await window.THA_ONE_API.request("profileEndpoint");
            if (response.authenticated !== true || !response.profile || typeof response.profile !== "object") {
                setUnavailable("Sign in to see your profile", "Your Shopping and Food account is shared. No customer KYC is required.", true);
                return;
            }
            state.profile = response.profile;
            state.addresses = Array.isArray(response.addresses) ? response.addresses : [];
            state.orders = Array.isArray(response.orders) ? response.orders.length : 0;
            stateNode.hidden = true;
            workspace.hidden = false;
            renderProfile();
        } catch (error) {
            setUnavailable(error.code === "service_not_configured" ? "Profile service not connected" : "Sign in to see your profile", error.message || "Your customer profile service is unavailable.", true);
        }
    }

    async function saveAddress(address) {
        try {
            const result = await window.THA_ONE_API.request("addressUpsertEndpoint", { method: "POST", body: address });
            if (!Array.isArray(result.addresses)) throw new Error("The address service returned an unexpected response.");
            state.addresses = result.addresses;
            renderAddresses();
            document.getElementById("address-dialog").close();
            toast("Address saved to your THA ONE account.");
        } catch (error) {
            document.getElementById("address-form-message").textContent = error.message;
        }
    }

    async function deleteAddress(id) {
        try {
            const result = await window.THA_ONE_API.request("addressDeleteEndpoint", { method: "DELETE", body: { addressId: id } });
            if (!Array.isArray(result.addresses)) throw new Error("The address service returned an unexpected response.");
            state.addresses = result.addresses;
            renderAddresses();
            toast("Address removed from your account.");
        } catch (error) { toast(error.message || "Address could not be removed."); }
    }

    async function saveProfile(event) {
        event.preventDefault();
        const message = document.getElementById("profile-edit-message");
        message.textContent = "";
        const payload = {
            fullName: document.getElementById("profile-edit-name").value.trim(),
            email: document.getElementById("profile-edit-email").value.trim(),
            mobile: document.getElementById("profile-edit-mobile").value.trim()
        };
        try {
            const result = await window.THA_ONE_API.request("profileUpdateEndpoint", { method: "PUT", body: payload });
            if (!result.profile || typeof result.profile !== "object") throw new Error("Profile service returned an unexpected response.");
            state.profile = result.profile;
            renderProfile();
            document.getElementById("profile-edit-dialog").close();
            toast("Your profile was updated securely.");
        } catch (error) { message.textContent = error.message || "Profile could not be updated."; }
        finally { payload.fullName = ""; payload.email = ""; payload.mobile = ""; }
    }

    async function signOut() {
        try {
            await window.THA_ONE_API.request("logoutEndpoint", { method: "POST" });
            window.location.assign("intex.html");
        } catch (error) { toast(error.message || "Sign out could not be completed."); }
    }

    function init() {
        document.querySelectorAll("[data-profile-section]").forEach((button) => button.addEventListener("click", () => showSection(button.dataset.profileSection)));
        document.getElementById("profile-edit-open").addEventListener("click", () => document.getElementById("profile-edit-dialog").showModal());
        document.querySelectorAll("[data-close-profile-dialog]").forEach((button) => button.addEventListener("click", () => document.getElementById("profile-edit-dialog").close()));
        document.getElementById("profile-edit-form").addEventListener("submit", saveProfile);
        document.getElementById("address-add-open").addEventListener("click", () => document.getElementById("address-dialog").showModal());
        document.querySelectorAll("[data-close-address-dialog]").forEach((button) => button.addEventListener("click", () => document.getElementById("address-dialog").close()));
        document.getElementById("address-form").addEventListener("submit", (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const address = Object.fromEntries(formData.entries());
            address.isDefault = state.addresses.length === 0;
            saveAddress(address);
        });
        document.getElementById("profile-sign-out").addEventListener("click", signOut);
        document.getElementById("profile-logout-bottom").addEventListener("click", signOut);
        document.getElementById("profile-edit-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
        document.getElementById("address-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
        loadProfile();
    }

    init();
})();

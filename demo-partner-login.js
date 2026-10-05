(() => {
    "use strict";

    const role = new URLSearchParams(window.location.search).get("role");
    const validRole = role === "seller" || role === "delivery";
    if (!validRole) {
        window.location.replace("experience.html");
        return;
    }
    if (window.THA_ONE_CONFIG?.DEMO_MODE !== true) {
        window.location.replace(role === "seller" ? "seller-onboarding.html" : "delivery-onboarding.html");
        return;
    }

    const seller = role === "seller";
    const title = seller ? "Demo Seller Login" : "Demo Delivery Partner Login";
    document.title = `${title} | THA ONE`;
    document.getElementById("demo-login-title").textContent = title;
    document.getElementById("demo-role-icon").textContent = seller ? "🏪" : "🛵";
    document.getElementById("demo-partner-continue").textContent = seller ? "Continue as Seller" : "Continue as Delivery Partner";

    document.getElementById("demo-partner-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const identifier = document.getElementById("demo-identifier").value.trim();
        const message = document.getElementById("demo-login-message");
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
        const digits = identifier.replace(/\D/g, "");
        if (!isEmail && !/^[6-9]\d{9}$/.test(digits)) {
            message.textContent = "Enter a valid-looking 10-digit Indian mobile number or email address.";
            document.getElementById("demo-identifier").focus();
            return;
        }
        try {
            window.THA_ONE_CORE.openDemoPartnerSession({ role, identifier });
            window.location.assign(seller ? "seller.html" : "delivery.html");
        } catch (error) {
            message.textContent = error.message || "The demo partner account could not be opened.";
        }
    });
})();
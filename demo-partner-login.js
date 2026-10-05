(() => {
    "use strict";

    const role = new URLSearchParams(window.location.search).get("role");
    const validRole = role === "seller" || role === "delivery";
    if (!validRole) {
        window.location.replace("experience.html");
        return;
    }
    if (window.THA_ONE_CONFIG?.demoMode !== true) {
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
        const mobile = document.getElementById("demo-mobile").value.trim();
        const message = document.getElementById("demo-login-message");
        if (!/^[6-9]\d{9}$/.test(mobile)) {
            message.textContent = "Enter a valid-looking 10-digit Indian mobile number.";
            document.getElementById("demo-mobile").focus();
            return;
        }
        try {
            window.THA_ONE_CORE.openDemoPartnerSession({ role, mobile });
            window.location.assign(seller ? "seller.html" : "delivery.html");
        } catch (error) {
            message.textContent = error.message || "The demo partner account could not be opened.";
        }
    });
})();
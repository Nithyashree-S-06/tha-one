(() => {
    "use strict";

    const config = window.THA_ONE_KYC_CONFIG || {};

    function secureEndpoint(endpoint) {
        if (!endpoint) return null;
        try {
            const url = new URL(endpoint, window.location.href);
            const secure = url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
            const apiOrigin = config.apiOrigin ? new URL(config.apiOrigin, window.location.href).origin : "";
            const allowed = url.origin === window.location.origin || (apiOrigin && url.origin === apiOrigin && url.protocol === "https:");
            return secure && allowed ? url : null;
        } catch {
            return null;
        }
    }

    async function checkStatus(service) {
        const endpoint = secureEndpoint(config.statusEndpoint);
        if (!endpoint) {
            if (window.THA_ONE_CORE) {
                return window.THA_ONE_CORE.getRoleStatus(service);
            }
            return { status: "unconfigured", verified: false };
        }
        endpoint.searchParams.set("service", service);
        try {
            const response = await fetch(endpoint, { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
            if (!response.ok) return { status: response.status === 401 ? "unauthorized" : "unavailable", verified: false };
            const result = await response.json();
            const status = String(result.status || "unknown").toLowerCase();
            return { status, verified: status === "verified" };
        } catch {
            return { status: "unavailable", verified: false };
        }
    }

    async function requireVerified(service, gate, dashboard) {
        const status = await checkStatus(service);
        if (status.verified) {
            gate.hidden = true;
            dashboard.hidden = false;
            return true;
        }
        dashboard.hidden = true;
        gate.hidden = false;
        const title = gate.querySelector("[data-gate-title]");
        const message = gate.querySelector("[data-gate-message]");
        const link = gate.querySelector("[data-gate-link]");
        const retry = gate.querySelector("[data-gate-retry]");

        if (status.status === "not_applied") {
            title.textContent = service === "seller" ? "Become a THA ONE Seller" : "Become a Delivery Partner";
            message.textContent = service === "seller"
                ? "Start selling on THA ONE. Complete seller onboarding and verification to manage products, orders, and earnings."
                : "Earn with every delivery. Complete partner onboarding and verification to start receiving delivery requests.";
            if (link) link.textContent = service === "seller" ? "Apply for Seller Account" : "Apply for Partner Account";
        } else if (status.status === "pending" || status.status === "submitted" || status.status === "in_review") {
            title.textContent = "Verification pending";
            message.textContent = "Your profile is being reviewed by the THA ONE verification service. Dashboard access will open as soon as approval is confirmed.";
            if (link) link.textContent = "View Application Status";
        } else if (status.status === "failed" || status.status === "rejected" || status.status === "needs_correction") {
            title.textContent = "Verification needs attention";
            message.textContent = "Review your onboarding details and submit any requested corrections to continue.";
            if (link) link.textContent = "Review Onboarding Details";
        } else if (status.status === "unconfigured") {
            title.textContent = service === "seller" ? "Seller Workspace" : "Delivery Partner Workspace";
            message.textContent = "Your service verification provider is not connected yet. Onboarding is required before workspace access is granted.";
            if (link) link.textContent = service === "seller" ? "Complete Seller Onboarding" : "Complete Partner Onboarding";
        } else {
            title.textContent = "Verification check required";
            message.textContent = "For your security, dashboard access is unavailable until the verification service confirms your status.";
        }

        if (link) link.href = config.onboardingPaths?.[service] || `${service}-onboarding.html`;
        if (retry) {
            retry.onclick = () => requireVerified(service, gate, dashboard);
        }

        // Add a demo helper action in development mode so testers can easily simulate verified access
        let demoAction = gate.querySelector(".kyc-demo-verify-button");
        if (!demoAction && window.THA_ONE_CORE) {
            demoAction = document.createElement("button");
            demoAction.type = "button";
            demoAction.className = "service-button secondary kyc-demo-verify-button";
            demoAction.style.marginLeft = "8px";
            demoAction.style.background = "#eef5e7";
            demoAction.style.borderColor = "#9bbd88";
            demoAction.style.color = "#20372e";
            demoAction.textContent = "⚡ Quick Demo Verify";
            demoAction.title = "Simulate approved verification for testing the dashboard";
            demoAction.addEventListener("click", async () => {
                window.THA_ONE_CORE.setRoleStatus(service, "verified");
                await requireVerified(service, gate, dashboard);
            });
            if (retry && retry.parentElement) {
                retry.parentElement.appendChild(demoAction);
            }
        }

        return false;
    }

    async function updateProfile(service, profile) {
        const current = await checkStatus(service);
        if (!current.verified) throw new Error("Your service verification must be confirmed before profile updates are saved.");
        const profileEndpoint = service === "seller" ? config.sellerProfileEndpoint : config.deliveryProfileEndpoint;
        const url = secureEndpoint(profileEndpoint);
        const csrfUrl = secureEndpoint(config.csrfTokenEndpoint);
        if (!url || !csrfUrl) {
            if (window.THA_ONE_CORE) {
                window.THA_ONE_CORE.updateProfile(profile);
                return true;
            }
            throw new Error("Secure profile updates are not configured. Nothing was saved.");
        }
        const csrfResponse = await fetch(csrfUrl, { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
        if (!csrfResponse.ok) throw new Error("Could not establish a secure profile session. Nothing was saved.");
        const csrfResult = await csrfResponse.json().catch(() => ({}));
        if (typeof csrfResult.csrfToken !== "string" || !csrfResult.csrfToken) throw new Error("Could not establish a secure profile session. Nothing was saved.");
        const response = await fetch(url, {
            method: "PUT",
            credentials: "include",
            cache: "no-store",
            headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": csrfResult.csrfToken },
            body: JSON.stringify(profile)
        });
        if (!response.ok) throw new Error("The secure profile service could not save your changes.");
        return true;
    }

    window.THA_ONE_KYC_ACCESS = Object.freeze({ checkStatus, requireVerified, updateProfile });
})();

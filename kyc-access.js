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
        if (!endpoint) return { status: "unconfigured", verified: false };
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
        if (status.status === "unconfigured") {
            title.textContent = "Verification setup required";
            message.textContent = "Your service verification provider is not connected yet. Dashboard access remains closed until the backend confirms a verified profile.";
        } else if (status.status === "pending" || status.status === "submitted" || status.status === "in_review") {
            title.textContent = "Verification pending";
            message.textContent = "Your profile is being reviewed. Dashboard access will open after the verification service confirms approval.";
        } else if (status.status === "failed" || status.status === "rejected") {
            title.textContent = "Verification needs attention";
            message.textContent = "Review your onboarding details and submit any requested corrections to continue.";
        } else {
            title.textContent = "Could not confirm verification";
            message.textContent = "For your security, dashboard access is unavailable until the verification service confirms your status.";
        }
        link.href = config.onboardingPaths?.[service] || `${service}-onboarding.html`;
        retry.addEventListener("click", () => requireVerified(service, gate, dashboard), { once: true });
        return false;
    }

    async function updateProfile(service, profile) {
        const current = await checkStatus(service);
        if (!current.verified) throw new Error("Your service verification must be confirmed before profile updates are saved.");
        const profileEndpoint = service === "seller" ? config.sellerProfileEndpoint : config.deliveryProfileEndpoint;
        const url = secureEndpoint(profileEndpoint);
        const csrfUrl = secureEndpoint(config.csrfTokenEndpoint);
        if (!url || !csrfUrl) throw new Error("Secure profile updates are not configured. Nothing was saved.");
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

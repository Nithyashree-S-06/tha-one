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

        // Hide delivery online toggle and store open indicators when not verified
        const onlineToggle = document.querySelector(".delivery-online-toggle");
        if (onlineToggle) onlineToggle.hidden = !status.verified;
        const storeOpenIndicator = document.querySelector(".ops-status-open");
        if (storeOpenIndicator) storeOpenIndicator.hidden = !status.verified;

        if (status.status === "not_applied") {
            title.textContent = service === "seller" ? "Become a THA ONE Seller" : "Become a Delivery Partner";
            message.textContent = service === "seller"
                ? "Start selling on THA ONE. Complete seller onboarding and business verification to manage products, orders, and earnings."
                : "Earn with every delivery. Complete partner onboarding and identity verification to start receiving delivery requests.";
            if (link) link.textContent = service === "seller" ? "Apply for Seller Account" : "Apply for Partner Account";
        } else if (status.status === "pending" || status.status === "submitted" || status.status === "in_review") {
            title.textContent = "Verification Status: Pending";
            message.textContent = "Your profile and documents are currently being reviewed by the THA ONE verification team. Dashboard access will be enabled as soon as verification is confirmed.";
            if (link) link.textContent = "View Application Status";
        } else if (status.status === "needs_correction") {
            title.textContent = "Verification Status: Needs Correction";
            message.textContent = "The verification provider requested updates to your submitted details (such as document clarity or information mismatch). Please review and resubmit.";
            if (link) link.textContent = "Correct Onboarding Details";
        } else if (status.status === "rejected" || status.status === "failed") {
            title.textContent = "Verification Status: Rejected";
            message.textContent = "Your verification could not be approved. Please review the eligibility criteria or submit corrected information to reapply.";
            if (link) link.textContent = "Review & Reapply";
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

        // Add demo simulation controls in development mode so testers can easily test all 4 statuses
        let demoSimWrap = gate.querySelector(".kyc-demo-sim-wrap");
        if (!demoSimWrap && window.THA_ONE_CORE && retry && retry.parentElement) {
            demoSimWrap = document.createElement("div");
            demoSimWrap.className = "kyc-demo-sim-wrap";
            demoSimWrap.style.cssText = "margin-top: 16px; padding: 12px; border: 1px dashed #b2cbb0; border-radius: 8px; background: #f8faf6; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;";
            
            const label = document.createElement("span");
            label.style.cssText = "font-size: 11px; font-weight: 700; color: #20372e; text-transform: uppercase; letter-spacing: 0.5px;";
            label.textContent = "Status Simulator:";
            demoSimWrap.appendChild(label);

            const statuses = [
                { id: "pending", label: "⏳ Pending", color: "#8f621a", bg: "#fdf2dc" },
                { id: "needs_correction", label: "✏️ Needs Correction", color: "#9a4b08", bg: "#fceddf" },
                { id: "rejected", label: "❌ Rejected", color: "#a5281b", bg: "#feebe9" },
                { id: "verified", label: "✓ Verified (Unlock)", color: "#24611e", bg: "#e5f6e0" }
            ];

            statuses.forEach(s => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.style.cssText = `padding: 4px 10px; border: 1px solid ${s.color}; border-radius: 4px; background: ${s.bg}; color: ${s.color}; font-size: 11px; font-weight: 700; cursor: pointer; transition: transform 0.1s ease;`;
                btn.textContent = s.label;
                btn.title = `Simulate '${s.id}' status for this service`;
                btn.addEventListener("click", async () => {
                    window.THA_ONE_CORE.setRoleStatus(service, s.id);
                    await requireVerified(service, gate, dashboard);
                });
                demoSimWrap.appendChild(btn);
            });

            retry.parentElement.appendChild(demoSimWrap);
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

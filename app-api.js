(() => {
    "use strict";

    const config = window.THA_ONE_CONFIG || {};
    const kycConfig = window.THA_ONE_KYC_CONFIG || {};

    function endpoint(value) {
        if (!value) return null;
        try {
            const url = new URL(value, window.location.href);
            const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
            const apiOrigin = config.apiOrigin ? new URL(config.apiOrigin, window.location.href).origin : "";
            const allowed = url.origin === window.location.origin || (apiOrigin && apiOrigin === url.origin && url.protocol === "https:");
            return allowed && (url.protocol === "https:" || localHttp) ? url : null;
        } catch {
            return null;
        }
    }

    async function csrfToken() {
        const url = endpoint(kycConfig.csrfTokenEndpoint);
        if (!url) throw new Error("Secure account updates are not connected yet.");
        const response = await fetch(url, { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Could not establish a secure account session.");
        const result = await response.json().catch(() => ({}));
        if (typeof result.csrfToken !== "string" || !result.csrfToken) throw new Error("Could not establish a secure account session.");
        return result.csrfToken;
    }

    async function request(endpointKey, { method = "GET", body, headers = {}, query = {} } = {}) {
        const url = endpoint(config[endpointKey]);
        if (!url) {
            const error = new Error("This THA ONE service is not connected yet. Your information was not saved.");
            error.code = "service_not_configured";
            throw error;
        }
        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
        });
        const requestHeaders = { Accept: "application/json", ...headers };
        const options = { method, credentials: "include", cache: "no-store", headers: requestHeaders };
        if (method !== "GET" && method !== "HEAD") {
            requestHeaders["X-CSRF-Token"] = await csrfToken();
            if (body instanceof FormData) options.body = body;
            else {
                requestHeaders["Content-Type"] = "application/json";
                options.body = JSON.stringify(body ?? {});
            }
        }
        const response = await fetch(url, options);
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(response.status === 401 ? "Please sign in to continue." : response.status === 403 ? "Your account doesn’t have permission for this action." : "We couldn’t complete that request. Please try again.");
            error.code = String(result.code || (response.status === 429 ? "rate_limited" : "request_failed"));
            throw error;
        }
        return result;
    }

    function safeRedirect(value) {
        if (typeof value !== "string") return null;
        try {
            const url = new URL(value, window.location.href);
            const paymentOrigin = config.paymentOrigin ? new URL(config.paymentOrigin, window.location.href).origin : "";
            const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
            const allowed = url.origin === window.location.origin || (paymentOrigin && paymentOrigin === url.origin && url.protocol === "https:");
            return allowed && (url.protocol === "https:" || localHttp) ? url : null;
        } catch {
            return null;
        }
    }

    window.THA_ONE_API = Object.freeze({ endpoint, request, safeRedirect });
})();

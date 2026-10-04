(() => {
    "use strict";

    const config = window.THA_ONE_KYC_CONFIG || {};
    const gate = document.getElementById("admin-gate");
    const workspace = document.getElementById("admin-workspace");
    const queue = document.getElementById("admin-queue");
    const dialog = document.getElementById("admin-action-dialog");
    let requests = [];
    let serviceFilter = "all";
    let statusFilter = "all";
    let activeRequest = null;
    let activeAction = "";
    let csrfToken = "";

    function endpoint(value) {
        if (!value) return null;
        try {
            const url = new URL(value, window.location.href);
            const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
            const apiOrigin = config.apiOrigin ? new URL(config.apiOrigin, window.location.href).origin : "";
            const allowed = url.origin === window.location.origin || (apiOrigin && url.origin === apiOrigin && url.protocol === "https:");
            return allowed && (url.protocol === "https:" || localHttp) ? url : null;
        } catch {
            return null;
        }
    }

    function normalizedStatus(status) {
        const value = String(status || "").toLowerCase().replace(/[ _-]+/g, "");
        if (["verified", "approved"].includes(value)) return "verified";
        if (["failed", "rejected", "verificationfailed"].includes(value)) return "failed";
        if (["pending", "submitted", "inreview", "pendingverification"].includes(value)) return "pending";
        return "unknown";
    }

    function setGate(title, message) {
        gate.hidden = false;
        workspace.hidden = true;
        document.getElementById("admin-gate-title").textContent = title;
        document.getElementById("admin-gate-message").textContent = message;
    }

    function toast(message) {
        const node = document.createElement("div");
        node.className = "toast";
        node.setAttribute("role", "status");
        node.textContent = message;
        document.getElementById("admin-toast-region").append(node);
        window.setTimeout(() => node.remove(), 2800);
    }

    function safeMaskedDetails(details) {
        if (!details || typeof details !== "object") return [];
        return Object.entries(details).filter(([label, value]) => {
            if (typeof value !== "string" || value.length > 28 || !/[Xx*•]/.test(value)) return false;
            const digits = value.match(/\d/g) || [];
            return digits.length <= 4 && /(pan|aadhaar|identity|account|licen[cs]e)/i.test(label);
        }).map(([label, value]) => [label, value]);
    }

    function makeText(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        node.textContent = text;
        return node;
    }

    function renderCard(request) {
        const article = document.createElement("article");
        article.className = "admin-request-card";
        const header = document.createElement("header");
        header.className = "admin-request-header";
        const heading = document.createElement("div");
        const service = request.service === "seller" ? "Seller" : request.service === "delivery" ? "Delivery Partner" : "Unknown service";
        heading.append(makeText("p", "admin-request-id", `Request ${request.requestId || request.id || "Unavailable"}`));
        heading.append(makeText("h2", "", service));
        heading.append(makeText("p", "admin-request-date", request.submittedAt ? `Submitted ${new Date(request.submittedAt).toLocaleDateString("en-IN")}` : "Submission date unavailable"));
        const status = normalizedStatus(request.status);
        header.append(heading, makeText("span", `ops-status ${status === "pending" ? "pending" : status === "failed" ? "cancelled" : ""}`, status === "unknown" ? "Status unavailable" : status));
        article.append(header);

        const details = document.createElement("dl");
        details.className = "admin-safe-details";
        const safeFields = [
            ["Name", request.fullName],
            [service === "Seller" ? "Store" : "Vehicle" , service === "Seller" ? request.businessName : request.vehicleType],
            ["City", request.city],
            ["State", request.state],
            ["Email", request.email]
        ];
        safeFields.forEach(([label, value]) => {
            if (typeof value !== "string" || !value.trim() || value.length > 120) return;
            const wrapper = document.createElement("div");
            wrapper.append(makeText("dt", "", label), makeText("dd", "", value));
            details.append(wrapper);
        });
        const masked = safeMaskedDetails(request.maskedDetails);
        masked.forEach(([label, value]) => {
            const wrapper = document.createElement("div");
            wrapper.append(makeText("dt", "", label), makeText("dd", "admin-masked-value", value));
            details.append(wrapper);
        });
        if (details.childElementCount) article.append(details);

        if (typeof request.correctionCode === "string" && status === "failed") {
            const correction = document.createElement("p");
            correction.className = "admin-correction-code";
            correction.textContent = correctionText(request.correctionCode);
            article.append(correction);
        }

        const actions = document.createElement("div");
        actions.className = "admin-request-actions";
        if (["pending", "failed"].includes(status)) {
            actions.append(actionButton("Approve", "approve", request));
            actions.append(actionButton("Reject", "reject", request, true));
            actions.append(actionButton("Request correction", "correction", request, true));
        }
        article.append(actions);
        return article;
    }

    function correctionText(code) {
        const safeText = {
            invalid_profile: "Profile information needs correction.",
            identity_mismatch: "Identity details need review.",
            document_unreadable: "A submitted document needs to be replaced.",
            expired_document: "A current document is required.",
            bank_mismatch: "Bank details need review.",
            rejected: "The provider requested updated information."
        };
        return safeText[code] || "The provider requested a correction. Review the onboarding form for details.";
    }

    function actionButton(label, action, request, needsReason = false) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = action === "approve" ? "service-button" : action === "reject" ? "service-button danger" : "service-button secondary";
        button.textContent = label;
        button.disabled = !endpoint(config.adminActionEndpoint) || !endpoint(config.adminCsrfTokenEndpoint);
        button.addEventListener("click", () => {
            if (needsReason) openActionDialog(request, action);
            else if (window.confirm(`Approve ${request.service} request ${request.requestId || request.id}?`)) sendAction(request, action, "");
        });
        return button;
    }

    function render() {
        const visible = requests.filter((request) => {
            const serviceMatches = serviceFilter === "all" || request.service === serviceFilter;
            const status = normalizedStatus(request.status);
            const statusMatches = statusFilter === "all" || status === statusFilter;
            return serviceMatches && statusMatches;
        });
        if (!visible.length) {
            queue.innerHTML = '<div class="orders-state"><span class="orders-state-icon">✓</span><h2>No requests in this view</h2><p>New authorized verification requests will appear here.</p></div>';
            return;
        }
        queue.replaceChildren(...visible.map(renderCard));
    }

    async function fetchQueue() {
        const queueEndpoint = endpoint(config.adminQueueEndpoint);
        if (!queueEndpoint) {
            if (window.THA_ONE_CORE) {
                let queueList = window.THA_ONE_CORE.getKycQueue();
                if (!queueList || !queueList.length) {
                    // Seed initial verification requests for demonstration
                    queueList = [
                        {
                            id: "KYC-SEL-10492",
                            requestId: "KYC-SEL-10492",
                            service: "seller",
                            submittedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
                            status: "pending",
                            fullName: "Maya Patel",
                            businessName: "Studio Craft & Living",
                            city: "Bengaluru",
                            state: "Karnataka",
                            email: "maya.patel@example.com",
                            maskedDetails: { "PAN": "ABCDE••••F", "Account": "••••••••4819" }
                        },
                        {
                            id: "KYC-DEL-20381",
                            requestId: "KYC-DEL-20381",
                            service: "delivery",
                            submittedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
                            status: "pending",
                            fullName: "Arjun Verma",
                            vehicleType: "Scooter (Electric)",
                            city: "Bengaluru",
                            state: "Karnataka",
                            email: "arjun.verma@example.com",
                            maskedDetails: { "Identity": "••••••••3910", "Licence": "KA04••••2025", "Account": "••••••••9021" }
                        }
                    ];
                    window.THA_ONE_CORE.kycQueue = queueList;
                    window.THA_ONE_CORE.persistKyc();
                }
                requests = queueList;
                gate.hidden = true;
                workspace.hidden = false;
                render();
                return;
            }
            setGate("Verification queue unavailable", "The authorized admin queue API is not configured. No verification requests or sensitive documents are exposed.");
            return;
        }
        setGate("Checking admin access", "Confirming your role with the secure admin service.");
        try {
            const response = await fetch(queueEndpoint, { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
            if (response.status === 401 || response.status === 403) {
                setGate("Admin access required", "Sign in with an account authorized to review verification requests.");
                return;
            }
            if (!response.ok) throw new Error("Queue unavailable");
            const result = await response.json();
            if (result.authorized !== true || !Array.isArray(result.requests)) {
                setGate("Admin access required", "The server did not confirm an authorized verification-review role.");
                return;
            }
            requests = result.requests.filter((request) => request && ["seller", "delivery"].includes(request.service) && typeof (request.requestId || request.id) === "string");
            gate.hidden = true;
            workspace.hidden = false;
            render();
        } catch {
            setGate("Verification queue unavailable", "We couldn’t confirm admin access or load the queue. No request data was displayed.");
        }
    }

    async function csrf() {
        const tokenEndpoint = endpoint(config.adminCsrfTokenEndpoint);
        if (!tokenEndpoint) return "dev_csrf_token_" + Date.now();
        const response = await fetch(tokenEndpoint, { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Could not establish a secure review session.");
        const result = await response.json();
        if (typeof result.csrfToken !== "string" || !result.csrfToken) throw new Error("Could not establish a secure review session.");
        return result.csrfToken;
    }

    function openActionDialog(request, action) {
        activeRequest = request;
        activeAction = action;
        document.getElementById("admin-request-id").value = request.requestId || request.id;
        document.getElementById("admin-action-type").value = action;
        document.getElementById("admin-action-title").textContent = action === "reject" ? "Reject verification" : "Request correction";
        document.getElementById("admin-action-description").textContent = action === "reject" ? "Explain the non-sensitive reason for rejection." : "Explain what needs to be corrected. Do not include document numbers.";
        document.getElementById("admin-correction").value = "";
        document.getElementById("admin-action-error").textContent = "";
        document.getElementById("admin-action-submit").textContent = action === "reject" ? "Reject request" : "Send correction request";
        dialog.showModal();
        document.getElementById("admin-correction").focus();
    }

    async function sendAction(request, action, note) {
        const actionEndpoint = endpoint(config.adminActionEndpoint);
        if (!actionEndpoint) {
            if (window.THA_ONE_CORE) {
                const targetService = request.service === "delivery" ? "deliveryPartner" : "seller";
                const newStatus = action === "verify" ? "verified" : action === "reject" ? "rejected" : "needs_correction";
                window.THA_ONE_CORE.setRoleStatus(targetService, newStatus);
                request.status = newStatus;
                if (note) request.correctionCode = note;
                toast(action === "verify" ? `✓ ${request.service === "seller" ? "Seller" : "Delivery Partner"} approved and verified!` : `Decision recorded: ${newStatus}`);
                dialog.close();
                render();
                return;
            }
            return toast("Secure admin actions are not configured.");
        }
        try {
            csrfToken = await csrf();
            const response = await fetch(actionEndpoint, { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ requestId: request.requestId || request.id, action, correctionNote: note }) });
            if (response.status === 401 || response.status === 403) throw new Error("Admin authorization expired. Sign in again with an authorized account.");
            if (!response.ok) throw new Error("The review action could not be completed. Refresh the queue and try again.");
            const result = await response.json();
            if (!["pending", "failed", "verified"].includes(normalizedStatus(result.status))) throw new Error("The server did not return a valid updated status.");
            toast("Verification decision saved securely.");
            dialog.close();
            await fetchQueue();
        } catch (error) {
            document.getElementById("admin-action-error").textContent = error.message || "The review action could not be completed.";
        }
    }

    document.getElementById("admin-retry").addEventListener("click", fetchQueue);
    document.getElementById("admin-refresh").addEventListener("click", fetchQueue);
    document.querySelectorAll("[data-admin-filter]").forEach((button) => button.addEventListener("click", () => {
        serviceFilter = button.dataset.adminFilter;
        document.querySelectorAll("[data-admin-filter]").forEach((item) => {
            item.classList.toggle("active", item === button);
            item.setAttribute("aria-pressed", String(item === button));
        });
        render();
    }));
    document.getElementById("admin-status-filter").addEventListener("change", (event) => {
        statusFilter = event.currentTarget.value;
        render();
    });
    document.getElementById("admin-action-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const note = document.getElementById("admin-correction").value.trim();
        if (!note) {
            document.getElementById("admin-action-error").textContent = "Add a correction reason before continuing.";
            return;
        }
        sendAction(activeRequest, activeAction, note);
    });
    document.getElementById("admin-dialog-close").addEventListener("click", () => dialog.close());
    document.getElementById("admin-action-cancel").addEventListener("click", () => dialog.close());
    document.getElementById("admin-status-filter").value = "all";
    fetchQueue();
})();

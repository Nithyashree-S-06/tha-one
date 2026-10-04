(() => {
    "use strict";

    const config = window.THA_ONE_KYC_CONFIG || {};
    const service = document.body.dataset.onboarding;
    const form = document.getElementById("onboarding-form");
    const steps = [...document.querySelectorAll("[data-step-panel]")];
    const documentRefs = new Map();
    const previewUrls = new Map();
    let activeStep = 0;
    let identityVerificationId = "";
    let lastServerStatus = "";

    const definitions = {
        seller: {
            submissionEndpoint: config.sellerSubmissionEndpoint,
            dashboard: config.dashboardPaths?.seller || "seller.html",
            statusHeading: "Seller verification",
            sensitiveIds: ["seller-pan-number", "seller-account-number"],
            summary: [
                ["Full name", "seller-full-name"], ["Mobile", "seller-mobile"], ["Email", "seller-email"],
                ["Business", "seller-store-name"], ["Business type", "seller-business-type"], ["Address", "seller-business-address"],
                ["City", "seller-city"], ["State", "seller-state"], ["Pincode", "seller-pincode"], ["PAN", "seller-pan-number", "pan"],
                ["PAN holder", "seller-pan-name"], ["Account holder", "seller-bank-holder"], ["Bank", "seller-bank-name"],
                ["Account", "seller-account-number", "account"], ["IFSC", "seller-ifsc"]
            ],
            collect() {
                return {
                    service: "seller",
                    personal: {
                        fullName: value("seller-full-name"), mobile: value("seller-mobile"), email: value("seller-email"),
                        businessName: value("seller-store-name"), businessAddress: value("seller-business-address"), city: value("seller-city"),
                        state: value("seller-state"), pincode: value("seller-pincode"), businessType: value("seller-business-type")
                    },
                    pan: { holderName: value("seller-pan-name"), number: value("seller-pan-number") },
                    bank: { holderName: value("seller-bank-holder"), bankName: value("seller-bank-name"), accountNumber: value("seller-account-number"), ifsc: value("seller-ifsc") },
                    documentUploadIds: [...documentRefs.entries()].map(([type, uploadId]) => ({ type, uploadId }))
                };
            }
        },
        delivery: {
            submissionEndpoint: config.deliverySubmissionEndpoint,
            dashboard: config.dashboardPaths?.delivery || "delivery.html",
            statusHeading: "Delivery partner verification",
            sensitiveIds: ["delivery-identity-number", "delivery-pan-number", "delivery-licence-number", "delivery-vehicle-registration", "delivery-account-number"],
            summary: [
                ["Full name", "delivery-full-name"], ["Mobile", "delivery-mobile"], ["Email", "delivery-email"], ["Date of birth", "delivery-dob"],
                ["Address", "delivery-address"], ["City", "delivery-city"], ["State", "delivery-state"], ["Pincode", "delivery-pincode"],
                ["Identity document", "delivery-identity-type"], ["Identity number", "delivery-identity-number", "identity"],
                ["PAN holder", "delivery-pan-name"], ["PAN", "delivery-pan-number", "pan"], ["Licence holder", "delivery-licence-name"],
                ["Licence", "delivery-licence-number", "licence"], ["Licence expiry", "delivery-licence-expiry"],
                ["Vehicle type", "delivery-vehicle-type"], ["Vehicle model", "delivery-vehicle-model"], ["Vehicle registration", "delivery-vehicle-registration", "vehicle"],
                ["Account holder", "delivery-bank-holder"], ["Bank", "delivery-bank-name"], ["Account", "delivery-account-number", "account"], ["IFSC", "delivery-ifsc"]
            ],
            collect() {
                return {
                    service: "delivery",
                    personal: {
                        fullName: value("delivery-full-name"), mobile: value("delivery-mobile"), email: value("delivery-email"), dateOfBirth: value("delivery-dob"),
                        address: value("delivery-address"), city: value("delivery-city"), state: value("delivery-state"), pincode: value("delivery-pincode")
                    },
                    identity: { documentType: value("delivery-identity-type"), verificationId: identityVerificationId, consent: document.getElementById("delivery-identity-consent").checked },
                    pan: { holderName: value("delivery-pan-name"), number: value("delivery-pan-number") },
                    drivingLicence: { holderName: value("delivery-licence-name"), number: value("delivery-licence-number"), expiry: value("delivery-licence-expiry") },
                    vehicle: { type: value("delivery-vehicle-type"), model: value("delivery-vehicle-model"), registration: value("delivery-vehicle-registration") },
                    bank: { holderName: value("delivery-bank-holder"), bankName: value("delivery-bank-name"), accountNumber: value("delivery-account-number"), ifsc: value("delivery-ifsc") },
                    documentUploadIds: [...documentRefs.entries()].map(([type, uploadId]) => ({ type, uploadId }))
                };
            }
        }
    };

    const definition = definitions[service];
    if (!definition || !form) return;

    function value(id) {
        return document.getElementById(id)?.value.trim() || "";
    }

    function safeEndpoint(endpoint) {
        if (!endpoint) return null;
        try {
            const url = new URL(endpoint, window.location.href);
            const secure = url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
            const configuredApiOrigin = config.apiOrigin ? new URL(config.apiOrigin, window.location.href).origin : "";
            const explicitlyAllowed = Boolean(configuredApiOrigin) && url.origin === configuredApiOrigin && url.protocol === "https:";
            return secure && (url.origin === window.location.origin || explicitlyAllowed) ? url : null;
        } catch {
            return null;
        }
    }

    async function csrfHeaders() {
        const csrfEndpoint = safeEndpoint(config.csrfTokenEndpoint);
        if (!csrfEndpoint) throw new Error("Secure verification submission is not configured.");
        const response = await fetch(csrfEndpoint, { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Secure verification submission is not configured.");
        const result = await response.json().catch(() => ({}));
        if (typeof result.csrfToken !== "string" || !result.csrfToken) throw new Error("Secure verification submission is not configured.");
        return { "X-CSRF-Token": result.csrfToken };
    }

    function setBanner(message, state = "warning") {
        const banner = document.getElementById("onboarding-status");
        banner.className = `kyc-status-banner ${state}`;
        banner.textContent = message;
    }

    function correctionMessage(code) {
        const messages = {
            invalid_profile: "Check the highlighted profile details and submit them again.",
            identity_mismatch: "The submitted identity details could not be matched. Review the document type and holder name.",
            document_unreadable: "A document could not be read. Upload a clear, supported file and try again.",
            expired_document: "A submitted document has expired. Update it with a current document.",
            bank_mismatch: "The bank details could not be verified. Check the holder name, account number and IFSC.",
            rejected: "The verification provider requested updated information. Review your details and resubmit."
        };
        return messages[code] || "The verification provider needs corrected information. Review your details and contact support if you need help.";
    }

    function normalizedStatus(status) {
        const value = String(status || "").toLowerCase().replace(/[ _-]+/g, "");
        if (value === "verified" || value === "approved") return "verified";
        if (value === "failed" || value === "rejected" || value === "verificationfailed") return "failed";
        if (value === "pending" || value === "pendingverification" || value === "submitted" || value === "inreview") return "pending";
        return "unknown";
    }

    function maskValue(kind, raw) {
        const normalized = String(raw || "").replace(/\s/g, "").toUpperCase();
        if (!normalized) return "Provided";
        if (kind === "pan") return normalized.length >= 10 ? `XXXXX${normalized.slice(5, 9)}X` : "Provided";
        if (kind === "identity") {
            const documentType = value("delivery-identity-type");
            return documentType === "aadhaar" ? `XXXX XXXX ${normalized.slice(-4)}` : `•••• ${normalized.slice(-4)}`;
        }
        return `•••• ${normalized.slice(-4)}`;
    }

    function appendSummaryRow(list, label, display) {
        const row = document.createElement("div");
        const term = document.createElement("dt");
        const valueNode = document.createElement("dd");
        term.textContent = label;
        valueNode.textContent = display;
        row.append(term, valueNode);
        list.append(row);
    }

    function renderReview() {
        const list = document.getElementById(`${service}-review-list`);
        list.replaceChildren();
        definition.summary.forEach(([label, id, mask]) => {
            const raw = value(id);
            const display = mask ? maskValue(mask, raw) : raw || "Not provided";
            appendSummaryRow(list, label, display);
        });
    }

    function showStep(index) {
        activeStep = Math.max(0, Math.min(steps.length - 1, index));
        steps.forEach((step, stepIndex) => {
            const active = stepIndex === activeStep;
            step.hidden = !active;
            step.classList.toggle("active", active);
        });
        document.querySelectorAll("[data-step-indicator]").forEach((indicator) => {
            const stepIndex = Number(indicator.dataset.stepIndicator);
            indicator.classList.toggle("active", stepIndex === activeStep);
            indicator.classList.toggle("complete", stepIndex < activeStep);
            if (stepIndex === activeStep) indicator.setAttribute("aria-current", "step");
            else indicator.removeAttribute("aria-current");
        });
        if (activeStep === steps.length - 1) renderReview();
        steps[activeStep]?.querySelector("input:not([type=hidden]),select,textarea,button")?.focus({ preventScroll: true });
        document.querySelector(".kyc-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function validateStep(index) {
        const panel = steps[index];
        if (service === "delivery" && index === 1) {
            const identityInput = document.getElementById("delivery-identity-number");
            identityInput.pattern = value("delivery-identity-type") === "aadhaar" ? "[0-9]{12}" : "[A-Za-z0-9/-]{5,30}";
        }
        const fields = [...panel.querySelectorAll("input,select,textarea")].filter((field) => field.type !== "file" && !field.disabled && field.type !== "checkbox");
        const invalid = fields.find((field) => !field.checkValidity());
        if (invalid) {
            invalid.reportValidity();
            invalid.focus();
            return false;
        }
        if (service === "delivery" && index === 1) {
            const identityType = value("delivery-identity-type");
            const consent = document.getElementById("delivery-identity-consent");
            if (identityType && !consent.checked) {
                consent.setCustomValidity("Consent is required before identity verification.");
                consent.reportValidity();
                consent.focus();
                return false;
            }
            consent.setCustomValidity("");
            if (identityType === "aadhaar" && !identityVerificationId) {
                const message = document.getElementById("identity-provider-message");
                message.textContent = safeEndpoint(config.identityStartEndpoint)
                    ? "Complete the authorized provider’s consent/OTP step before continuing."
                    : "Authorized Aadhaar verification is not configured. No identity result will be simulated.";
                return false;
            }
        }
        return true;
    }

    function clearSensitiveFields() {
        definition.sensitiveIds.forEach((id) => {
            const input = document.getElementById(id);
            if (input) input.value = "";
        });
    }

    function clearPreview(type) {
        const upload = document.querySelector(`[data-document-type="${CSS.escape(type)}"]`);
        const preview = upload?.querySelector(".kyc-file-preview");
        const url = previewUrls.get(type);
        if (url) URL.revokeObjectURL(url);
        previewUrls.delete(type);
        if (preview) {
            preview.replaceChildren();
            preview.hidden = true;
        }
    }

    async function parseSafeResponse(response) {
        let result = {};
        try { result = await response.json(); } catch { result = {}; }
        if (!response.ok) {
            const error = new Error("Verification request failed.");
            error.code = String(result.code || (response.status === 429 ? "rate_limited" : "request_failed"));
            throw error;
        }
        return result;
    }

    function setResult(result, messageCode = "") {
        const status = normalizedStatus(result.status);
        lastServerStatus = status;
        const panel = document.getElementById("onboarding-result");
        const form = document.getElementById("onboarding-form");
        const title = document.getElementById("onboarding-result-title");
        const message = document.getElementById("onboarding-result-message");
        const dashboard = document.getElementById("onboarding-dashboard-link");
        const retry = document.getElementById("onboarding-retry");
        const details = document.getElementById("onboarding-masked-details");
        details.replaceChildren();
        panel.classList.toggle("failed", status === "failed");
        panel.classList.toggle("pending", status === "pending");
        if (status === "verified") {
            title.textContent = "Verified";
            message.textContent = "Your verification is complete. You can continue to your THA ONE service dashboard.";
            setBanner(`${definition.statusHeading}: Verified`, "success");
            dashboard.href = definition.dashboard;
            dashboard.hidden = false;
            retry.hidden = true;
            form.hidden = true;
            const masked = result.maskedDetails && typeof result.maskedDetails === "object" ? result.maskedDetails : {};
            [["PAN", masked.pan], [service === "delivery" ? "Identity" : "Account", masked.identity || masked.account], ["Bank account", masked.account]].forEach(([label, value]) => {
                if (typeof value === "string" && /[Xx*•]/.test(value)) appendSummaryRow(details, label, value);
            });
        } else if (status === "pending") {
            title.textContent = "Pending Verification";
            message.textContent = "Your information has been received. We’ll update this page when the authorized verification service responds.";
            setBanner(`${definition.statusHeading}: Pending Verification`, "warning");
            dashboard.hidden = true;
            retry.hidden = false;
            form.hidden = true;
        } else if (status === "failed") {
            title.textContent = "Verification Failed";
            message.textContent = correctionMessage(messageCode || result.correctionCode);
            setBanner(`${definition.statusHeading}: Verification Failed. Review the correction guidance and update your details.`, "error");
            dashboard.hidden = true;
            retry.hidden = false;
            form.hidden = false;
        } else {
            panel.hidden = true;
            form.hidden = false;
            dashboard.hidden = true;
        }
        panel.hidden = false;
    }

    async function refreshStatus() {
        const endpoint = safeEndpoint(config.statusEndpoint);
        if (!endpoint) {
            if (window.THA_ONE_CORE) {
                const status = window.THA_ONE_CORE.getRoleStatus(service);
                if (status.status === "pending" || status.status === "verified" || status.status === "failed" || status.status === "needs_correction") {
                    setResult({ status: status.status === "needs_correction" ? "failed" : status.status, correctionCode: "correction_requested" });
                    return;
                }
            }
            setBanner("Development simulation active: Complete the onboarding form to submit your verification request.", "warning");
            return;
        }
        endpoint.searchParams.set("service", service);
        try {
            const response = await fetch(endpoint, { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
            const result = await parseSafeResponse(response);
            const status = normalizedStatus(result.status);
            if (status === "pending" || status === "verified" || status === "failed") setResult(result);
            else setBanner("Verification status could not be confirmed. Please refresh or contact support.", "warning");
        } catch {
            setBanner("We couldn’t check verification status. No dashboard access was granted; try again shortly.", "error");
            document.getElementById("onboarding-result").hidden = false;
            document.getElementById("onboarding-result-title").textContent = "Status unavailable";
            document.getElementById("onboarding-result-message").textContent = "Your verification status could not be confirmed. No verification result has been assumed.";
            document.getElementById("onboarding-retry").hidden = false;
            document.getElementById("onboarding-dashboard-link").hidden = true;
        }
    }

    async function xhrUpload(endpoint, file, type, progress, status) {
        const csrf = await csrfHeaders();
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.open("POST", endpoint.href);
            request.withCredentials = true;
            request.setRequestHeader("Accept", "application/json");
            request.setRequestHeader("X-CSRF-Token", csrf["X-CSRF-Token"]);
            request.upload.addEventListener("progress", (event) => {
                if (!event.lengthComputable) return;
                const percent = Math.round((event.loaded / event.total) * 100);
                progress.value = percent;
                status.textContent = `Secure upload ${percent}%`;
            });
            request.addEventListener("load", () => {
                let result = {};
                try { result = JSON.parse(request.responseText); } catch { result = {}; }
                if (request.status < 200 || request.status >= 300 || typeof result.uploadId !== "string") {
                    reject(new Error("Secure upload did not complete. Please try again."));
                    return;
                }
                resolve(result);
            });
            request.addEventListener("error", () => reject(new Error("Secure upload failed. Check your connection and try again.")));
            request.addEventListener("abort", () => reject(new Error("Upload cancelled.")));
            const body = new FormData();
            body.append("service", service);
            body.append("documentType", type);
            body.append("document", file, "verification-document");
            request.send(body);
        });
    }

    function configureUploads() {
        const endpoint = safeEndpoint(config.documentUploadEndpoint);
        document.querySelectorAll(".kyc-upload").forEach((upload) => {
            const type = upload.dataset.documentType;
            const input = upload.querySelector('input[type="file"]');
            const status = upload.querySelector(".kyc-file-status");
            const progress = upload.querySelector(".kyc-upload-progress");
            const preview = upload.querySelector(".kyc-file-preview");
            const remove = upload.querySelector(".kyc-remove-document");
            if (!endpoint) {
                status.textContent = "Development mode: Documents selected will be simulated for verification review.";
            }
            input.addEventListener("change", async () => {
                const file = input.files?.[0];
                if (!file) return;
                if (!endpoint) {
                    documentRefs.set(type, "doc_sim_" + Date.now());
                    const url = file.type.startsWith("image/") ? URL.createObjectURL(file) : "";
                    if (url) previewUrls.set(type, url);
                    preview.replaceChildren();
                    if (url) {
                        const image = document.createElement("img");
                        image.src = url;
                        image.alt = "Private document preview";
                        preview.append(image);
                    }
                    const label = document.createElement("span");
                    label.textContent = "Document staged for verification review.";
                    preview.append(label);
                    preview.hidden = false;
                    status.textContent = "Document selected (development simulation).";
                    remove.hidden = false;
                    remove.disabled = false;
                    return;
                }
                if (!config.acceptedDocumentTypes?.includes(file.type) || file.size > Number(config.maxDocumentBytes || 0)) {
                    input.value = "";
                    status.textContent = "Choose a supported file under 5 MB.";
                    return;
                }
                if (documentRefs.has(type)) {
                    if (!safeEndpoint(config.documentDeleteEndpoint)) {
                        input.value = "";
                        status.textContent = "Document replacement is unavailable until secure document deletion is configured.";
                        return;
                    }
                    await removeUpload(type, upload, false);
                }
                progress.hidden = false;
                progress.value = 0;
                input.disabled = true;
                status.textContent = "Preparing secure upload…";
                try {
                    const response = await xhrUpload(endpoint, file, type, progress, status);
                    documentRefs.set(type, response.uploadId);
                    const url = file.type.startsWith("image/") ? URL.createObjectURL(file) : "";
                    if (url) previewUrls.set(type, url);
                    preview.replaceChildren();
                    if (url) {
                        const image = document.createElement("img");
                        image.src = url;
                        image.alt = "Private document preview";
                        preview.append(image);
                    }
                    const label = document.createElement("span");
                    label.textContent = "Uploaded to private verification storage.";
                    preview.append(label);
                    preview.hidden = false;
                    status.textContent = "Upload complete. The file is not publicly accessible.";
                    remove.hidden = false;
                    remove.disabled = !safeEndpoint(config.documentDeleteEndpoint);
                } catch (error) {
                    status.textContent = error.message;
                    progress.value = 0;
                } finally {
                    input.disabled = false;
                    input.value = "";
                }
            });
            remove.addEventListener("click", () => removeUpload(type, upload, true));
        });
    }

    async function removeUpload(type, upload, showMessage) {
        const uploadId = documentRefs.get(type);
        if (!uploadId) return;
        const endpoint = safeEndpoint(config.documentDeleteEndpoint);
        const status = upload.querySelector(".kyc-file-status");
        if (!endpoint) {
            status.textContent = "Document removal is unavailable until a secure deletion service is configured.";
            return;
        }
        const button = upload.querySelector(".kyc-remove-document");
        button.disabled = true;
        try {
            const csrf = await csrfHeaders();
            const response = await fetch(endpoint, { method: "DELETE", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json", Accept: "application/json", ...csrf }, body: JSON.stringify({ service, uploadId }) });
            if (!response.ok) throw new Error("The private document could not be removed. Please try again.");
            documentRefs.delete(type);
            clearPreview(type);
            upload.querySelector(".kyc-upload-progress").hidden = true;
            button.hidden = true;
            status.textContent = showMessage ? "Private document removed." : "Select a replacement document.";
        } catch (error) {
            status.textContent = error.message;
        } finally {
            button.disabled = false;
        }
    }

    function setupIdentityProvider() {
        if (service !== "delivery") return;
        const endpoint = safeEndpoint(config.identityStartEndpoint);
        const button = document.getElementById("delivery-identity-start");
        const consent = document.getElementById("delivery-identity-consent");
        const type = document.getElementById("delivery-identity-type");
        const number = document.getElementById("delivery-identity-number");
        const message = document.getElementById("identity-provider-message");
        if (!endpoint) {
            message.textContent = "Development simulation: Click start to simulate consent-based identity verification.";
        }
        const updateButton = () => { button.disabled = !consent.checked || !type.value || !number.value.trim(); };
        [consent, type, number].forEach((field) => field.addEventListener("input", updateButton));
        updateButton();
        button.addEventListener("click", async () => {
            if (!consent.checked || !type.value || !number.value.trim()) return;
            if (!endpoint) {
                button.disabled = true;
                button.textContent = "Verifying…";
                message.textContent = "Simulating authorized identity provider check…";
                setTimeout(() => {
                    identityVerificationId = "id_sim_" + Date.now();
                    number.value = "";
                    message.textContent = "Identity verification step complete (Development simulation).";
                    button.textContent = "Verified ✓";
                    button.disabled = true;
                }, 600);
                return;
            }
            button.disabled = true;
            button.textContent = "Connecting securely…";
            message.textContent = "Contacting the authorized identity provider. Follow its consent/OTP prompts.";
            try {
                const csrf = await csrfHeaders();
                const response = await fetch(endpoint, { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json", Accept: "application/json", ...csrf }, body: JSON.stringify({ service, documentType: type.value, documentNumber: number.value.trim(), consent: true }) });
                const result = await parseSafeResponse(response);
                if (typeof result.verificationId !== "string" || !["pending", "verified"].includes(normalizedStatus(result.status))) throw new Error("The identity provider did not return a valid verification session.");
                identityVerificationId = result.verificationId;
                number.value = "";
                message.textContent = normalizedStatus(result.status) === "verified" ? "Identity step complete. A masked identity reference will appear after overall review." : "Identity consent/OTP step started. Complete any provider prompts to continue.";
            } catch {
                number.value = "";
                message.textContent = "Identity verification could not be started. No verification result was assumed; try again later.";
            } finally {
                button.textContent = "Start secure verification";
                updateButton();
            }
        });
    }

    function validateSensitiveFields() {
        const current = steps[activeStep];
        const invalid = [...current.querySelectorAll(".kyc-sensitive")].find((input) => input.required && !input.checkValidity());
        if (invalid) {
            invalid.reportValidity();
            invalid.focus();
            return false;
        }
        return true;
    }

    function clearObjectStrings(valueToClear) {
        if (!valueToClear || typeof valueToClear !== "object") return;
        Object.keys(valueToClear).forEach((key) => {
            if (typeof valueToClear[key] === "string") valueToClear[key] = "";
            else clearObjectStrings(valueToClear[key]);
        });
    }

    function serverErrorMessage(code) {
        if (code === "rate_limited") return "Too many verification attempts. Wait a while and try again.";
        if (code === "correction_required") return correctionMessage("rejected");
        if (code === "unauthorized") return "Your session could not be verified. Sign in again before continuing.";
        return "We couldn’t submit your verification. Your sensitive values were cleared; check your details and try again.";
    }

    async function submitVerification(event) {
        event.preventDefault();
        const consent = document.getElementById(`${service}-consent`) || document.getElementById(`${service}-final-consent`);
        const errorNode = document.getElementById(`${service}-submit-error`);
        const button = document.getElementById(`${service}-submit`);
        const endpoint = safeEndpoint(definition.submissionEndpoint);
        errorNode.textContent = "";
        if (!validateSensitiveFields()) return;
        if (!consent?.checked) {
            errorNode.textContent = "Please confirm the consent statement before submitting.";
            consent?.focus();
            return;
        }
        if (!endpoint) {
            if (window.THA_ONE_CORE) {
                const payload = definition.collect();
                button.disabled = true;
                button.textContent = "Submitting securely…";
                setBanner("Submitting to the authorized verification service…", "warning");
                try {
                    const result = window.THA_ONE_CORE.submitKyc(service, payload);
                    setResult(result);
                } catch (err) {
                    errorNode.textContent = err.message || "Submission failed. Please check your details.";
                } finally {
                    clearSensitiveFields();
                    button.disabled = false;
                    button.textContent = "Submit for verification";
                }
                return;
            }
            errorNode.textContent = "Secure verification submission is not configured. No information has been sent or saved.";
            clearSensitiveFields();
            return;
        }

        const payload = definition.collect();
        button.disabled = true;
        button.textContent = "Submitting securely…";
        setBanner("Submitting to the authorized verification service…", "warning");
        try {
            const csrf = await csrfHeaders();
            const response = await fetch(endpoint, { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json", Accept: "application/json", ...csrf }, body: JSON.stringify(payload) });
            const result = await parseSafeResponse(response);
            const status = normalizedStatus(result.status);
            if (!["pending", "verified", "failed"].includes(status)) throw new Error("The verification service returned no recognized status.");
            if (status === "failed") setResult(result, result.correctionCode);
            else setResult(result);
        } catch (error) {
            errorNode.textContent = error.code ? serverErrorMessage(error.code) : "We couldn’t confirm the submission. No verification result was assumed; check status or try again.";
            setBanner("Verification status could not be confirmed. No dashboard access was granted.", "error");
        } finally {
            definition.sensitiveIds.forEach((id) => {
                const input = document.getElementById(id);
                if (input) input.value = "";
            });
            document.querySelectorAll(".kyc-upload").forEach((upload) => {
                const type = upload.dataset.documentType;
                const fileInput = upload.querySelector('input[type="file"]');
                if (fileInput) fileInput.value = "";
                clearPreview(type);
                upload.querySelector(".kyc-upload-progress").hidden = true;
                if (documentRefs.has(type)) upload.querySelector(".kyc-file-status").textContent = "Document stored in private verification storage. Preview cleared.";
            });
            clearObjectStrings(payload);
            identityVerificationId = "";
            button.disabled = false;
            button.textContent = "Submit for verification";
        }
    }

    function bindSteps() {
        document.querySelectorAll("[data-step-next]").forEach((button) => button.addEventListener("click", () => {
            if (!validateStep(activeStep) || !validateSensitiveFields()) return;
            showStep(activeStep + 1);
        }));
        document.querySelectorAll("[data-step-back]").forEach((button) => button.addEventListener("click", () => showStep(activeStep - 1)));
        form.addEventListener("submit", submitVerification);
        document.getElementById("onboarding-retry").addEventListener("click", refreshStatus);
    }

    async function init() {
        configureUploads();
        setupIdentityProvider();
        bindSteps();
        if (!safeEndpoint(config.statusEndpoint)) {
            setBanner("Verification service is not configured. You can review this flow, but no identity data or documents will be sent or saved.", "warning");
        }
        await refreshStatus();
    }

    init();
})();

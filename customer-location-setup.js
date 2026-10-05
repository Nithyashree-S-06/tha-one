(() => {
    "use strict";

    const api = window.THA_ONE_API;
    const state = { profile: null, addresses: [], selectedAddressId: "", preview: null };
    const params = new URLSearchParams(window.location.search);

    function node(id) { return document.getElementById(id); }

    function setMessage(target, message, kind = "") {
        target.textContent = message;
        target.className = `location-status${kind ? ` ${kind}` : ""}`;
    }

    function validPincode(value) { return /^\d{6}$/.test(String(value || "")); }

    function safeReturnTo() {
        const value = params.get("returnTo") || "home.html";
        if (!value || value.startsWith("/") || value.includes("\\") || /^[a-z][a-z\d+.-]*:/i.test(value)) return "home.html";
        return value;
    }

    function updatePreview(result, target) {
        const location = result.location || result;
        const pincode = String(location.pincode || "");
        if (!location.city || !location.state || !validPincode(pincode)) {
            throw new Error("The location service returned incomplete address details. Try another method.");
        }
        state.preview = {
            area: String(location.area || location.locality || "").trim(),
            city: String(location.city).trim(),
            state: String(location.state).trim(),
            pincode
        };
        target.area.textContent = state.preview.area || "Not provided";
        target.city.textContent = state.preview.city;
        target.state.textContent = state.preview.state;
        target.pincode.textContent = state.preview.pincode;
        target.container.hidden = false;
    }

    async function lookupPincode(pincode) {
        if (!validPincode(pincode)) throw new Error("Enter a valid 6-digit Indian pincode.");
        const result = await api.request("pincodeLookupEndpoint", {
            method: "POST",
            body: { pincode }
        });
        const location = result.location || result;
        if (String(location.pincode || "") !== pincode) {
            throw new Error("The location service did not confirm that pincode.");
        }
        return result;
    }

    async function checkAvailability(pincode) {
        const statuses = [];
        for (const service of ["shopping", "food"]) {
            try {
                const result = await api.request("serviceabilityEndpoint", {
                    method: "POST",
                    body: { service, pincode }
                });
                statuses.push({
                    label: service === "food" ? "Food" : "Shopping",
                    text: result.available === true ? "available" : "currently unavailable",
                    confirmed: true,
                    available: result.available === true
                });
            } catch {
                statuses.push({
                    label: service === "food" ? "Food" : "Shopping",
                    text: "availability will be checked before checkout",
                    confirmed: false,
                    available: false
                });
            }
        }
        return {
            message: statuses.map((status) => `${status.label}: ${status.text}`).join(" · "),
            hasUnavailableService: statuses.some((status) => status.confirmed && !status.available),
            allConfirmed: statuses.every((status) => status.confirmed)
        };
    }

    function addressFromFields(prefix, areaOverride = "") {
        const house = node(`${prefix}-house`).value.trim();
        const area = node(`${prefix}-area`).value.trim() || areaOverride;
        return {
            id: "",
            label: node(`${prefix}-label`).value,
            recipientName: node(`${prefix}-recipient`).value.trim(),
            phone: node(`${prefix}-phone`).value.trim(),
            line1: house,
            area,
            landmark: node(`${prefix}-landmark`).value.trim(),
            city: node(`${prefix}-city`).value.trim(),
            state: node(`${prefix}-state`).value.trim(),
            pincode: node(`${prefix}-pincode`).value.trim(),
            isDefault: true
        };
    }

    function populateManualFields(location) {
        node("manual-recipient").value = state.profile?.fullName || "";
        node("manual-phone").value = state.profile?.mobile || "";
        node("manual-area").value = location.area || location.locality || "";
        node("manual-city").value = location.city || "";
        node("manual-state").value = location.state || "";
        node("manual-pincode").value = location.pincode || "";
    }

    async function persistAddress(address) {
        if (!address.recipientName || !address.phone || !address.line1 || (!address.area && !address.id) || !address.city || !address.state || !validPincode(address.pincode)) {
            throw new Error("Complete the required address fields and check the 6-digit pincode.");
        }
        const result = await api.request("addressUpsertEndpoint", {
            method: "POST",
            body: { ...address, isDefault: true }
        });
        if (!Array.isArray(result.addresses)) throw new Error("The address service did not confirm the saved address.");
        state.addresses = result.addresses;
        const availability = await checkAvailability(address.pincode);
        setMessage(node("location-status"), availability.message, availability.hasUnavailableService ? "warning" : availability.allConfirmed ? "success" : "");
        window.setTimeout(() => window.location.assign(safeReturnTo()), 700);
    }

    function renderSavedAddresses() {
        const section = node("saved-address-section");
        const list = node("saved-location-list");
        section.hidden = !state.addresses.length;
        if (!state.selectedAddressId && state.addresses.length) {
            state.selectedAddressId = (state.addresses.find((address) => address.isDefault === true) || state.addresses[0]).id;
        }
        list.replaceChildren(...state.addresses.map((address) => {
            const label = document.createElement("label");
            label.className = "saved-location-option";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "saved-location";
            radio.value = address.id;
            radio.checked = address.id === state.selectedAddressId;
            radio.addEventListener("change", () => {
                state.selectedAddressId = address.id;
                node("use-saved-address").disabled = false;
            });
            const details = document.createElement("span");
            const name = document.createElement("strong");
            name.textContent = `${address.label || "Address"} · ${address.city}, ${address.pincode}`;
            const summary = document.createElement("small");
            summary.textContent = `${address.recipientName} · ${[address.line1, address.area, address.landmark, address.state].filter(Boolean).join(", ")}`;
            details.append(name, summary);
            label.append(radio, details);
            if (address.isDefault) {
                const badge = document.createElement("span");
                badge.className = "address-default";
                badge.textContent = "Default";
                label.append(badge);
            }
            return label;
        }));
        node("use-saved-address").disabled = !state.selectedAddressId;
    }

    async function loadAccount() {
        const [profile, addresses] = await Promise.all([
            api.request("profileEndpoint"),
            api.request("addressesEndpoint")
        ]);
        if (profile.authenticated !== true) throw new Error("Sign in to save a delivery address.");
        state.profile = profile.profile || {};
        state.addresses = Array.isArray(addresses.addresses) ? addresses.addresses : [];
        renderSavedAddresses();
        node("manual-recipient").value = state.profile.fullName || "";
        node("manual-phone").value = state.profile.mobile || "";
    }

    function bindPincodeLookup() {
        node("edit-pincode-address").addEventListener("click", () => node("manual-location-panel").scrollIntoView({ behavior: "smooth", block: "start" }));
        node("lookup-pincode").addEventListener("input", () => {
            state.preview = null;
            node("pincode-result").hidden = true;
        });
        node("pincode-lookup-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const input = node("lookup-pincode");
            const message = node("pincode-message");
            const pincode = input.value.trim();
            if (!validPincode(pincode)) {
                input.setAttribute("aria-invalid", "true");
                setMessage(message, "Enter exactly 6 digits for an Indian pincode.", "error");
                input.focus();
                return;
            }
            input.setAttribute("aria-invalid", "false");
            node("lookup-pincode-button").disabled = true;
            try {
                const result = await lookupPincode(pincode);
                updatePreview(result, {
                    container: node("pincode-result"),
                    area: node("pincode-area"),
                    city: node("pincode-city"),
                    state: node("pincode-state"),
                    pincode: node("pincode-value")
                });
                populateManualFields(state.preview);
                setMessage(message, "Confirm the resolved location or edit the full address manually.");
            } catch (error) {
                node("pincode-result").hidden = true;
                setMessage(message, error.message || "We couldn’t resolve that pincode. Try again or enter an address manually.", "error");
            } finally {
                node("lookup-pincode-button").disabled = false;
            }
        });

        node("confirm-pincode-location").addEventListener("click", async () => {
            try {
                if (!state.preview || node("manual-pincode").value.trim() !== state.preview.pincode) {
                    throw new Error("Search and confirm the current pincode before saving its location.");
                }
                const address = addressFromFields("manual", state.preview?.area || "");
                await persistAddress(address);
            } catch (error) {
                setMessage(node("pincode-message"), error.message, "error");
                node("manual-location-panel").scrollIntoView({ behavior: "smooth", block: "start" });
            }
        });
    }

    function bindManualAddress() {
        node("manual-address-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const pincodeInput = node("manual-pincode");
            if (!validPincode(pincodeInput.value.trim())) {
                pincodeInput.setAttribute("aria-invalid", "true");
                setMessage(node("manual-message"), "Enter exactly 6 digits for an Indian pincode.", "error");
                pincodeInput.focus();
                return;
            }
            pincodeInput.setAttribute("aria-invalid", "false");
            try {
                await persistAddress(addressFromFields("manual"));
            } catch (error) {
                setMessage(node("manual-message"), error.message, "error");
            }
        });
    }

    function bindSavedAddress() {
        node("use-saved-address").addEventListener("click", async () => {
            const address = state.addresses.find((item) => item.id === state.selectedAddressId);
            if (!address) return;
            try {
                await persistAddress({ ...address, isDefault: true });
            } catch (error) {
                setMessage(node("location-status"), error.message, "error");
            }
        });
    }

    function init() {
        node("select-manual-location").addEventListener("click", () => node("manual-location-panel").scrollIntoView({ behavior: "smooth", block: "start" }));
        bindPincodeLookup();
        bindManualAddress();
        bindSavedAddress();
        loadAccount().catch((error) => setMessage(node("location-status"), error.message || "Your address service is unavailable.", "error"));
    }

    init();
})();
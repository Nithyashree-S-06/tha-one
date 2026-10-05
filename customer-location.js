(() => {
    "use strict";

    const state = { address: null, loadPromise: null };
    const api = window.THA_ONE_API;

    function displayLocation(address) {
        return address ? [address.city, address.pincode].filter(Boolean).join(", ") : "Set your delivery location";
    }

    async function loadAddress(force = false) {
        if (state.loadPromise && !force) return state.loadPromise;
        state.loadPromise = api.request("addressesEndpoint").then((response) => {
            const addresses = Array.isArray(response.addresses) ? response.addresses : [];
            state.address = addresses.find((address) => address.isDefault === true) || addresses[0] || null;
            document.querySelectorAll(".location-select").forEach((button) => {
                const label = button.querySelector("[data-customer-location-label]") || button.querySelector("strong");
                if (label) label.textContent = displayLocation(state.address);
                button.setAttribute("aria-label", state.address
                    ? `Change delivery location, currently ${displayLocation(state.address)}`
                    : "Set your delivery location");
            });
            window.dispatchEvent(new CustomEvent("tha-one-location-ready", { detail: { address: state.address } }));
            return state.address;
        }).catch(() => {
            state.address = null;
            document.querySelectorAll(".location-select strong").forEach((label) => { label.textContent = "Set your delivery location"; });
            return null;
        });
        return state.loadPromise;
    }

    function setupPath() {
        const returnTo = `${window.location.pathname.split("/").pop() || "home.html"}${window.location.search}${window.location.hash}`;
        return `customer-location-setup.html?returnTo=${encodeURIComponent(returnTo)}`;
    }

    function bindHeaders() {
        document.querySelectorAll(".location-select").forEach((button) => {
            if (button.dataset.locationBound === "true") return;
            button.dataset.locationBound = "true";
            button.addEventListener("click", () => window.location.assign(setupPath()));
        });
        loadAddress();
    }

    async function checkAvailability(service, selection = {}) {
        const address = await loadAddress();
        if (!address?.pincode) {
            return { available: false, verified: false, message: "Set your delivery location to check availability." };
        }
        try {
            const result = await api.request("serviceabilityEndpoint", {
                method: "POST",
                body: { service, pincode: address.pincode, ...selection }
            });
            const unavailableIds = [
                ...(result.unavailableItemIds || []),
                ...(result.unavailableProductIds || []),
                ...(result.unavailableDishIds || []),
                ...(result.unavailableRestaurantIds || [])
            ];
            const selectedIds = Object.values(selection).flat();
            const itemUnavailable = selectedIds.some((id) => unavailableIds.includes(id));
            return {
                ...result,
                verified: true,
                available: result.available === true && !itemUnavailable,
                message: result.message || (result.available === true && !itemUnavailable ? "" : "Currently unavailable at your location.")
            };
        } catch {
            return { available: false, verified: false, message: "Delivery availability could not be confirmed. Try again shortly." };
        }
    }

    window.THA_ONE_LOCATION = Object.freeze({ bindHeaders, loadAddress, checkAvailability });
})();
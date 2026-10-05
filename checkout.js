(() => {
    "use strict";

    const params = new URLSearchParams(location.search);
    const service = params.get("service") === "food" ? "food" : "shopping";
    const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
    const products = window.THA_ONE_PRODUCTS || [];
    const foodCatalog = window.THA_ONE_FOOD || { dishes: [], restaurants: [] };
    const cartKey = service === "food" ? "tha-one-food-cart" : "tha-one-cart";

    const state = {
        items: readCart(),
        addresses: [],
        selectedAddress: null,
        address: null,
        selectedMethod: "upi_gpay",
        upiVpa: "",
        selectedBank: "HDFC Bank",
        step: "address",
        customerReady: false,
        quote: null,
        serviceability: null,
        activePayment: null,
        activeOrder: null,
        pollTimeout: null,
        paymentPolling: false,
        codEnabled: false,
        addressPickerOpen: false
    };

    const methodLabels = {
        upi_gpay: "Google Pay (UPI)",
        upi_phonepe: "PhonePe (UPI)",
        upi_paytm: "Paytm (UPI)",
        upi_bhim: "BHIM (UPI)",
        upi_custom: "Other UPI",
        card_credit: "Credit Card",
        card_debit: "Debit Card",
        netbanking: "Net Banking",
        cod: "Cash on Delivery"
    };

    function readCart() {
        try {
            const parsed = JSON.parse(localStorage.getItem(cartKey) || "[]");
            return Array.isArray(parsed) ? parsed.filter((item) => item && Number(item.quantity) > 0) : [];
        } catch { return []; }
    }

    function clearCart() {
        try { localStorage.removeItem(cartKey); } catch {}
    }

    function productFor(item) {
        return service === "food"
            ? foodCatalog.dishes.find((dish) => dish.id === item.dishId)
            : products.find((product) => product.id === item.id);
    }

    function setStatus(message, kind = "info") {
        const status = document.getElementById("checkout-status");
        if (!status) return;
        status.className = `checkout-status ${kind}`;
        status.textContent = message;
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    }

    function hasValidAmount(value) {
        return value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));
    }

    // --- CART & QUOTE RENDERING ---

    function renderCart() {
        const container = document.getElementById("checkout-cart-items");
        if (!container) return;

        if (!state.items.length) {
            container.innerHTML = `<div class="checkout-empty">
                <strong>Your cart is empty.</strong>
                <a href="${service === 'food' ? 'food.html' : 'home.html'}">Continue ${service === 'food' ? 'Ordering Food' : 'Shopping'}</a>
            </div>`;
            const placeOrderBtn = document.getElementById("checkout-place-order");
            if (placeOrderBtn) placeOrderBtn.disabled = true;
            return;
        }

        const lines = state.items.map((item) => {
            const product = productFor(item);
            if (!product) return "";
            const name = product.name || "Item";
            const img = product.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=120&q=80";
            return `<div class="checkout-cart-line">
                <img src="${escapeHtml(img)}" alt="${escapeHtml(name)}">
                <div>
                    <strong>${escapeHtml(name)}</strong>
                    <small>${item.option ? `${escapeHtml(item.option)} · ` : item.variant ? `${escapeHtml(item.variant)} · ` : ""}Qty ${Number(item.quantity)}</small>
                </div>
                <b>${money.format((Number(product.price) || 0) * Number(item.quantity))}</b>
            </div>`;
        }).join("");

        container.innerHTML = lines || '<div class="checkout-empty">Cart items are currently unavailable.</div>';

        const localSubtotal = state.items.reduce((sum, item) => sum + (Number(productFor(item)?.price) || 0) * Number(item.quantity), 0);
        const subtotal = Number.isFinite(Number(state.quote?.subtotal)) ? Number(state.quote.subtotal) : localSubtotal;
        const quoteReady = hasValidAmount(state.quote?.total) && hasValidAmount(state.quote?.deliveryFee);
        const deliveryFee = quoteReady ? Number(state.quote.deliveryFee) : null;
        const discount = quoteReady ? Number(state.quote.discount || 0) : null;
        const grandTotal = quoteReady ? Number(state.quote.total) : null;

        document.getElementById("checkout-subtotal").textContent = money.format(subtotal);
        document.getElementById("checkout-delivery").textContent = quoteReady ? (deliveryFee === 0 ? "FREE" : money.format(deliveryFee)) : "Confirming with delivery service";
        document.getElementById("checkout-discount").textContent = quoteReady && discount > 0 ? `−${money.format(discount)}` : quoteReady ? "None" : "Confirming at checkout";
        document.getElementById("checkout-total").textContent = quoteReady ? money.format(grandTotal) : "Awaiting quote";
        document.getElementById("checkout-estimate").textContent = state.quote?.estimatedDelivery || state.serviceability?.estimatedDelivery || state.serviceability?.eta || "Confirmed by delivery service";
        const placeOrderButton = document.getElementById("checkout-place-order");
        if (placeOrderButton) placeOrderButton.disabled = !quoteReady || state.serviceability?.available !== true || !state.items.length;

        // Update button text in review
        const placeBtnText = document.getElementById("place-order-text");
        if (placeBtnText) {
            placeBtnText.textContent = !quoteReady
                ? "Waiting for delivery quote"
                : state.selectedMethod === "cod"
                ? `Confirm Order (${money.format(grandTotal)} via COD)`
                : `Pay ${money.format(grandTotal)} Securely`;
        }
    }

    // --- STEP NAVIGATION ---

    function setStep(name) {
        state.step = name;
        document.querySelectorAll("[data-checkout-step]").forEach((section) => {
            const active = section.dataset.checkoutStep === name;
            section.hidden = !active;
            section.classList.toggle("active", active);
        });
        document.querySelectorAll("[data-checkout-progress]").forEach((indicator) => {
            const order = ["address", "payment", "review"];
            const currentIndex = order.indexOf(name);
            const index = order.indexOf(indicator.dataset.checkoutProgress);
            indicator.classList.toggle("active", index === currentIndex);
            indicator.classList.toggle("complete", index < currentIndex);
        });
        document.querySelector(".checkout-page-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // --- ADDRESS MANAGEMENT ---

    function currentAddress() {
        return {
            id: state.selectedAddress,
            recipientName: document.getElementById("checkout-recipient").value.trim(),
            phone: document.getElementById("checkout-phone").value.trim(),
            line1: document.getElementById("checkout-address-line").value.trim(),
            area: document.getElementById("checkout-area").value.trim(),
            landmark: document.getElementById("checkout-landmark").value.trim(),
            city: document.getElementById("checkout-city").value.trim(),
            state: document.getElementById("checkout-state").value.trim(),
            pincode: document.getElementById("checkout-pincode").value.trim()
        };
    }

    function fillAddress(address) {
        state.selectedAddress = address.id || null;
        state.serviceability = null;
        document.getElementById("checkout-recipient").value = address.recipientName || "";
        document.getElementById("checkout-phone").value = address.phone || "";
        document.getElementById("checkout-address-line").value = address.line1 || "";
        document.getElementById("checkout-area").value = address.area || "";
        document.getElementById("checkout-area").required = Boolean(address.area) || !address.id;
        document.getElementById("checkout-landmark").value = address.landmark || "";
        document.getElementById("checkout-city").value = address.city || "";
        document.getElementById("checkout-state").value = address.state || "";
        document.getElementById("checkout-pincode").value = address.pincode || "";
        renderSavedAddresses();
    }

    function renderSavedAddresses() {
        const container = document.getElementById("saved-addresses");
        if (!container) return;
        container.replaceChildren();

        if (!state.addresses.length) {
            container.style.display = "none";
            document.getElementById("checkout-change-address").hidden = true;
            return;
        }
        document.getElementById("checkout-change-address").hidden = false;
        container.style.display = state.addressPickerOpen ? "grid" : "none";

        state.addresses.forEach((address) => {
            const label = document.createElement("label");
            label.className = "saved-address-option";
            const input = document.createElement("input");
            input.type = "radio";
            input.name = "saved-address";
            input.checked = state.selectedAddress === address.id;
            input.addEventListener("change", () => {
                state.addressPickerOpen = false;
                fillAddress(address);
            });

            const copy = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = `${address.label || "Saved Address"} ${address.isDefault ? "★ Default" : ""}`;
            const summary = document.createElement("small");
            summary.textContent = `${address.recipientName} · ${address.phone}\n${[address.line1, address.area, address.landmark, address.city, address.state, address.pincode].filter(Boolean).join(", ")}`;
            copy.append(title, summary);
            label.append(input, copy);
            container.append(label);
        });
    }

    async function loadCustomerData() {
        try {
            const profile = await window.THA_ONE_API.request("profileEndpoint");
            if (profile.authenticated !== true) throw new Error("Sign in to continue checkout.");
            state.customerReady = true;
            const recipient = profile.profile || {};
            if (!document.getElementById("checkout-recipient").value) {
                document.getElementById("checkout-recipient").value = recipient.fullName || "";
            }
            if (!document.getElementById("checkout-phone").value) {
                document.getElementById("checkout-phone").value = recipient.mobile || "";
            }
        } catch (error) {
            setStatus("Please sign in to proceed with checkout.", "warning");
            const placeBtn = document.getElementById("checkout-place-order");
            if (placeBtn) placeBtn.disabled = true;
            return;
        }

        try {
            const response = await window.THA_ONE_API.request("addressesEndpoint");
            state.addresses = Array.isArray(response.addresses) ? response.addresses : [];
            renderSavedAddresses();
            const defaultAddress = state.addresses.find((address) => address.isDefault) || state.addresses[0];
            if (defaultAddress) fillAddress(defaultAddress);
        } catch {
            setStatus("You can enter your delivery address below for this order.", "info");
        }

        const placeButton = document.getElementById("checkout-place-order");
        if (placeButton) {
            placeButton.disabled = !state.items.length || !state.quote || state.serviceability?.available !== true;
        }
        document.querySelector('[data-checkout-next="payment"]')?.toggleAttribute("disabled", !state.customerReady || !state.items.length);
    }

    async function updateQuote() {
        const endpoint = service === "food" ? "foodQuoteEndpoint" : "shoppingQuoteEndpoint";
        if (!state.customerReady) return;
        try {
            if (!window.THA_ONE_API.endpoint(window.THA_ONE_CONFIG?.[endpoint])) {
                throw new Error("Location-based delivery quotes are not connected. Checkout is unavailable.");
            }
            const response = await window.THA_ONE_API.request(endpoint, { method: "POST", body: { items: state.items, address: currentAddress() } });
            const quote = response.quote || response;
            state.quote = quote;
            if (state.quote?.available === false || state.quote?.serviceable === false) {
                state.serviceability = { available: false, message: state.quote.message };
                setStatus(state.quote.message || "Currently unavailable at your location.", "warning");
            } else if (!hasValidAmount(state.quote?.total) || !hasValidAmount(state.quote?.deliveryFee)) {
                throw new Error("The delivery service did not return a valid order quote.");
            }
            state.codEnabled = state.quote?.codAvailable === true || state.quote?.cashOnDelivery === true;
            const codCard = document.getElementById("cod-option-card");
            if (codCard) codCard.hidden = !state.codEnabled;
            if (!state.codEnabled && state.selectedMethod === "cod") {
                state.selectedMethod = "upi_gpay";
                const defaultCard = document.querySelector('.payment-card input[value="upi_gpay"]')?.closest(".payment-card");
                document.querySelectorAll(".payment-card").forEach((card) => card.classList.remove("selected"));
                defaultCard?.classList.add("selected");
                const defaultInput = defaultCard?.querySelector('input[type="radio"]');
                if (defaultInput) defaultInput.checked = true;
                renderPaymentSubpanel();
            }
            renderCart();
        } catch (error) {
            state.quote = null;
            state.codEnabled = false;
            const codCard = document.getElementById("cod-option-card");
            if (codCard) codCard.hidden = true;
            setStatus(error.message || "Delivery charges could not be confirmed. Try again shortly.", "warning");
            renderCart();
        }
    }

    async function confirmServiceability(address) {
        const itemIds = state.items.map((item) => service === "food" ? item.dishId : item.id);
        const selection = service === "food" ? { dishIds: itemIds } : { productIds: itemIds };
        try {
            const result = await window.THA_ONE_API.request("serviceabilityEndpoint", {
                method: "POST",
                body: { service, pincode: address.pincode, ...selection }
            });
            const unavailableIds = [
                ...(result.unavailableItemIds || []),
                ...(result.unavailableProductIds || []),
                ...(result.unavailableDishIds || [])
            ];
            const itemUnavailable = itemIds.some((id) => unavailableIds.includes(id));
            state.serviceability = { ...result, available: result.available === true && !itemUnavailable };
            if (state.serviceability.available !== true) {
                const message = result.message || "Currently unavailable at your location.";
                document.getElementById("checkout-availability").textContent = message;
                setStatus(message, "warning");
                return false;
            }
            document.getElementById("checkout-availability").textContent = result.message || "Delivery is available at this address.";
            state.codEnabled = false;
            return true;
        } catch {
            state.serviceability = { available: false };
            const message = "Delivery availability could not be confirmed. Try again shortly.";
            document.getElementById("checkout-availability").textContent = message;
            setStatus(message, "warning");
            return false;
        }
    }

    // --- PAYMENT METHOD SELECTION & SUBPANELS ---

    function setupPaymentMethods() {
        const cards = document.querySelectorAll(".payment-card");
        cards.forEach((card) => {
            card.addEventListener("click", () => {
                const input = card.querySelector('input[type="radio"]');
                if (input) {
                    input.checked = true;
                    cards.forEach(c => c.classList.remove("selected"));
                    card.classList.add("selected");
                    state.selectedMethod = input.value;
                    renderPaymentSubpanel();
                    renderCart();
                }
            });
        });
        renderPaymentSubpanel();
    }

    function renderPaymentSubpanel() {
        const panel = document.getElementById("payment-subpanel");
        if (!panel) return;

        const method = state.selectedMethod;
        const methodName = methodLabels[method] || "Payment Method";

        if (method.startsWith("upi_")) {
            if (method === "upi_custom") {
                panel.innerHTML = `
                    <div class="subpanel-heading">
                        <span>⚡</span><strong>Enter Your UPI ID / VPA</strong>
                    </div>
                    <div class="subpanel-content">
                        <p>Enter your Virtual Payment Address. It will be sent only to the configured payment service when you start checkout.</p>
                        <div class="upi-id-field-wrap">
                            <input type="text" id="custom-upi-vpa" placeholder="username@bank" value="${escapeHtml(state.upiVpa)}" autocomplete="off" spellcheck="false">
                        </div>
                        <div class="security-guarantee-note">
                            <span>🔒</span>
                            <span><b>Never enter your UPI PIN on THA ONE.</b> You will authorize the transaction solely in your official UPI app.</span>
                        </div>
                    </div>
                `;
                document.getElementById("custom-upi-vpa")?.addEventListener("input", (e) => {
                    state.upiVpa = e.target.value.trim();
                });
            } else {
                panel.innerHTML = `
                    <div class="subpanel-heading">
                        <span>⚡</span><strong>${escapeHtml(methodName)} Selected</strong>
                    </div>
                    <div class="subpanel-content">
                        <p>A secure payment session will be requested from <b>${escapeHtml(methodName)}</b> when you continue.</p>
                        <div class="security-guarantee-note">
                            <span>🔒</span>
                            <span><b>Zero PIN Disclosure:</b> THA ONE will NEVER ask for your UPI PIN. You will enter your PIN only inside your official ${escapeHtml(methodName)} app.</span>
                        </div>
                    </div>
                `;
            }
        } else if (method === "card_credit" || method === "card_debit") {
            panel.innerHTML = `
                <div class="subpanel-heading">
                    <span>💳</span><strong>${escapeHtml(methodName)} Information</strong>
                </div>
                <div class="subpanel-content">
                    <p>Card details and authentication must be completed only in the connected provider's secure checkout.</p>
                    <div class="security-guarantee-note">
                        <span>🔒</span>
                        <span><b>PCI-DSS Compliance:</b> THA ONE never collects or stores card CVV or payment passwords. Authentication is done via your bank's OTP page.</span>
                    </div>
                </div>
            `;
        } else if (method === "netbanking") {
            panel.innerHTML = `
                <div class="subpanel-heading">
                    <span>🏛️</span><strong>Net Banking — Select Your Bank</strong>
                </div>
                <div class="subpanel-content">
                    <p>Select your bank. You will continue through the configured provider's secure banking flow.</p>
                    <div class="popular-banks-row">
                        <button type="button" class="bank-chip active" data-bank="HDFC Bank">HDFC Bank</button>
                        <button type="button" class="bank-chip" data-bank="State Bank of India">SBI</button>
                        <button type="button" class="bank-chip" data-bank="ICICI Bank">ICICI Bank</button>
                        <button type="button" class="bank-chip" data-bank="Axis Bank">Axis Bank</button>
                        <button type="button" class="bank-chip" data-bank="Kotak Mahindra">Kotak</button>
                    </div>
                    <div class="security-guarantee-note">
                        <span>🔒</span>
                        <span>You will be transferred to your bank's verified gateway. Enter login credentials only on the official bank site.</span>
                    </div>
                </div>
            `;
            panel.querySelectorAll(".bank-chip").forEach(chip => {
                chip.addEventListener("click", () => {
                    panel.querySelectorAll(".bank-chip").forEach(c => c.classList.remove("active"));
                    chip.classList.add("active");
                    state.selectedBank = chip.dataset.bank;
                });
            });
        } else if (method === "cod") {
            panel.innerHTML = `
                <div class="subpanel-heading">
                    <span>💵</span><strong>Cash on Delivery (Doorstep Payment)</strong>
                </div>
                <div class="subpanel-content">
                    <p>Pay with cash or by scanning the delivery partner's UPI QR code when your order arrives at your door.</p>
                    <div class="security-guarantee-note">
                        <span>✓</span>
                        <span>Please keep exact cash ready or scan the delivery QR code upon arrival. No advance payment required.</span>
                    </div>
                </div>
            `;
        }
    }

    // --- STEP 3: REVIEW RENDERING ---

    function renderReview() {
        const address = currentAddress();
        const addressEl = document.getElementById("checkout-review-address");
        if (addressEl) {
            addressEl.textContent = `${address.recipientName} · ${address.phone} · ${[address.line1, address.area, address.landmark, address.city, address.state, address.pincode].filter(Boolean).join(", ")}`;
        }

        const methodBadge = document.getElementById("review-method-badge");
        if (methodBadge) {
            methodBadge.textContent = methodLabels[state.selectedMethod] || "Selected Method";
        }

        const itemsContainer = document.getElementById("checkout-review-items");
        if (itemsContainer) {
            itemsContainer.replaceChildren(...state.items.map((item) => {
                const product = productFor(item);
                const row = document.createElement("div");
                row.className = "checkout-review-line";
                const label = document.createElement("span");
                label.textContent = `${product?.name || "Item"}${item.option ? ` · ${item.option}` : item.variant ? ` · ${item.variant}` : ""} × ${item.quantity}`;
                const amount = document.createElement("strong");
                amount.textContent = money.format((Number(product?.price) || 0) * Number(item.quantity));
                row.append(label, amount);
                return row;
            }));
        }

        renderCart();
    }

    // --- PAYMENT GATEWAY MODAL & LIFECYCLE (Requirement 8 & 9) ---

    function openPaymentModal() {
        const modal = document.getElementById("payment-modal");
        modal.hidden = false;
        document.body.style.overflow = "hidden";
    }

    function closePaymentModal() {
        const modal = document.getElementById("payment-modal");
        modal.hidden = true;
        document.body.style.overflow = "";
        if (state.pollTimeout) {
            clearTimeout(state.pollTimeout);
            state.pollTimeout = null;
        }
        state.paymentPolling = false;
    }

    function setModalState(stateName) {
        const states = ["processing", "pending", "successful", "failed", "cancelled"];
        states.forEach(s => {
            const el = document.getElementById(`state-${s}`);
            if (el) el.hidden = (s !== stateName);
        });
    }

    async function handlePaymentResult(result) {
        const status = String(result?.status || "pending").toLowerCase();
        if (status === "successful" && result.verified === true) {
            state.paymentPolling = false;
            if (state.pollTimeout) clearTimeout(state.pollTimeout);
            setModalState("successful");
            document.getElementById("success-payment-id").textContent = result.paymentId || state.activePayment?.paymentId || "Verified";
            const trackingUrl = `order-tracking.html?service=${service}&id=${encodeURIComponent(state.activeOrder?.id || result.orderId)}`;
            const trackLink = document.getElementById("track-order-link");
            if (trackLink) trackLink.href = trackingUrl;

            // Clear cart immediately upon verified payment
            clearCart();

            // Auto navigate after 2.5s
            setTimeout(() => {
                window.location.assign(trackingUrl);
            }, 2500);
        } else if (result.verified === true && status === "failed") {
            state.paymentPolling = false;
            if (state.pollTimeout) clearTimeout(state.pollTimeout);
            setModalState("failed");
            document.getElementById("failed-reason").textContent = result.message || "The payment provider reported that this payment failed. Your order remains unpaid.";
        } else if (result.verified === true && status === "cancelled") {
            state.paymentPolling = false;
            if (state.pollTimeout) clearTimeout(state.pollTimeout);
            setModalState("cancelled");
        } else if (status === "processing") {
            setModalState("processing");
        } else {
            setModalState("pending");
            const instruction = document.getElementById("pending-instruction");
            if (instruction && result?.message) instruction.textContent = result.message;
        }
    }

    async function pollPaymentStatus() {
        if (!state.paymentPolling || !state.activePayment?.paymentId) return;
        try {
            const result = await window.THA_ONE_API.request("paymentVerifyEndpoint", {
                method: "POST",
                body: { paymentId: state.activePayment.paymentId, orderId: state.activeOrder?.id }
            });
            await handlePaymentResult(result);
        } catch {
            setModalState("pending");
        }
        if (state.paymentPolling) {
            state.pollTimeout = window.setTimeout(pollPaymentStatus, 5000);
        }
    }

    async function executePaymentFlow() {
        const address = currentAddress();
        const grandTotal = Number(state.quote?.total);
        if (!hasValidAmount(state.quote?.total) || !Number.isFinite(grandTotal) || state.serviceability?.available !== true) {
            setStatus("Delivery availability and charges must be confirmed before placing this order.", "warning");
            return;
        }

        if (state.selectedMethod === "cod" && !state.codEnabled) {
            setStatus("Cash on Delivery is not available for this order.", "warning");
            return;
        }
        if (state.serviceability?.available !== true) {
            setStatus("Delivery availability must be confirmed for this address before checkout.", "warning");
            return;
        }

        let orderResult;
        try {
            if (state.activeOrder?.id) {
                orderResult = { orderId: state.activeOrder.id, order: state.activeOrder };
            } else {
                const checkoutEndpoint = service === "food" ? "foodCheckoutEndpoint" : "shoppingCheckoutEndpoint";
                if (!window.THA_ONE_API.endpoint(window.THA_ONE_CONFIG?.[checkoutEndpoint])) {
                    throw new Error("Secure order service is not connected. Your order was not placed.");
                }
                orderResult = await window.THA_ONE_API.request(checkoutEndpoint, {
                    method: "POST",
                    body: {
                        service,
                        items: state.items.map((item) => service === "food"
                            ? { itemId: item.dishId, quantity: item.quantity, option: item.option || "" }
                            : { productId: item.id, quantity: item.quantity, variant: item.variant || "" }),
                        address,
                        paymentMethod: state.selectedMethod
                    }
                });
            }
            if (orderResult?.success === false) throw new Error(orderResult.message || "Order could not be created.");
        } catch (e) {
            setStatus(e.message || "Unable to initialize order. Please check your address and cart.", "error");
            return;
        }

        const orderId = orderResult.orderId || orderResult.order?.id;
        if (!orderId) {
            setStatus("The order service did not return an order reference. Please try again.", "error");
            return;
        }
        state.activeOrder = orderResult.order || { id: orderId };

        // For Cash on Delivery: Instant confirmed order
        if (state.selectedMethod === "cod") {
            clearCart();
            window.location.assign(`order-tracking.html?service=${service}&id=${encodeURIComponent(orderId)}`);
            return;
        }

        openPaymentModal();
        setModalState("processing");
        document.getElementById("modal-amount").textContent = money.format(grandTotal);
        document.getElementById("modal-order-ref").textContent = `Order: ${orderId}`;
        const providerName = methodLabels[state.selectedMethod] || "Payment Gateway";
        document.getElementById("processing-provider-name").textContent = providerName;

        try {
            const paymentIntent = await window.THA_ONE_API.request("paymentStartEndpoint", {
                method: "POST",
                body: {
                    method: state.selectedMethod,
                    vpa: state.upiVpa,
                    bank: state.selectedBank,
                    orderId,
                    service
                }
            });
            const paymentId = paymentIntent.paymentId || paymentIntent.id;
            if (!paymentId) throw new Error("The payment provider did not return a payment reference.");
            state.activePayment = { ...paymentIntent, paymentId };
            document.getElementById("gateway-session-id").textContent = `Payment reference: ${paymentId}`;

            if (paymentIntent.redirectUrl) {
                const redirect = window.THA_ONE_API.safeRedirect(paymentIntent.redirectUrl);
                if (!redirect) throw new Error("The payment provider returned an untrusted checkout address.");
                window.location.assign(redirect.href);
                return;
            }

            state.paymentPolling = true;
            setModalState("pending");
            pollPaymentStatus();
        } catch (error) {
            state.paymentPolling = false;
            setModalState("failed");
            document.getElementById("failed-reason").textContent = error.message || "Secure payment is not connected. Your order remains unpaid and your cart is unchanged.";
        }
    }

    // --- INITIALIZATION ---

    function init() {
        const isFood = service === "food";
        document.body.dataset.checkout = service;

        const serviceNameEl = document.getElementById("checkout-service-name");
        if (serviceNameEl) serviceNameEl.textContent = isFood ? "Food Checkout" : "Shopping Checkout";

        const footerBrandEl = document.getElementById("checkout-footer-brand");
        if (footerBrandEl) footerBrandEl.textContent = isFood ? "THA ONE Food · Secure Payment Handoff" : "THA ONE Shopping · Secure Payment Handoff";

        const returnLink = document.getElementById("checkout-return-link");
        if (returnLink) {
            returnLink.href = isFood ? "food.html" : "home.html";
            returnLink.textContent = isFood ? "Food" : "Shopping";
        }

        const continueShopping = document.getElementById("continue-shopping");
        if (continueShopping) continueShopping.href = isFood ? "food.html" : "home.html";

        const switcher = document.querySelector("tha-app-switcher");
        switcher?.setAttribute("current", isFood ? "food" : "shopping");

        const codCard = document.getElementById("cod-option-card");
        if (codCard) codCard.hidden = true;

        renderCart();
        loadCustomerData();
        setupPaymentMethods();

        // Next / Back buttons
        document.querySelectorAll("[data-checkout-next]").forEach((button) => button.addEventListener("click", async () => {
            if (button.dataset.checkoutNext === "payment") {
                const form = document.getElementById("checkout-address-form");
                const invalid = [...form.querySelectorAll("input,textarea")].find((field) => !field.checkValidity());
                if (invalid) {
                    invalid.reportValidity();
                    invalid.focus();
                    return;
                }
                state.address = currentAddress();
                button.disabled = true;
                const available = await confirmServiceability(state.address);
                if (available) await updateQuote();
                button.disabled = false;
                if (!available || state.serviceability?.available !== true) return;
            }
            if (button.dataset.checkoutNext === "review") {
                if (state.serviceability?.available !== true) {
                    setStatus("Delivery availability must be confirmed for this address before checkout.", "warning");
                    setStep("address");
                    return;
                }
                renderReview();
            }
            setStep(button.dataset.checkoutNext);
        }));

        document.getElementById("checkout-change-address")?.addEventListener("click", () => {
            state.addressPickerOpen = !state.addressPickerOpen;
            renderSavedAddresses();
            document.getElementById("checkout-change-address").setAttribute("aria-expanded", String(state.addressPickerOpen));
        });

        document.querySelectorAll("[data-checkout-back]").forEach((button) => button.addEventListener("click", () => setStep(button.dataset.checkoutBack)));

        document.querySelectorAll("#checkout-address-form input, #checkout-address-form textarea").forEach((field) => {
            field.addEventListener("input", () => {
                state.selectedAddress = null;
                state.serviceability = null;
                document.getElementById("checkout-area").required = true;
            });
        });

        const placeOrderBtn = document.getElementById("checkout-place-order");
        if (placeOrderBtn) {
            placeOrderBtn.addEventListener("click", async () => {
                placeOrderBtn.disabled = true;
                await executePaymentFlow();
                placeOrderBtn.disabled = !state.items.length || !state.quote || state.serviceability?.available !== true;
            });
        }

        document.getElementById("modal-close")?.addEventListener("click", () => {
            closePaymentModal();
            setStatus("Payment status is not confirmed. Your order remains unpaid until the provider confirms it.", "warning");
        });

        document.getElementById("payment-check-status")?.addEventListener("click", () => {
            if (!state.paymentPolling) state.paymentPolling = true;
            pollPaymentStatus();
        });

        document.getElementById("retry-payment-btn")?.addEventListener("click", () => {
            executePaymentFlow();
        });

        document.getElementById("switch-method-btn")?.addEventListener("click", () => {
            closePaymentModal();
            setStep("payment");
        });

        document.getElementById("cancelled-back-btn")?.addEventListener("click", () => {
            closePaymentModal();
            setStep("payment");
        });

        const returnedPaymentId = params.get("paymentId");
        const returnedOrderId = params.get("orderId");
        if (returnedPaymentId && returnedOrderId) {
            state.activePayment = { paymentId: returnedPaymentId };
            state.activeOrder = { id: returnedOrderId };
            openPaymentModal();
            setModalState("processing");
            state.paymentPolling = true;
            pollPaymentStatus();
        }
    }

    init();
})();

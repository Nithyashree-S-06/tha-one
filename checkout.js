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
        activePayment: null,
        activeOrder: null,
        timerInterval: null
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

        const subtotal = state.items.reduce((sum, item) => sum + (Number(productFor(item)?.price) || 0) * Number(item.quantity), 0);
        document.getElementById("checkout-subtotal").textContent = money.format(subtotal);

        // Calculate delivery & discounts
        const isFood = service === "food";
        const deliveryFee = state.quote ? state.quote.deliveryFee : (isFood ? (subtotal > 399 ? 0 : 29) : (subtotal >= 999 ? 0 : 50));
        const discount = state.quote ? state.quote.discount : (isFood && subtotal > 399 ? 100 : 0);
        const grandTotal = Math.max(0, subtotal + deliveryFee - discount);

        document.getElementById("checkout-delivery").textContent = deliveryFee === 0 ? "FREE" : money.format(deliveryFee);
        document.getElementById("checkout-discount").textContent = discount > 0 ? `−${money.format(discount)}` : "Applied at checkout";
        document.getElementById("checkout-total").textContent = money.format(grandTotal);

        // Update button text in review
        const placeBtnText = document.getElementById("place-order-text");
        if (placeBtnText) {
            placeBtnText.textContent = state.selectedMethod === "cod"
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
            recipientName: document.getElementById("checkout-recipient").value.trim(),
            phone: document.getElementById("checkout-phone").value.trim(),
            line1: document.getElementById("checkout-address-line").value.trim(),
            city: document.getElementById("checkout-city").value.trim(),
            state: document.getElementById("checkout-state").value.trim(),
            pincode: document.getElementById("checkout-pincode").value.trim()
        };
    }

    function fillAddress(address) {
        state.selectedAddress = address.id || null;
        document.getElementById("checkout-recipient").value = address.recipientName || "";
        document.getElementById("checkout-phone").value = address.phone || "";
        document.getElementById("checkout-address-line").value = address.line1 || "";
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
            return;
        }
        container.style.display = "grid";

        state.addresses.forEach((address) => {
            const label = document.createElement("label");
            label.className = "saved-address-option";
            const input = document.createElement("input");
            input.type = "radio";
            input.name = "saved-address";
            input.checked = state.selectedAddress === address.id;
            input.addEventListener("change", () => fillAddress(address));

            const copy = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = `${address.label || "Saved Address"} ${address.isDefault ? "★ Default" : ""}`;
            const summary = document.createElement("small");
            summary.textContent = `${address.recipientName} · ${address.phone}\n${[address.line1, address.city, address.state, address.pincode].filter(Boolean).join(", ")}`;
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
            placeButton.disabled = !state.items.length;
        }
    }

    async function updateQuote() {
        const endpoint = service === "food" ? "foodQuoteEndpoint" : "shoppingQuoteEndpoint";
        if (!state.customerReady) return;
        try {
            const quote = await window.THA_ONE_API.request(endpoint, { method: "POST", body: { items: state.items, address: currentAddress() } });
            state.quote = quote.quote || quote || null;
            renderCart();
        } catch {
            state.quote = null;
            renderCart();
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
                        <p>Enter your Virtual Payment Address (e.g. mobile@upi or username@okhdfcbank). A payment collect request will be sent to your UPI app.</p>
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
                        <p>Fast, direct bank checkout via <b>${escapeHtml(methodName)}</b>. When you proceed, an encrypted UPI request will be dispatched to your phone.</p>
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
                    <p>Enter your non-sensitive card reference details. Secure 3D-Secure authentication occurs on the bank portal.</p>
                    <div class="card-fields-grid">
                        <div class="service-form-field">
                            <label for="mock-card-name">Name on Card</label>
                            <input class="service-input" id="mock-card-name" placeholder="As printed on card" autocomplete="cc-name" value="${escapeHtml(document.getElementById('checkout-recipient')?.value || '')}">
                        </div>
                        <div class="service-form-field">
                            <label for="mock-card-exp">Expiry (MM/YY)</label>
                            <input class="service-input" id="mock-card-exp" placeholder="MM/YY" maxlength="5" autocomplete="cc-exp">
                        </div>
                    </div>
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
                    <p>Select your bank to connect directly to its secure internet banking portal:</p>
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
            addressEl.textContent = `${address.recipientName} · ${address.phone} · ${address.line1}, ${address.city}, ${address.state} ${address.pincode}`;
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
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
    }

    function setModalState(stateName) {
        const states = ["processing", "pending", "successful", "failed", "cancelled"];
        states.forEach(s => {
            const el = document.getElementById(`state-${s}`);
            if (el) el.hidden = (s !== stateName);
        });
    }

    function startUpiCountdown(seconds = 300) {
        if (state.timerInterval) clearInterval(state.timerInterval);
        let remaining = seconds;
        const countdownEl = document.getElementById("upi-countdown");

        function update() {
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            if (countdownEl) countdownEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            if (remaining <= 0) {
                clearInterval(state.timerInterval);
                state.timerInterval = null;
                handlePaymentResult({ status: "failed", message: "UPI collect request timed out. Please try again." });
            }
            remaining--;
        }
        update();
        state.timerInterval = setInterval(update, 1000);
    }

    async function handlePaymentResult(result) {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }

        if (result.status === "successful") {
            setModalState("successful");
            document.getElementById("success-payment-id").textContent = result.paymentId || "pay_tha_verified";
            const trackingUrl = `order-tracking.html?service=${service}&id=${encodeURIComponent(state.activeOrder?.id || result.orderId)}`;
            const trackLink = document.getElementById("track-order-link");
            if (trackLink) trackLink.href = trackingUrl;

            // Clear cart immediately upon verified payment
            clearCart();

            // Auto navigate after 2.5s
            setTimeout(() => {
                window.location.assign(trackingUrl);
            }, 2500);
        } else if (result.status === "failed") {
            setModalState("failed");
            document.getElementById("failed-reason").textContent = result.message || "Payment declined by issuing bank or UPI provider. No money was charged.";
        } else if (result.status === "cancelled") {
            setModalState("cancelled");
        } else if (result.status === "pending") {
            setModalState("pending");
            startUpiCountdown(300);
        }
    }

    async function executePaymentFlow() {
        const address = currentAddress();
        const subtotal = state.items.reduce((sum, item) => sum + (Number(productFor(item)?.price) || 0) * Number(item.quantity), 0);
        const isFood = service === "food";
        const deliveryFee = state.quote ? state.quote.deliveryFee : (isFood ? (subtotal > 399 ? 0 : 29) : (subtotal >= 999 ? 0 : 50));
        const discount = state.quote ? state.quote.discount : (isFood && subtotal > 399 ? 100 : 0);
        const grandTotal = Math.max(0, subtotal + deliveryFee - discount);

        // First place order with THA_ONE_CORE in Pending Payment status
        let orderResult;
        try {
            orderResult = await window.THA_ONE_API.request(service === "food" ? "foodCheckoutEndpoint" : "shoppingCheckoutEndpoint", {
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
        } catch (e) {
            setStatus("Unable to initialize order. Please check your address and cart.", "error");
            return;
        }

        const orderId = orderResult.orderId || orderResult.order?.id;
        state.activeOrder = orderResult.order || { id: orderId };

        // For Cash on Delivery: Instant confirmed order
        if (state.selectedMethod === "cod") {
            clearCart();
            window.location.assign(`order-tracking.html?service=${service}&id=${encodeURIComponent(orderId)}`);
            return;
        }

        // Open Secure Payment Gateway modal
        openPaymentModal();
        setModalState("processing");

        document.getElementById("modal-amount").textContent = money.format(grandTotal);
        document.getElementById("modal-order-ref").textContent = `Order: ${orderId}`;
        const providerName = methodLabels[state.selectedMethod] || "Payment Gateway";
        document.getElementById("processing-provider-name").textContent = providerName;
        document.getElementById("pending-app-name").textContent = providerName;

        // Initiate payment with backend payment service
        const paymentIntent = window.THA_ONE_CORE.initiatePayment({
            orderAmount: grandTotal,
            method: state.selectedMethod,
            vpa: state.upiVpa,
            orderId,
            service
        });
        state.activePayment = paymentIntent;

        document.getElementById("gateway-session-id").textContent = `Session: ${paymentIntent.paymentId}`;

        // Handshake transition: after 900ms processing, move to pending (waiting for approval)
        setTimeout(() => {
            setModalState("pending");
            startUpiCountdown(300);
            if (state.selectedMethod === "upi_custom" && state.upiVpa) {
                document.getElementById("pending-instruction").innerHTML = `Collect request sent to <strong>${escapeHtml(state.upiVpa)}</strong>. Open your UPI app to approve the ${money.format(grandTotal)} payment.`;
            } else {
                document.getElementById("pending-instruction").innerHTML = `Collect request sent to your mobile device. Open <strong>${escapeHtml(providerName)}</strong> to approve payment of ${money.format(grandTotal)}.`;
            }
        }, 900);
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

        // COD is disabled for pure digital or large food orders if desired, otherwise supported
        const codCard = document.getElementById("cod-option-card");
        if (codCard && isFood) {
            // Food COD enabled
            codCard.hidden = false;
        }

        renderCart();
        loadCustomerData();
        setupPaymentMethods();

        // Next / Back buttons
        document.querySelectorAll("[data-checkout-next]").forEach((button) => button.addEventListener("click", () => {
            if (button.dataset.checkoutNext === "payment") {
                const form = document.getElementById("checkout-address-form");
                const invalid = [...form.querySelectorAll("input,textarea")].find((field) => !field.checkValidity());
                if (invalid) {
                    invalid.reportValidity();
                    invalid.focus();
                    return;
                }
                state.address = currentAddress();
                updateQuote();
            }
            if (button.dataset.checkoutNext === "review") {
                renderReview();
            }
            setStep(button.dataset.checkoutNext);
        }));

        document.querySelectorAll("[data-checkout-back]").forEach((button) => button.addEventListener("click", () => setStep(button.dataset.checkoutBack)));

        // Place order button
        const placeOrderBtn = document.getElementById("checkout-place-order");
        if (placeOrderBtn) {
            placeOrderBtn.addEventListener("click", executePaymentFlow);
        }

        // Modal close button
        document.getElementById("modal-close")?.addEventListener("click", () => {
            if (confirm("Are you sure you want to cancel this payment?")) {
                const res = window.THA_ONE_CORE.verifyPayment({
                    paymentId: state.activePayment?.paymentId,
                    orderId: state.activeOrder?.id,
                    simulateStatus: "cancelled"
                });
                handlePaymentResult(res);
            }
        });

        // Gateway simulator buttons
        document.getElementById("sim-approve-btn")?.addEventListener("click", () => {
            const res = window.THA_ONE_CORE.verifyPayment({
                paymentId: state.activePayment?.paymentId,
                orderId: state.activeOrder?.id,
                simulateStatus: "successful"
            });
            handlePaymentResult(res);
        });

        document.getElementById("sim-decline-btn")?.addEventListener("click", () => {
            const res = window.THA_ONE_CORE.verifyPayment({
                paymentId: state.activePayment?.paymentId,
                orderId: state.activeOrder?.id,
                simulateStatus: "failed"
            });
            handlePaymentResult(res);
        });

        document.getElementById("sim-cancel-btn")?.addEventListener("click", () => {
            const res = window.THA_ONE_CORE.verifyPayment({
                paymentId: state.activePayment?.paymentId,
                orderId: state.activeOrder?.id,
                simulateStatus: "cancelled"
            });
            handlePaymentResult(res);
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
    }

    init();
})();

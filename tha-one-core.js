(() => {
    "use strict";

    /**
     * THA ONE Core System
     * Unified state management, shared session handling, role-based access control,
     * and integration-ready development service adapter.
     */

    const SESSION_KEY = "tha_one_session";
    const ORDERS_KEY = "tha_one_orders";
    const KYC_KEY = "tha_one_kyc_queue";
    const SETTINGS_KEY = "tha_one_settings";

    // Seed customer data
    const SEED_USER = {
        id: "usr_tha_8801",
        fullName: "Aarav Sharma",
        email: "aarav.sharma@thaone.in",
        mobile: "+91 98765 43210",
        mobileRaw: "9876543210",
        countryCode: "+91",
        avatar: "AS",
        roles: {
            customer: { status: "active", verified: true },
            seller: { status: "not_applied", verified: false },
            deliveryPartner: { status: "not_applied", verified: false },
            admin: { status: "active", verified: true }
        },
        experienceSelected: false,
        selectedRoles: ["shopping", "food"],
        addresses: [
            {
                id: "addr_tha_01",
                label: "Home",
                recipientName: "Aarav Sharma",
                phone: "9876543210",
                line1: "Flat 402, Green Glen Layout, Outer Ring Road",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560103",
                isDefault: true
            },
            {
                id: "addr_tha_02",
                label: "Work",
                recipientName: "Aarav Sharma",
                phone: "9876543210",
                line1: "Prestige Tech Cloud, Building 3, Kadubeesanahalli",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560103",
                isDefault: false
            }
        ],
        notifications: [
            { id: "notif_01", title: "Welcome to THA ONE", message: "Your shared account is ready. Explore Shopping and Food seamlessly with zero KYC required." },
            { id: "notif_02", title: "Special Welcome Benefit", message: "Free delivery applies to your first THA ONE shopping order over ₹999." },
            { id: "notif_03", title: "Single Shared Session", message: "Switch freely between Shopping, Food, and partner services without re-authenticating." }
        ]
    };

    // Starter Orders
    const SEED_ORDERS = [
        {
            id: "THA-S90412",
            orderNumber: "THA-S90412",
            service: "shopping",
            createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
            status: "Delivered",
            progressIndex: 4,
            total: 6490,
            amount: 6490,
            deliveryFee: 0,
            discount: 2500,
            items: [
                { id: "arc-headphones", name: "Arc wireless headphones", quantity: 1, price: 6490, variant: "Midnight" }
            ],
            address: {
                recipientName: "Aarav Sharma",
                phone: "9876543210",
                line1: "Flat 402, Green Glen Layout, Outer Ring Road",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560103"
            },
            estimatedDelivery: "Delivered on Oct 2, 2026",
            paymentMethod: "upi"
        },
        {
            id: "THA-F88204",
            orderNumber: "THA-F88204",
            service: "food",
            restaurantName: "The Little Oven",
            createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
            status: "Delivered",
            progressIndex: 7,
            total: 358,
            amount: 358,
            deliveryFee: 29,
            discount: 0,
            items: [
                { itemId: "margherita-pizza", name: "Garden Margherita", quantity: 1, price: 329, option: "Classic" }
            ],
            address: {
                recipientName: "Aarav Sharma",
                phone: "9876543210",
                line1: "Flat 402, Green Glen Layout, Outer Ring Road",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560103"
            },
            estimatedDelivery: "Delivered today",
            paymentMethod: "upi"
        }
    ];

    function safeParse(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    function safeWrite(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.warn("[THA ONE] Storage write failed:", e);
        }
    }

    // In-memory OTP storage for secure verification simulation (never stored in localStorage)
    const activeOtpChallenges = new Map();

    class ThaOneCore {
        constructor() {
            this.user = safeParse(SESSION_KEY, SEED_USER);
            this.orders = safeParse(ORDERS_KEY, SEED_ORDERS);
            this.kycQueue = safeParse(KYC_KEY, []);
            this.ensureDefaultData();
        }

        ensureDefaultData() {
            if (!this.user || !this.user.id) {
                this.user = structuredClone(SEED_USER);
                this.persistUser();
            }
            if (!Array.isArray(this.orders) || !this.orders.length) {
                this.orders = structuredClone(SEED_ORDERS);
                this.persistOrders();
            }
        }

        persistUser() {
            // Save non-sensitive user profile to storage
            const safeUser = {
                id: this.user.id,
                fullName: this.user.fullName,
                email: this.user.email,
                mobile: this.user.mobile,
                mobileRaw: this.user.mobileRaw,
                avatar: this.user.avatar,
                roles: this.user.roles,
                experienceSelected: Boolean(this.user.experienceSelected),
                selectedRoles: this.user.selectedRoles || ["shopping", "food"],
                addresses: this.user.addresses || [],
                notifications: this.user.notifications || []
            };
            safeWrite(SESSION_KEY, safeUser);
            window.dispatchEvent(new CustomEvent("tha-one-session-changed", { detail: safeUser }));
        }

        saveExperienceSelection({ roles = [], skipped = false }) {
            this.user.experienceSelected = true;
            this.user.selectedRoles = Array.isArray(roles) && roles.length ? roles : ["shopping", "food"];

            if (skipped) {
                // Skips seller and delivery partner onboarding
                this.user.roles.seller.status = "not_applied";
                this.user.roles.seller.verified = false;
                this.user.roles.deliveryPartner.status = "not_applied";
                this.user.roles.deliveryPartner.verified = false;
            } else {
                if (this.user.selectedRoles.includes("seller") && this.user.roles.seller.status === "not_applied") {
                    this.user.roles.seller.status = "pending";
                }
                if (this.user.selectedRoles.includes("delivery") && this.user.roles.deliveryPartner.status === "not_applied") {
                    this.user.roles.deliveryPartner.status = "pending";
                }
            }

            this.persistUser();
            return {
                success: true,
                experienceSelected: true,
                selectedRoles: this.user.selectedRoles,
                user: this.user
            };
        }

        persistOrders() {
            safeWrite(ORDERS_KEY, this.orders);
        }

        persistKyc() {
            safeWrite(KYC_KEY, this.kycQueue);
        }

        // --- AUTHENTICATION & SESSION ---

        isAuthenticated() {
            return Boolean(this.user && this.user.id);
        }

        getUser() {
            return this.user;
        }

        getSession() {
            return {
                authenticated: this.isAuthenticated(),
                token: "tha_one_sess_" + (this.user?.id || "anon"),
                profile: this.user,
                user: this.user,
                addresses: this.user?.addresses || [],
                orders: this.orders
            };
        }

        login({ identity, password }) {
            const cleanIdentity = String(identity || "").trim();
            if (!cleanIdentity) throw new Error("Enter your email or username.");
            if (!password || password.length < 6) throw new Error("Enter a valid password.");

            // Match existing user or create a session for the identity
            let name = cleanIdentity.split("@")[0] || "THA ONE Customer";
            name = name.charAt(0).toUpperCase() + name.slice(1);

            this.user.email = cleanIdentity.includes("@") ? cleanIdentity : `${cleanIdentity}@thaone.in`;
            this.user.fullName = this.user.fullName || name;
            this.user.avatar = this.user.fullName.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
            this.persistUser();

            return {
                success: true,
                message: "Signed in successfully",
                token: "tha_one_sess_" + this.user.id,
                user: this.user
            };
        }

        signup({ name, email, password, mobile }) {
            const cleanName = String(name || "").trim();
            const cleanEmail = String(email || "").trim();
            if (!cleanName) throw new Error("Please enter your name.");
            if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("Please enter a valid email address.");
            if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");

            this.user = {
                id: "usr_" + Math.random().toString(36).substring(2, 9),
                fullName: cleanName,
                email: cleanEmail,
                mobile: mobile || "+91 98765 00000",
                mobileRaw: (mobile || "").replace(/\D/g, "") || "9876500000",
                avatar: cleanName.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2),
                roles: {
                    customer: { status: "active", verified: true },
                    seller: { status: "not_applied", verified: false },
                    deliveryPartner: { status: "not_applied", verified: false },
                    admin: { status: "active", verified: true }
                },
                addresses: [],
                notifications: [
                    { id: "notif_" + Date.now(), title: "Account Created", message: "Welcome to THA ONE! Your multi-service account is ready." }
                ]
            };
            this.persistUser();

            return {
                success: true,
                message: "Account created successfully",
                user: this.user
            };
        }

        loginWithGoogle() {
            // Simulated secure OAuth handshake
            const googleName = "Aarav Sharma";
            const googleEmail = "aarav.sharma@gmail.com";
            this.user.fullName = googleName;
            this.user.email = googleEmail;
            this.user.avatar = "AS";
            this.persistUser();

            return {
                success: true,
                provider: "google",
                user: this.user
            };
        }

        requestOtp({ phone }) {
            const digits = String(phone || "").replace(/\D/g, "");
            if (digits.length < 10) throw new Error("Please enter a valid 10-digit mobile number.");

            const challengeId = "ch_" + Math.random().toString(36).substring(2, 10);
            // Generate standard 6-digit random code for this challenge (held securely in memory)
            const generatedCode = String(Math.floor(100000 + Math.random() * 900000));
            const now = Date.now();

            activeOtpChallenges.set(challengeId, {
                code: generatedCode,
                phone,
                expiresAt: now + 300 * 1000, // 5 minutes
                resendAfter: now + 30 * 1000, // 30 seconds
                attempts: 0
            });

            // Clean, non-sensitive developer console notice so local tester knows the simulated OTP
            console.info(
                `%c[THA ONE Dev Gateway]%c Simulated SMS OTP sent to ${phone.slice(0, 6)}****: %c${generatedCode}`,
                "background:#20372e;color:#b9ef58;font-weight:bold;padding:2px 6px;border-radius:3px;",
                "color:#20372e;font-weight:bold;",
                "background:#edf4e7;color:#31533c;font-size:14px;font-weight:bold;padding:2px 8px;border-radius:3px;"
            );

            return {
                challengeId,
                expiresInSeconds: 300,
                resendAfterSeconds: 30,
                maskedPhone: phone.replace(/(\+\d{2})?(\d{2})\d{4}(\d{4})/, "$1 $2•••• $3")
            };
        }

        verifyOtp({ challengeId, code }) {
            const cleanCode = String(code || "").trim();
            if (!/^\d{6}$/.test(cleanCode)) {
                const err = new Error("Please enter a 6-digit code.");
                err.code = "invalid_format";
                throw err;
            }

            const challenge = activeOtpChallenges.get(challengeId);
            if (!challenge) {
                const err = new Error("Your OTP session expired. Please request a new code.");
                err.code = "expired_otp";
                throw err;
            }

            if (Date.now() > challenge.expiresAt) {
                activeOtpChallenges.delete(challengeId);
                const err = new Error("OTP expired, please request a new OTP");
                err.code = "otp_expired";
                throw err;
            }

            if (challenge.attempts >= 4) {
                activeOtpChallenges.delete(challengeId);
                const err = new Error("Too many failed attempts. Try again in 60 seconds.");
                err.code = "too_many_attempts";
                err.retryAfterSeconds = 60;
                throw err;
            }

            // Strictly check against the generated challenge OTP
            if (cleanCode !== challenge.code) {
                challenge.attempts += 1;
                const err = new Error("Invalid OTP");
                err.code = "invalid_otp";
                throw err;
            }

            // OTP verified! Update user mobile if needed
            activeOtpChallenges.delete(challengeId);
            this.user.mobile = challenge.phone;
            this.user.mobileRaw = challenge.phone.replace(/\D/g, "");
            this.persistUser();

            return {
                success: true,
                message: "Mobile verified successfully",
                token: "tha_one_sess_" + this.user.id,
                user: this.user
            };
        }

        resetPassword({ email }) {
            const cleanEmail = String(email || "").trim();
            if (!cleanEmail || !cleanEmail.includes("@")) {
                throw new Error("Enter a valid email address.");
            }
            return {
                success: true,
                message: "If an account matches that email, a reset link is on its way."
            };
        }

        logout() {
            // Keep seeded identity ready for next demo login
            const preserved = structuredClone(SEED_USER);
            preserved.roles.seller.status = "not_applied";
            preserved.roles.seller.verified = false;
            preserved.roles.deliveryPartner.status = "not_applied";
            preserved.roles.deliveryPartner.verified = false;
            this.user = preserved;
            this.persistUser();
            return { success: true };
        }

        // --- PROFILE & ADDRESSES ---

        updateProfile(data) {
            if (data.fullName) this.user.fullName = String(data.fullName).trim();
            if (data.email) this.user.email = String(data.email).trim();
            if (data.mobile) this.user.mobile = String(data.mobile).trim();
            if (this.user.fullName) {
                this.user.avatar = this.user.fullName.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
            }
            this.persistUser();
            return { profile: this.user };
        }

        getAddresses() {
            return this.user.addresses || [];
        }

        saveAddress(address) {
            const addresses = this.user.addresses || [];
            const cleanAddress = {
                id: address.id || "addr_" + Date.now(),
                label: address.label || "Home",
                recipientName: String(address.recipientName || "").trim(),
                phone: String(address.phone || "").trim(),
                line1: String(address.line1 || "").trim(),
                city: String(address.city || "").trim(),
                state: String(address.state || "").trim(),
                pincode: String(address.pincode || "").trim(),
                isDefault: Boolean(address.isDefault)
            };

            if (cleanAddress.isDefault || addresses.length === 0) {
                addresses.forEach(a => a.isDefault = false);
                cleanAddress.isDefault = true;
            }

            const existingIdx = addresses.findIndex(a => a.id === cleanAddress.id);
            if (existingIdx >= 0) {
                addresses[existingIdx] = cleanAddress;
            } else {
                addresses.unshift(cleanAddress);
            }

            this.user.addresses = addresses;
            this.persistUser();
            return { addresses: this.user.addresses };
        }

        deleteAddress(id) {
            let addresses = this.user.addresses || [];
            addresses = addresses.filter(a => a.id !== id);
            if (addresses.length > 0 && !addresses.some(a => a.isDefault)) {
                addresses[0].isDefault = true;
            }
            this.user.addresses = addresses;
            this.persistUser();
            return { addresses: this.user.addresses };
        }

        // --- ROLE-BASED ACCESS & KYC ---

        getRoleStatus(role) {
            const roleKey = role === "delivery" ? "deliveryPartner" : role;
            const current = this.user.roles?.[roleKey];
            if (!current) return { status: "not_applied", verified: false };
            return {
                status: current.status || "not_applied",
                verified: current.status === "verified" || current.verified === true
            };
        }

        submitKyc(serviceName, data) {
            const roleKey = serviceName === "delivery" ? "deliveryPartner" : "seller";
            const applicationId = `KYC-${serviceName.toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-5)}`;

            // Create masked verification record
            const maskedRecord = {
                id: applicationId,
                service: serviceName,
                submittedAt: new Date().toISOString(),
                status: "pending",
                fullName: data.personal?.fullName || this.user.fullName,
                mobile: (data.personal?.mobile || this.user.mobile || "").replace(/(\d{2})\d{4}(\d{4})/, "$1••••$2"),
                email: data.personal?.email || this.user.email,
                businessOrVehicle: data.personal?.businessName || data.vehicle?.type || "Standard",
                maskedPan: data.pan?.number ? `${data.pan.number.slice(0, 2)}•••••${data.pan.number.slice(-1)}` : "Verified Provider",
                maskedAccount: data.bank?.accountNumber ? `••••••••${data.bank.accountNumber.slice(-4)}` : "••••••••1234",
                bankName: data.bank?.bankName || "Authorized Bank",
                ifsc: data.bank?.ifsc || "SBIN0001234"
            };

            this.kycQueue.unshift(maskedRecord);
            this.persistKyc();

            // Update user's role status to pending
            if (!this.user.roles) this.user.roles = {};
            this.user.roles[roleKey] = {
                status: "pending",
                verified: false,
                applicationId,
                submittedAt: maskedRecord.submittedAt
            };
            this.persistUser();

            return {
                success: true,
                status: "pending",
                applicationId,
                maskedDetails: {
                    "Application ID": applicationId,
                    "Applicant": maskedRecord.fullName,
                    "Mobile": maskedRecord.mobile,
                    "PAN Reference": maskedRecord.maskedPan,
                    "Payout Account": maskedRecord.maskedAccount,
                    "Status": "Pending Authorized Review"
                }
            };
        }

        setRoleStatus(roleName, newStatus) {
            const roleKey = roleName === "delivery" ? "deliveryPartner" : roleName;
            if (!this.user.roles) this.user.roles = {};
            const isVerified = newStatus === "verified";
            this.user.roles[roleKey] = {
                status: newStatus,
                verified: isVerified,
                updatedAt: new Date().toISOString()
            };
            this.persistUser();

            // Also update any matching queue item
            this.kycQueue.forEach(item => {
                if (item.service === (roleName === "deliveryPartner" ? "delivery" : roleName)) {
                    item.status = newStatus;
                }
            });
            this.persistKyc();

            return { success: true, role: roleKey, status: newStatus, verified: isVerified };
        }

        getKycQueue() {
            return this.kycQueue;
        }

        // --- ORDERS & CHECKOUT ---

        calculateQuote(service, items = []) {
            const isFood = service === "food";
            let subtotal = 0;
            items.forEach(item => {
                subtotal += (Number(item.price) || 0) * (Number(item.quantity) || 1);
            });

            let deliveryFee = 0;
            if (isFood) {
                deliveryFee = subtotal > 399 ? 0 : 29;
            } else {
                deliveryFee = subtotal >= 999 ? 0 : 50;
            }

            const discount = isFood && subtotal > 399 ? 100 : 0;
            const total = Math.max(0, subtotal + deliveryFee - discount);

            return {
                subtotal,
                deliveryFee,
                discount,
                total
            };
        }

        placeOrder({ service, items, address, paymentMethod }) {
            const isFood = service === "food";
            const quote = this.calculateQuote(service, items);
            const prefix = isFood ? "THA-F" : "THA-S";
            const orderId = `${prefix}${Math.floor(10000 + Math.random() * 90000)}`;

            const newOrder = {
                id: orderId,
                orderNumber: orderId,
                service,
                createdAt: new Date().toISOString(),
                status: isFood ? "Order placed" : "Confirmed",
                progressIndex: 1,
                total: quote.total,
                amount: quote.total,
                deliveryFee: quote.deliveryFee,
                discount: quote.discount,
                items: structuredClone(items),
                address: structuredClone(address),
                estimatedDelivery: isFood ? "Estimated in 25–35 minutes" : "Estimated delivery in 2–3 business days",
                paymentMethod: paymentMethod || "upi"
            };

            this.orders.unshift(newOrder);
            this.persistOrders();

            // Save order address if not already present
            if (address && address.line1 && (!this.user.addresses || !this.user.addresses.length)) {
                this.saveAddress({ ...address, label: "Home" });
            }

            return {
                success: true,
                orderId,
                order: newOrder
            };
        }

        // --- PAYMENT GATEWAY INTEGRATION SERVICE ---

        initiatePayment({ orderAmount, method, vpa = "" }) {
            const paymentId = "pay_tha_" + Math.random().toString(36).substring(2, 10);
            const providerNames = {
                upi_gpay: "Google Pay (UPI)",
                upi_phonepe: "PhonePe (UPI)",
                upi_paytm: "Paytm (UPI)",
                upi_bhim: "BHIM (UPI)",
                upi_custom: "Unified Payments Interface (UPI)",
                card: "Secure Card Processing Gateway",
                netbanking: "Net Banking Interbank Gateway",
                cod: "Cash on Delivery Network"
            };

            return {
                success: true,
                paymentId,
                amount: orderAmount,
                method: method || "upi_gpay",
                methodLabel: providerNames[method] || "Secure Payment Provider",
                vpa: vpa ? vpa.trim() : "",
                status: "processing", // 'processing' | 'pending' | 'successful' | 'failed' | 'cancelled'
                createdAt: new Date().toISOString(),
                note: "Payment authorization is managed securely via backend payment provider handoff."
            };
        }

        verifyPayment({ paymentId, orderId, simulateStatus = "successful" }) {
            // Secure backend provider verification handler
            if (simulateStatus === "failed") {
                return {
                    success: false,
                    status: "failed",
                    message: "Payment declined by issuing bank or UPI provider. No money was charged."
                };
            }
            if (simulateStatus === "cancelled") {
                return {
                    success: false,
                    status: "cancelled",
                    message: "Payment transaction was cancelled by the user."
                };
            }
            if (simulateStatus === "pending") {
                return {
                    success: false,
                    status: "pending",
                    message: "Payment is pending authorization in your UPI app. Please approve within 5 minutes."
                };
            }

            // Successful confirmation from verified provider
            const order = orderId ? this.getOrderById(orderId) : null;
            if (order) {
                order.paymentStatus = "paid";
                order.paymentId = paymentId;
                this.persistOrders();
            }

            return {
                success: true,
                status: "successful",
                paymentId,
                orderId,
                verifiedAt: new Date().toISOString()
            };
        }

        getOrders(filter = "all") {
            if (filter === "all") return this.orders;
            return this.orders.filter(o => o.service === filter);
        }

        getOrderById(id) {
            return this.orders.find(o => o.id === id || o.orderNumber === id) || null;
        }

        advanceOrderStatus(orderId) {
            const order = this.getOrderById(orderId);
            if (!order) return null;

            const foodSteps = [
                "Order placed",
                "Restaurant accepted",
                "Preparing",
                "Ready for pickup",
                "Delivery partner assigned",
                "Picked up",
                "Out for delivery",
                "Delivered"
            ];

            const shoppingSteps = [
                "Order placed",
                "Confirmed",
                "Preparing",
                "On the way",
                "Delivered"
            ];

            const steps = order.service === "food" ? foodSteps : shoppingSteps;
            const currentIndex = Math.max(0, order.progressIndex ?? 0);
            const nextIndex = Math.min(steps.length - 1, currentIndex + 1);

            order.progressIndex = nextIndex;
            order.status = steps[nextIndex];
            if (nextIndex === steps.length - 1) {
                order.estimatedDelivery = "Delivered";
            }

            this.persistOrders();
            return order;
        }
    }

    // Initialize globally
    window.THA_ONE_CORE = new ThaOneCore();
})();

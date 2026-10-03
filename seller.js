(() => {
    "use strict";

    try { localStorage.removeItem("tha-one-seller-profile"); } catch {}

    const keys = { products: "tha-one-seller-products", orders: "tha-one-seller-orders", settings: "tha-one-seller-settings" };
    const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
    const fallbackImage = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=300&q=76";
    const starterProducts = [
        { id: "seller-arc-headphones", name: "Arc wireless headphones", category: "Electronics", price: 6490, stock: 18, description: "Balanced sound and soft everyday comfort.", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=300&q=76" },
        { id: "seller-ceramic-lamp", name: "Daylight ceramic lamp", category: "Home", price: 4290, stock: 7, description: "A warm light for your favourite corner.", image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=300&q=76" },
        { id: "seller-hydra-bottle", name: "Hydra steel bottle", category: "Accessories", price: 790, stock: 32, description: "A double-wall bottle for every day.", image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=300&q=76" },
        { id: "seller-cloud-tee", name: "Cloud knit everyday tee", category: "Fashion", price: 1290, stock: 3, description: "A relaxed fit in a soft breathable knit.", image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=300&q=76" }
    ];
    const starterOrders = [
        { id: "THA-04218", customer: "Aarav Mehta", email: "aarav@example.com", items: "Arc wireless headphones", quantity: 1, date: "2026-10-03", total: 6490, status: "New" },
        { id: "THA-04217", customer: "Isha Nair", email: "isha@example.com", items: "Daylight ceramic lamp", quantity: 1, date: "2026-10-03", total: 4290, status: "Processing" },
        { id: "THA-04212", customer: "Kabir Shah", email: "kabir@example.com", items: "Hydra steel bottle × 2", quantity: 2, date: "2026-10-02", total: 1580, status: "Shipped" },
        { id: "THA-04208", customer: "Mira Rao", email: "mira@example.com", items: "Cloud knit everyday tee", quantity: 1, date: "2026-10-01", total: 1290, status: "Delivered" },
        { id: "THA-04203", customer: "Dev Kapoor", email: "dev@example.com", items: "Arc wireless headphones", quantity: 1, date: "2026-09-30", total: 6490, status: "Delivered" }
    ];

    function load(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return value ?? fallback;
        } catch {
            return fallback;
        }
    }

    const store = {
        products: load(keys.products, structuredClone(starterProducts)),
        orders: load(keys.orders, structuredClone(starterOrders)),
        profile: { storeName: "", ownerName: "", email: "", phone: "", description: "" },
        settings: load(keys.settings, { notifyOrders: true, acceptingOrders: true, lowStockAlert: true })
    };
    let imageData = "";
    let salesRange = 7;

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    }

    function icon(name) {
        return `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
    }

    function save(key, value) {
        try { localStorage.setItem(keys[key], JSON.stringify(value)); }
        catch { toast("This change couldn’t be saved in the browser."); }
    }

    function toast(message) {
        const region = document.getElementById("seller-toast-region");
        const item = document.createElement("div");
        item.className = "toast";
        item.setAttribute("role", "status");
        item.textContent = message;
        region.append(item);
        window.setTimeout(() => item.remove(), 2600);
    }

    function setView(name) {
        document.querySelectorAll("[data-seller-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.sellerPanel === name));
        document.querySelectorAll("[data-seller-view]").forEach((button) => {
            const active = button.dataset.sellerView === name;
            button.classList.toggle("active", active);
            if (button.classList.contains("ops-nav-button")) {
                if (active) button.setAttribute("aria-current", "page");
                else button.removeAttribute("aria-current");
            }
        });
        const panel = document.querySelector(`[data-seller-panel="${name}"]`);
        if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function stockStatus(product) {
        if (product.stock < 1) return ["Out of stock", "cancelled"];
        if (product.stock < 6) return ["Low stock", "pending"];
        return ["In stock", ""];
    }

    function renderStats() {
        const orderRevenue = store.orders.filter((order) => order.status !== "Cancelled").reduce((total, order) => total + Number(order.total || 0), 0);
        const newOrders = store.orders.filter((order) => order.status === "New").length;
        const customers = new Set(store.orders.map((order) => order.email)).size;
        const stats = [
            ["Gross sales", money.format(orderRevenue), "+8.4% vs last week"],
            ["Orders", String(store.orders.length), `${newOrders} need your attention`],
            ["Active products", String(store.products.filter((product) => product.stock > 0).length), `${store.products.length} total listings`],
            ["Customers", String(customers), "Across your recent orders"]
        ];
        const markup = stats.map(([label, value, foot]) => `<article class="ops-stat-card"><p class="ops-stat-label">${label}</p><p class="ops-stat-value">${value}</p><p class="ops-stat-foot">${foot}</p></article>`).join("");
        document.getElementById("seller-overview-stats").innerHTML = markup;
        document.getElementById("seller-sales-stats").innerHTML = markup;
        document.getElementById("seller-earnings-stats").innerHTML = `<article class="ops-stat-card"><p class="ops-stat-label">Estimated balance</p><p class="ops-stat-value">${money.format(orderRevenue * .9)}</p><p class="ops-stat-foot">After marketplace fees</p></article><article class="ops-stat-card"><p class="ops-stat-label">Next payout</p><p class="ops-stat-value">${money.format(orderRevenue * .9)}</p><p class="ops-stat-foot">Payout schedule not connected</p></article><article class="ops-stat-card"><p class="ops-stat-label">Orders completed</p><p class="ops-stat-value">${store.orders.filter((order) => order.status === "Delivered").length}</p><p class="ops-stat-foot">Ready for settlement</p></article><article class="ops-stat-card"><p class="ops-stat-label">Average order value</p><p class="ops-stat-value">${money.format(orderRevenue / Math.max(1, store.orders.length))}</p><p class="ops-stat-foot">Based on recent orders</p></article>`;
        const bars = [42, 63, 48, 76, 58, 88, 69];
        const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const chart = bars.map((height, index) => `<div class="ops-chart-column"><div class="ops-chart-bar" style="height:${height}%" title="${labels[index]} sales"></div><span>${labels[index]}</span></div>`).join("");
        ["seller-overview-chart", "seller-sales-chart"].forEach((id) => {
            const node = document.getElementById(id);
            if (node) node.innerHTML = chart;
        });
    }

    function renderRecentOrders() {
        const body = document.getElementById("seller-recent-orders");
        if (!store.orders.length) {
            body.innerHTML = '<tr><td colspan="5"><p class="service-empty">Your first order will appear here.</p></td></tr>';
            return;
        }
        body.innerHTML = store.orders.slice(0, 4).map((order) => `<tr><td><strong>${escapeHtml(order.id)}</strong></td><td>${escapeHtml(order.customer)}</td><td>${escapeHtml(order.date)}</td><td>${money.format(order.total)}</td><td><span class="ops-status ${order.status === "New" ? "pending" : order.status === "Cancelled" ? "cancelled" : ""}">${escapeHtml(order.status)}</span></td></tr>`).join("");
    }

    function renderProducts() {
        const search = document.getElementById("seller-product-search").value.trim().toLocaleLowerCase();
        const filter = document.getElementById("seller-stock-filter").value;
        const visible = store.products.filter((product) => {
            const textMatch = `${product.name} ${product.category}`.toLocaleLowerCase().includes(search);
            const stockMatch = filter === "all" || filter === "in-stock" && product.stock >= 6 || filter === "low-stock" && product.stock > 0 && product.stock < 6 || filter === "out-of-stock" && product.stock < 1;
            return textMatch && stockMatch;
        });
        document.getElementById("seller-product-count").textContent = `${visible.length} of ${store.products.length} listings.`;
        document.getElementById("seller-product-rows").innerHTML = visible.length ? visible.map((product) => {
            const [label, className] = stockStatus(product);
            return `<tr><td><span class="ops-product-name-cell"><img class="table-image" src="${escapeHtml(product.image || fallbackImage)}" alt=""><span><strong>${escapeHtml(product.name)}</strong><br><span class="ops-muted-text">${escapeHtml(product.category)}</span></span></span></td><td>${money.format(product.price)}</td><td>${Number(product.stock)}</td><td><span class="ops-status ${className}">${label}</span></td><td><div class="ops-row-actions"><button class="ops-icon-button" type="button" data-edit-product="${escapeHtml(product.id)}" aria-label="Edit ${escapeHtml(product.name)}">${icon("edit")}</button><button class="ops-icon-button danger" type="button" data-delete-product="${escapeHtml(product.id)}" aria-label="Delete ${escapeHtml(product.name)}">${icon("trash")}</button></div></td></tr>`;
        }).join("") : '<tr><td colspan="5"><p class="service-empty">No products match this view.</p></td></tr>';
    }

    function renderOrders() {
        const filter = document.getElementById("seller-order-filter").value;
        const visible = store.orders.filter((order) => filter === "all" || order.status === filter);
        document.getElementById("seller-order-rows").innerHTML = visible.length ? visible.map((order) => `<tr><td><strong>${escapeHtml(order.id)}</strong></td><td>${escapeHtml(order.customer)}</td><td>${escapeHtml(order.items)}</td><td>${escapeHtml(order.date)}</td><td>${money.format(order.total)}</td><td><select class="seller-status-select" data-order-status="${escapeHtml(order.id)}" aria-label="Update ${escapeHtml(order.id)} status">${["New", "Processing", "Shipped", "Delivered", "Cancelled"].map((status) => `<option${status === order.status ? " selected" : ""}>${status}</option>`).join("")}</select></td></tr>`).join("") : '<tr><td colspan="6"><p class="service-empty">No orders to show in this status.</p></td></tr>';
    }

    function renderCustomers() {
        const map = new Map();
        store.orders.forEach((order) => {
            const customer = map.get(order.email) || { name: order.customer, email: order.email, orders: 0, total: 0, lastOrder: order.date };
            customer.orders += 1;
            customer.total += Number(order.total || 0);
            if (order.date > customer.lastOrder) customer.lastOrder = order.date;
            map.set(order.email, customer);
        });
        const customers = [...map.values()];
        document.getElementById("seller-customer-rows").innerHTML = customers.length ? customers.map((customer) => `<tr><td><strong>${escapeHtml(customer.name)}</strong><br>${escapeHtml(customer.email)}</td><td>${customer.orders}</td><td>${escapeHtml(customer.lastOrder)}</td><td>${money.format(customer.total)}</td></tr>`).join("") : '<tr><td colspan="4"><p class="service-empty">Customer details appear here when you receive orders.</p></td></tr>';
    }

    function renderEarnings() {
        const rows = store.orders.filter((order) => order.status === "Delivered");
        document.getElementById("seller-earnings-rows").innerHTML = rows.length ? rows.map((order) => `<tr><td><strong>${escapeHtml(order.id)}</strong></td><td>${escapeHtml(order.date)}</td><td>${money.format(order.total)}</td><td>${money.format(order.total * .9)}</td><td><span class="ops-status">Estimated</span></td></tr>`).join("") : '<tr><td colspan="5"><p class="service-empty">Completed order earnings will appear here.</p></td></tr>';
    }

    function renderAll() {
        renderStats();
        renderRecentOrders();
        renderProducts();
        renderOrders();
        renderCustomers();
        renderEarnings();
        document.querySelector(".ops-status-open").classList.toggle("is-paused", !store.settings.acceptingOrders);
        document.querySelector(".ops-status-open").lastChild.textContent = store.settings.acceptingOrders ? "Store is open" : "Store is paused";
    }

    function openProductDialog(product = null) {
        const dialog = document.getElementById("seller-product-dialog");
        const form = document.getElementById("seller-product-form");
        form.reset();
        imageData = "";
        document.getElementById("seller-product-id").value = product?.id || "";
        document.getElementById("seller-product-dialog-title").textContent = product ? "Edit product" : "Add a product";
        document.getElementById("seller-image-preview").innerHTML = product?.image ? `<img src="${escapeHtml(product.image)}" alt="Product preview"><span>Current product image. Choose a new image to replace it.</span>` : "Choose a JPG, PNG or WebP image under 1 MB.";
        document.getElementById("seller-product-name").value = product?.name || "";
        document.getElementById("seller-product-category").value = product?.category || "Electronics";
        document.getElementById("seller-product-price").value = product?.price ?? "";
        document.getElementById("seller-product-stock").value = product?.stock ?? "";
        document.getElementById("seller-product-description").value = product?.description || "";
        dialog.showModal();
        document.getElementById("seller-product-name").focus();
    }

    function uploadPreview(file) {
        const preview = document.getElementById("seller-image-preview");
        if (!file) return;
        if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 1024 * 1024) {
            document.getElementById("seller-product-image").value = "";
            preview.textContent = "Choose a JPG, PNG or WebP image under 1 MB.";
            toast("That image must be a JPG, PNG or WebP file under 1 MB.");
            return;
        }
        const reader = new FileReader();
        reader.addEventListener("load", () => {
            imageData = String(reader.result);
            preview.innerHTML = `<img src="${imageData}" alt="Uploaded product preview"><span>${escapeHtml(file.name)}</span>`;
        });
        reader.addEventListener("error", () => toast("We couldn’t preview that image."));
        reader.readAsDataURL(file);
    }

    function saveProduct(event) {
        event.preventDefault();
        const idInput = document.getElementById("seller-product-id");
        const existing = store.products.find((product) => product.id === idInput.value);
        const product = {
            id: existing?.id || `seller-${Date.now()}`,
            name: document.getElementById("seller-product-name").value.trim(),
            category: document.getElementById("seller-product-category").value,
            price: Number(document.getElementById("seller-product-price").value),
            stock: Number(document.getElementById("seller-product-stock").value),
            description: document.getElementById("seller-product-description").value.trim(),
            image: imageData || existing?.image || fallbackImage
        };
        if (!product.name || !product.description || !Number.isFinite(product.price) || product.price <= 0 || !Number.isInteger(product.stock) || product.stock < 0) {
            toast("Add a name, description, positive price and valid stock count.");
            return;
        }
        if (existing) Object.assign(existing, product);
        else store.products.unshift(product);
        save("products", store.products);
        renderAll();
        document.getElementById("seller-product-dialog").close();
        setView("products");
        toast(existing ? "Product updated." : "Product added to your listings.");
    }

    function updateOrderStatus(orderId, status) {
        const order = store.orders.find((item) => item.id === orderId);
        if (!order) return;
        order.status = status;
        save("orders", store.orders);
        renderAll();
        toast(`${orderId} moved to ${status.toLowerCase()}.`);
    }

    function loadProfile() {
        Object.entries({
            "seller-store-name": "storeName",
            "seller-owner-name": "ownerName",
            "seller-store-email": "email",
            "seller-store-phone": "phone",
            "seller-store-description": "description"
        }).forEach(([id, key]) => { document.getElementById(id).value = store.profile[key] || ""; });
    }

    async function init() {
        const gate = document.getElementById("seller-access-gate");
        const dashboard = document.getElementById("seller-dashboard");
        const access = window.THA_ONE_KYC_ACCESS;
        if (!access) {
            gate.querySelector("[data-gate-title]").textContent = "Verification service unavailable";
            gate.querySelector("[data-gate-message]").textContent = "Seller dashboard access remains closed until verification can be confirmed securely.";
            return;
        }
        if (!await access.requireVerified("seller", gate, dashboard)) return;
        renderAll();
        loadProfile();
        document.querySelectorAll("[data-seller-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.sellerView)));
        document.getElementById("seller-add-product").addEventListener("click", () => openProductDialog());
        document.getElementById("seller-add-product-overview").addEventListener("click", () => openProductDialog());
        document.getElementById("seller-product-dialog-close").addEventListener("click", () => document.getElementById("seller-product-dialog").close());
        document.getElementById("seller-product-cancel").addEventListener("click", () => document.getElementById("seller-product-dialog").close());
        document.getElementById("seller-product-form").addEventListener("submit", saveProduct);
        document.getElementById("seller-product-image").addEventListener("change", (event) => uploadPreview(event.currentTarget.files?.[0]));
        document.getElementById("seller-product-search").addEventListener("input", renderProducts);
        document.getElementById("seller-stock-filter").addEventListener("change", renderProducts);
        document.getElementById("seller-product-rows").addEventListener("click", (event) => {
            const edit = event.target.closest("[data-edit-product]");
            const remove = event.target.closest("[data-delete-product]");
            if (edit) openProductDialog(store.products.find((product) => product.id === edit.dataset.editProduct));
            if (remove) {
                const product = store.products.find((item) => item.id === remove.dataset.deleteProduct);
                if (!product || !window.confirm(`Remove “${product.name}” from your listings?`)) return;
                store.products = store.products.filter((item) => item.id !== product.id);
                save("products", store.products);
                renderAll();
                toast("Product removed from your listings.");
            }
        });
        document.getElementById("seller-order-rows").addEventListener("change", (event) => {
            const select = event.target.closest("[data-order-status]");
            if (select) updateOrderStatus(select.dataset.orderStatus, select.value);
        });
        document.getElementById("seller-order-filter").addEventListener("change", renderOrders);
        document.getElementById("seller-profile-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            store.profile = {
                storeName: document.getElementById("seller-store-name").value.trim(),
                ownerName: document.getElementById("seller-owner-name").value.trim(),
                email: document.getElementById("seller-store-email").value.trim(),
                phone: document.getElementById("seller-store-phone").value.trim(),
                description: document.getElementById("seller-store-description").value.trim()
            };
            try {
                await window.THA_ONE_KYC_ACCESS.updateProfile("seller", store.profile);
                toast("Store profile saved securely.");
            } catch (error) {
                toast(error.message || "Store profile could not be saved.");
            }
        });
        [["seller-notify-orders", "notifyOrders"], ["seller-store-open", "acceptingOrders"], ["seller-low-stock-alert", "lowStockAlert"]].forEach(([id, key]) => {
            const checkbox = document.getElementById(id);
            checkbox.checked = Boolean(store.settings[key]);
            checkbox.addEventListener("change", () => {
                store.settings[key] = checkbox.checked;
                save("settings", store.settings);
                renderAll();
            });
        });
        document.getElementById("seller-payout-info").addEventListener("click", () => toast("Payout settings will be available when seller payments are connected."));
        document.getElementById("seller-sales-range").addEventListener("change", (event) => {
            salesRange = Number(event.currentTarget.value);
            document.querySelector("#seller-sales-chart").setAttribute("aria-label", `Sales activity for the last ${salesRange} days`);
        });
        document.getElementById("seller-product-dialog").addEventListener("click", (event) => {
            if (event.target === event.currentTarget) event.currentTarget.close();
        });
    }

    init();
})();

(() => {
    const services = [
        { id: "shopping", label: "Shopping", icon: "🛒", description: "Find good things for everyday.", href: "home.html" },
        { id: "food", label: "Food", icon: "🍔", description: "Discover a good meal nearby.", href: "food.html" },
        { id: "seller", label: "Seller", icon: "🏪", description: "Manage your store and orders.", href: "seller.html" },
        { id: "delivery", label: "Delivery Partner", icon: "🛵", description: "Manage deliveries and earnings.", href: "delivery.html" }
    ];

    class ThaAppSwitcher extends HTMLElement {
        static get observedAttributes() { return ["current"]; }

        connectedCallback() {
            if (this.shadowRoot) return;
            this.attachShadow({ mode: "open" });
            this.render();
            this.handleDocumentClick = this.handleDocumentClick.bind(this);
            this.handleKeydown = this.handleKeydown.bind(this);
            this.ownerDocument.addEventListener("click", this.handleDocumentClick);
            this.ownerDocument.addEventListener("keydown", this.handleKeydown);
        }

        disconnectedCallback() {
            this.ownerDocument.removeEventListener("click", this.handleDocumentClick);
            this.ownerDocument.removeEventListener("keydown", this.handleKeydown);
        }

        attributeChangedCallback(name) {
            if (name === "current" && this.shadowRoot) this.render();
        }

        get currentService() {
            const attribute = this.getAttribute("current");
            if (attribute === "admin") return { id: "admin", label: "Admin review", icon: "✓" };
            const current = attribute === "auto" ? new URLSearchParams(window.location.search).get("service") : attribute;
            return services.find((service) => service.id === current) || services[0];
        }

        render() {
            const active = this.currentService;
            const serviceOptions = services.map((service) => `
                <a class="service-option${service.id === active.id ? " is-current" : ""}" data-service="${service.id}" href="${service.href}" ${service.id === active.id ? 'aria-current="page"' : ""} role="menuitem">
                    <span class="service-icon" aria-hidden="true">${service.icon}</span>
                    <span class="service-copy"><strong>${service.label}</strong><small data-service-description>${service.description}</small></span>
                    ${service.id === active.id ? '<span class="current-mark" aria-label="Current service">✓</span>' : ""}
                </a>`).join("");
            this.shadowRoot.innerHTML = `
                <style>
                    :host { position: sticky; z-index: 100; top: 0; display: block; color: #20372e; font-family: "DM Sans", "Segoe UI", sans-serif; }
                    * { box-sizing: border-box; }
                    button, a { font: inherit; }
                    button:focus-visible, a:focus-visible { outline: 3px solid rgba(131,170,97,.52); outline-offset: 2px; }
                    .bar { position: relative; display: flex; min-height: 47px; align-items: center; justify-content: space-between; gap: 15px; padding: 0 max(20px, calc((100vw - 1320px) / 2)); border-bottom: 1px solid rgba(221,229,217,.92); background: rgba(250,252,248,.97); box-shadow: 0 3px 12px rgba(30,48,36,.035); backdrop-filter: blur(15px); }
                    .brand { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 8px; color: #20372e; font-family: "Manrope", "Segoe UI", sans-serif; font-size: 12px; font-weight: 800; text-decoration: none; }
                    .brand b { color: #537b43; }
                    .mark { display: grid; width: 27px; height: 27px; place-items: center; border-radius: 9px 9px 9px 3px; color: #20372e; background: #b9ef58; font-size: 14px; }
                    .controls { display: flex; align-items: center; gap: 6px; }
                    .utility, .profile, .switch { display: inline-flex; min-height: 32px; align-items: center; justify-content: center; gap: 7px; padding: 0 10px; border: 1px solid transparent; border-radius: 4px; color: #5d6d60; background: transparent; cursor: pointer; font-size: 10px; font-weight: 600; text-decoration: none; white-space: nowrap; transition: background .16s ease, border-color .16s ease, color .16s ease; }
                    .utility:hover, .profile:hover, .switch:hover, .switch[aria-expanded="true"] { border-color: #e2e8df; color: #20372e; background: #fff; }
                    .utility svg, .profile svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
                    .switch { gap: 8px; padding: 0 10px; border-color: #dce6d6; color: #20372e; background: #f4f8ef; }
                    .switch-icon { font-size: 13px; }
                    .chevron { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.8; transition: transform .18s ease; }
                    .switch[aria-expanded="true"] .chevron { transform: rotate(180deg); }
                    .panel { position: absolute; z-index: 2; top: calc(100% + 8px); right: max(20px, calc((100vw - 1320px) / 2)); width: min(352px, calc(100vw - 24px)); overflow: hidden; border: 1px solid #e3e9df; border-radius: 7px; background: rgba(255,255,255,.98); box-shadow: 0 18px 50px rgba(25,43,31,.14); opacity: 0; pointer-events: none; transform: translateY(-6px) scale(.985); transform-origin: top right; transition: opacity .16s ease, transform .16s ease; }
                    .panel.is-open { opacity: 1; pointer-events: auto; transform: translateY(0) scale(1); }
                    .panel[hidden] { display: none; }
                    .panel-heading { margin: 0; padding: 15px 16px 10px; color: #89958b; font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
                    .service-list { display: grid; gap: 3px; padding: 0 7px 8px; }
                    .service-option { display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: 10px; min-height: 57px; padding: 8px; border: 1px solid transparent; border-radius: 5px; color: #526056; text-decoration: none; transition: background .16s ease, border-color .16s ease; }
                    .service-option:hover { border-color: #edf1e9; background: #f7f9f4; }
                    .service-option.is-current { border-color: #dbe7d2; color: #2d4a32; background: #f0f6e9; }
                    .service-icon { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 7px; background: #f2f4ef; font-size: 16px; }
                    .is-current .service-icon { background: #e2efd5; }
                    .service-copy strong, .service-copy small { display: block; }
                    .service-copy strong { font-size: 11px; font-weight: 700; }
                    .service-copy small { margin-top: 3px; color: #8a958b; font-size: 9px; }
                    .current-mark { padding-right: 5px; color: #4e7542; font-size: 13px; font-weight: 700; }
                    .notice { padding: 15px 16px 17px; color: #68766b; font-size: 11px; line-height: 1.65; }
                    .notice strong { display: block; margin-bottom: 3px; color: #293d30; font-size: 12px; }
                    .notice a { display: inline-block; margin-top: 9px; color: #527648; font-size: 10px; font-weight: 700; text-decoration: none; }
                    .notice a:hover { text-decoration: underline; text-underline-offset: 3px; }
                    @media (max-width: 620px) {
                        .bar { min-height: 43px; gap: 6px; padding-inline: 11px; }
                        .brand { gap: 6px; font-size: 10px; }
                        .mark { width: 24px; height: 24px; font-size: 12px; }
                        .controls { gap: 1px; }
                        .utility, .profile { width: 30px; min-height: 30px; padding: 0; font-size: 0; }
                        .utility svg, .profile svg { width: 16px; height: 16px; }
                        .switch { min-height: 30px; gap: 5px; padding-inline: 7px; font-size: 9px; }
                        .switch-icon { font-size: 11px; }
                        .panel { right: 8px; }
                    }
                    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: .01ms !important; } }
                </style>
                <header class="bar">
                    <a class="brand" href="home.html" aria-label="THA ONE home"><span class="mark" aria-hidden="true">T</span><span>THA <b>ONE</b></span></a>
                    <div class="controls">
                        <button class="utility" type="button" data-panel="notifications" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg>Notifications</button>
                        <button class="utility" type="button" data-panel="help" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 4 1.8c-1 .7-1.7 1.1-1.7 2.7m0 3h.01"/></svg>Help</button>
                        <a class="profile" href="profile.html" aria-label="Profile and account"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>Profile</a>
                        <button class="switch" type="button" aria-haspopup="menu" aria-expanded="false"><span class="switch-icon" aria-hidden="true">${active.icon}</span><span>${active.label}</span><svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
                    </div>
                </header>
                <section class="panel" hidden aria-label="App switcher menu">
                    <p class="panel-heading">Switch service</p>
                    <nav class="service-list" role="menu" aria-label="THA ONE services">${serviceOptions}</nav>
                </section>
                <section class="panel" hidden aria-label="Global notifications">
                    <p class="panel-heading">Notifications</p>
                    <div class="notice"><strong>You’re all caught up.</strong>Order updates and service notices will show here.</div>
                </section>
                <section class="panel" hidden aria-label="Help and support">
                    <p class="panel-heading">Help &amp; support</p>
                    <div class="notice"><strong>We’re here to help.</strong>Find answers, contact THA ONE support, or browse our help centre.<br><a href="home.html#footer">Visit help centre →</a></div>
                </section>`;

            const switchButton = this.shadowRoot.querySelector(".switch");
            switchButton.addEventListener("click", () => this.togglePanel("services"));
            this.shadowRoot.querySelectorAll("[data-panel]").forEach((button) => {
                button.addEventListener("click", () => this.togglePanel(button.dataset.panel));
            });
            this.shadowRoot.querySelectorAll(".service-option").forEach((link) => {
                link.addEventListener("click", (event) => {
                    event.preventDefault();
                    const service = services.find((item) => item.id === link.dataset.service);
                    if (service) this.navigateService(service);
                });
            });
        }

        togglePanel(name) {
            const panels = [...this.shadowRoot.querySelectorAll(".panel")];
            if (name === "close") {
                panels.forEach((panel) => {
                    panel.hidden = true;
                    panel.classList.remove("is-open");
                });
                this.shadowRoot.querySelectorAll("button[aria-expanded]").forEach((button) => button.setAttribute("aria-expanded", "false"));
                return;
            }
            const nextPanel = name === "services" ? panels[0] : name === "notifications" ? panels[1] : panels[2];
            const shouldOpen = nextPanel.hidden;
            panels.forEach((panel) => {
                panel.hidden = true;
                panel.classList.remove("is-open");
            });
            this.shadowRoot.querySelectorAll("button[aria-expanded]").forEach((button) => button.setAttribute("aria-expanded", "false"));
            if (shouldOpen) {
                nextPanel.hidden = false;
                requestAnimationFrame(() => nextPanel.classList.add("is-open"));
                const button = name === "services" ? this.shadowRoot.querySelector(".switch") : this.shadowRoot.querySelector(`[data-panel="${name}"]`);
                button?.setAttribute("aria-expanded", "true");
                if (name === "services") this.refreshServiceStatus();
            }
        }

        async refreshServiceStatus() {
            const access = window.THA_ONE_KYC_ACCESS;
            if (!access) return;
            const serviceLinks = [...this.shadowRoot.querySelectorAll('.service-option[data-service="seller"], .service-option[data-service="delivery"]')];
            await Promise.all(serviceLinks.map(async (link) => {
                const status = await access.checkStatus(link.dataset.service);
                const description = link.querySelector("[data-service-description]");
                if (!description || !this.isConnected) return;
                if (status.verified) description.textContent = link.dataset.service === "seller" ? "Seller Dashboard" : "Delivery Dashboard";
                else if (["pending", "submitted", "in_review"].includes(status.status)) description.textContent = "Pending Verification";
                else if (["failed", "rejected"].includes(status.status)) description.textContent = "Complete Verification";
                else description.textContent = "Complete Verification";
            }));
        }

        navigate(destination) {
            const url = new URL(destination, window.location.href);
            if (url.origin !== window.location.origin) return;
            window.location.assign(url.href);
        }

        async navigateService(service) {
            let destination = service.href;
            if (service.id === "seller" || service.id === "delivery") {
                const config = window.THA_ONE_KYC_CONFIG || {};
                const onboardingPath = config.onboardingPaths?.[service.id] || `${service.id}-onboarding.html`;
                const dashboardPath = config.dashboardPaths?.[service.id] || service.href;
                destination = onboardingPath;

                const status = await window.THA_ONE_KYC_ACCESS?.checkStatus(service.id);
                if (status?.verified === true) destination = dashboardPath;
            }
            this.navigate(destination);
        }

        handleDocumentClick(event) {
            if (!event.composedPath().includes(this)) this.togglePanel("close");
        }

        handleKeydown(event) {
            if (event.key === "Escape") {
                this.togglePanel("close");
                this.shadowRoot.querySelector(".switch")?.focus();
            }
        }
    }

    if (!customElements.get("tha-app-switcher")) customElements.define("tha-app-switcher", ThaAppSwitcher);
})();

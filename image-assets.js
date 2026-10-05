(() => {
    "use strict";

    const fallbacks = Object.freeze({
        product: "assets/fallback-product.svg",
        food: "assets/fallback-food.svg",
        restaurant: "assets/fallback-restaurant.svg",
        banner: "assets/fallback-banner.svg"
    });

    function escape(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    }

    function markup(kind, source, alt, className = "", loading = "lazy") {
        const fallback = fallbacks[kind] || fallbacks.product;
        const image = source || fallback;
        const fetchPriority = loading === "eager" ? ' fetchpriority="high"' : "";
        return `<img class="${escape(className)} image-loading" src="${escape(image)}" alt="${escape(alt)}" loading="${escape(loading)}" decoding="async" data-image-kind="${escape(kind)}" data-image-fallback="${escape(fallback)}" data-image-state="loading"${fetchPriority}>`;
    }

    function applyFallback(image) {
        const fallback = image.dataset.imageFallback || fallbacks[image.dataset.imageKind];
        if (!fallback) return;
        if (image.dataset.fallbackAttempted !== "true") {
            image.dataset.fallbackAttempted = "true";
            image.src = fallback;
            return;
        }
        image.classList.add("image-unavailable");
    }

    document.addEventListener("error", (event) => {
        const image = event.target;
        if (!(image instanceof HTMLImageElement)) return;
        applyFallback(image);
    }, true);

    document.addEventListener("load", (event) => {
        const image = event.target;
        if (!(image instanceof HTMLImageElement) || !image.dataset.imageKind) return;
        image.dataset.imageState = image.dataset.fallbackAttempted === "true" ? "fallback" : "loaded";
        image.classList.remove("image-loading");
    }, true);

    document.querySelectorAll("img[data-image-kind]").forEach((image) => {
        if (image.complete && image.naturalWidth === 0) applyFallback(image);
    });

    window.THA_ONE_IMAGES = Object.freeze({ markup, fallbacks });
})();
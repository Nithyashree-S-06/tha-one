window.THA_ONE_KYC_CONFIG = Object.freeze({
    apiOrigin: "",
    csrfTokenEndpoint: "",
    statusEndpoint: "",
    sellerProfileEndpoint: "",
    deliveryProfileEndpoint: "",
    sellerSubmissionEndpoint: "",
    deliverySubmissionEndpoint: "",
    documentUploadEndpoint: "",
    documentDeleteEndpoint: "",
    identityStartEndpoint: "",
    adminQueueEndpoint: "",
    adminActionEndpoint: "",
    adminCsrfTokenEndpoint: "",
    maxDocumentBytes: 5 * 1024 * 1024,
    acceptedDocumentTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    onboardingPaths: {
        seller: "seller-onboarding.html",
        delivery: "delivery-onboarding.html"
    },
    dashboardPaths: {
        seller: "seller.html",
        delivery: "delivery.html"
    }
});

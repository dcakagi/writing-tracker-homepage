(function () {
  function setDebug(status, details) {
    window.__gaDebug = {
      status,
      details: details || {},
      updatedAt: new Date().toISOString()
    };
  }

  function getMeasurementId() {
    const config = window.APP_CONFIG;
    if (!config || !config.analytics) return "";
    const value = config.analytics.measurementId;
    return typeof value === "string" ? value.trim() : "";
  }

  function isValidMeasurementId(id) {
    return /^G-[A-Z0-9]+$/i.test(id);
  }

  function loadAnalytics() {
    const measurementId = getMeasurementId();
    setDebug("init", {
      measurementId,
      hasConfig: Boolean(window.APP_CONFIG),
      hasAnalyticsConfig: Boolean(window.APP_CONFIG && window.APP_CONFIG.analytics)
    });

    if (!isValidMeasurementId(measurementId)) {
      setDebug("skipped-invalid-id", { measurementId });
      return;
    }
    if (window.__gaLoaded) {
      setDebug("skipped-already-loaded", { measurementId });
      return;
    }
    window.__gaLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", measurementId);

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.addEventListener("load", () => {
      setDebug("loaded", { measurementId, scriptSrc: script.src });
    });
    script.addEventListener("error", () => {
      setDebug("script-error", { measurementId, scriptSrc: script.src });
    });
    document.head.appendChild(script);
    setDebug("script-injected", { measurementId, scriptSrc: script.src });
  }

  if (document.readyState === "complete") {
    setDebug("document-complete", { readyState: document.readyState });
    loadAnalytics();
  } else {
    setDebug("waiting-for-load", { readyState: document.readyState });
    window.addEventListener("load", loadAnalytics, { once: true });
  }
})();
/* ===========================
   Main Homepage Functionality
   =========================== */

(function () {
  const UPDATE_INTERVAL_MS = 1000;

  const GRADIENTS = [
    { from: "from-orange-400", to: "to-pink-500" },
    { from: "from-teal-400", to: "to-blue-500" },
    { from: "from-green-400", to: "to-purple-500" },
    { from: "from-pink-300", to: "to-yellow-300" },
    { from: "from-indigo-500", to: "to-purple-700" },
    { from: "from-green-300", to: "to-cyan-400" },
    { from: "from-red-500", to: "to-yellow-500" },
    { from: "from-purple-300", to: "to-indigo-400" },
    { from: "from-blue-300", to: "to-indigo-500" }
  ];

  function getConfig() {
    return window.APP_CONFIG && typeof window.APP_CONFIG === "object"
      ? window.APP_CONFIG
      : {};
  }

  function getFeature(name, fallback) {
    const features = getConfig().features;
    if (!features || !Object.prototype.hasOwnProperty.call(features, name)) return fallback;
    return features[name] !== false;
  }

  function getBookmarks() {
    const bookmarks = getConfig().bookmarks;
    if (!Array.isArray(bookmarks)) return [];

    const usedIds = new Set();
    return bookmarks.reduce((result, bookmark, index) => {
      if (!bookmark || typeof bookmark !== "object" || !bookmark.url || !bookmark.label) return result;

      const fallbackId = `bookmark-${index + 1}`;
      let id = String(bookmark.id || fallbackId)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "") || fallbackId;

      if (usedIds.has(id)) id = `${id}-${index + 1}`;
      usedIds.add(id);
      result.push({ ...bookmark, id });
      return result;
    }, []);
  }

  function getBookmarkKeys() {
    return getBookmarks().map((bookmark) => bookmark.id);
  }

  function reorderChildren(container, attributeName, preferredOrder) {
    if (!container || !Array.isArray(preferredOrder)) return;

    const children = Array.from(container.children);
    const byId = new Map(children.map((child) => [child.getAttribute(attributeName), child]));
    const ordered = [];

    preferredOrder.forEach((id) => {
      const child = byId.get(id);
      if (!child || ordered.includes(child)) return;
      ordered.push(child);
    });

    children.forEach((child) => {
      if (!ordered.includes(child)) ordered.push(child);
    });

    ordered.forEach((child) => container.appendChild(child));
  }

  function setElementEnabled(element, enabled) {
    if (!element) return;
    element.classList.toggle("hidden", !enabled);
    element.setAttribute("aria-hidden", enabled ? "false" : "true");
  }

  function applyConfiguration() {
    const config = getConfig();
    const title = config.site && config.site.title ? String(config.site.title) : "My Homepage";
    document.title = title;

    const pageTitle = document.getElementById("app-page-title");
    if (pageTitle) pageTitle.textContent = title;

    const favicon = document.getElementById("app-favicon");
    if (favicon && config.site && config.site.favicon) {
      favicon.setAttribute("href", String(config.site.favicon));
    }

    const sectionsRoot = document.getElementById("homepage-sections");
    reorderChildren(sectionsRoot, "data-section-id", config.sectionOrder);

    ["dashboard", "writing", "reading", "todo", "hackernews", "githubtrending", "bookmarks"].forEach((sectionId) => {
      setElementEnabled(
        document.querySelector(`[data-section-id="${sectionId}"]`),
        getFeature(sectionId, true)
      );
    });
    setElementEnabled(document.getElementById("backup-controls"), true);

    const widgetFeatures = {
      timer: "timer",
      "weekly-weather": "weeklyWeather",
      quote: "quote",
      "hourly-weather": "hourlyWeather",
      habit: "habit"
    };
    const dashboard = document.getElementById("dashboard-widgets");
    reorderChildren(dashboard, "data-widget-id", config.dashboardWidgetOrder);
    Object.entries(widgetFeatures).forEach(([widgetId, featureName]) => {
      setElementEnabled(
        document.querySelector(`[data-widget-id="${widgetId}"]`),
        getFeature(featureName, true)
      );
    });
  }

  function renderBookmarks() {
    const grid = document.getElementById("bookmark-grid");
    if (!grid) return;
    grid.replaceChildren();

    getBookmarks().forEach((bookmark) => {
      const link = document.createElement("a");
      link.href = String(bookmark.url);
      link.dataset.bookmarkKey = bookmark.id;
      link.className = "bookmark-link flex flex-col items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-xl px-4 py-4 shadow text-gray-800 text-sm font-medium";
      if (bookmark.newTab === true) {
        link.target = "_blank";
        link.rel = "noreferrer";
      }

      if (bookmark.icon) {
        const icon = document.createElement("img");
        icon.src = String(bookmark.icon);
        icon.alt = "";
        icon.className = "w-8 h-8 mb-2";
        icon.addEventListener("error", () => icon.remove(), { once: true });
        link.appendChild(icon);
      }

      const label = document.createElement("span");
      label.textContent = String(bookmark.label);
      link.appendChild(label);

      const count = document.createElement("span");
      count.id = `${bookmark.id}-count`;
      count.className = "text-xs text-gray-500";
      link.appendChild(count);

      grid.appendChild(link);
    });

    if (!grid.children.length) {
      const empty = document.createElement("p");
      empty.className = "col-span-full text-center text-sm text-gray-500";
      empty.textContent = "Add bookmarks from Customize or js/app-config.js.";
      grid.appendChild(empty);
    }
  }

  function normalizeBookmarkCounts(bookmarkCounts) {
    return bookmarkCounts && typeof bookmarkCounts === "object"
      ? { ...bookmarkCounts }
      : {};
  }

  function updateTimer() {
    const element = document.getElementById("countup");
    if (!element) return;

    const timerConfig = getConfig().timer || {};
    const startDate = new Date(timerConfig.start);
    if (Number.isNaN(startDate.getTime())) {
      element.textContent = "Set a timer date from Customize or js/app-config.js.";
      return;
    }

    const now = new Date();
    let diff = Math.floor((startDate.getTime() - now.getTime()) / 1000);
    const isFuture = diff > 0;
    diff = Math.abs(diff);

    const days = Math.floor(diff / 86400);
    diff %= 86400;
    const hours = Math.floor(diff / 3600);
    diff %= 3600;
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;

    const value = document.createElement("div");
    value.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    const label = document.createElement("div");
    label.className = "text-sm text-gray-500 mt-2";
    label.textContent = `${isFuture ? "Until" : "Since"} ${timerConfig.label || startDate.toLocaleString()}`;
    element.replaceChildren(value, label);
  }

  function displayRandomQuote() {
    const element = document.getElementById("quote");
    if (!element) return;

    const quotes = Array.isArray(getConfig().quotes) ? getConfig().quotes.filter(Boolean) : [];
    if (!quotes.length) {
      element.textContent = "Add quotes from Customize or js/app-config.js.";
      return;
    }

    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    const text = typeof quote === "string" ? quote : quote.text;
    const author = typeof quote === "object" ? quote.author : "";

    const quoteText = document.createElement("span");
    quoteText.className = "text-lg";
    quoteText.textContent = `“${text || ""}”`;
    element.replaceChildren(quoteText);

    if (author) {
      const breakElement = document.createElement("br");
      const authorText = document.createElement("span");
      authorText.className = "text-sm text-gray-500";
      authorText.textContent = String(author);
      element.append(breakElement, authorText);
    }
  }

  function trackVisit(key) {
    const homepageState = window.HomepageState;
    let bookmarkCounts = {};

    if (homepageState && typeof homepageState.loadUserState === "function") {
      bookmarkCounts = normalizeBookmarkCounts(homepageState.loadUserState().bookmark_counts);
    } else {
      const rawCount = localStorage.getItem(key);
      bookmarkCounts[key] = rawCount ? parseInt(rawCount, 10) || 0 : 0;
    }

    bookmarkCounts[key] = (bookmarkCounts[key] || 0) + 1;

    if (homepageState && typeof homepageState.saveUserStatePatch === "function") {
      homepageState.saveUserStatePatch({ bookmark_counts: bookmarkCounts });
    } else {
      localStorage.setItem(key, String(bookmarkCounts[key]));
    }

    const countElement = document.getElementById(`${key}-count`);
    if (countElement) countElement.textContent = `(${bookmarkCounts[key]})`;
  }

  function loadVisits() {
    const homepageState = window.HomepageState;
    const bookmarkCounts = homepageState && typeof homepageState.loadUserState === "function"
      ? normalizeBookmarkCounts(homepageState.loadUserState().bookmark_counts)
      : {};

    getBookmarkKeys().forEach((key) => {
      const element = document.getElementById(`${key}-count`);
      if (!element) return;
      const value = Object.prototype.hasOwnProperty.call(bookmarkCounts, key)
        ? bookmarkCounts[key]
        : parseInt(localStorage.getItem(key), 10) || 0;
      element.textContent = `(${value})`;
    });
  }

  function bindBookmarkTracking() {
    document.querySelectorAll(".bookmark-link[data-bookmark-key]").forEach((link) => {
      link.addEventListener("click", (event) => {
        const key = link.dataset.bookmarkKey;
        if (!key) return;
        trackVisit(key);

        const plainLeftClick = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
        if (!plainLeftClick || link.target === "_blank") return;

        event.preventDefault();
        window.setTimeout(() => window.location.assign(link.href), 75);
      });
    });
  }

  function applyRandomGradients() {
    const topLeftElement = document.getElementById("top-left-gradient");
    const bottomRightElement = document.getElementById("bottom-right-gradient");
    const bottomRightSecondaryElement = document.getElementById("bottom-right-gradient-secondary");
    if (!topLeftElement || !bottomRightElement || !bottomRightSecondaryElement) return;

    const topLeft = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];
    const bottomRight = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];
    const bottomRightSecondary = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];
    topLeftElement.classList.add(topLeft.from, topLeft.to);
    bottomRightElement.classList.add(bottomRight.from, bottomRight.to);
    bottomRightSecondaryElement.classList.add(bottomRightSecondary.from, bottomRightSecondary.to);
    topLeftElement.style.opacity = "0.3";
    bottomRightElement.style.opacity = "0.3";
    bottomRightSecondaryElement.style.opacity = "0.24";
  }

  document.addEventListener("DOMContentLoaded", async () => {
    applyConfiguration();
    renderBookmarks();
    applyRandomGradients();

    const dashboardEnabled = getFeature("dashboard", true);
    if (dashboardEnabled && getFeature("quote", true)) displayRandomQuote();
    if (dashboardEnabled && getFeature("timer", true)) {
      updateTimer();
      window.setInterval(updateTimer, UPDATE_INTERVAL_MS);
    }

    if (window.HomepageState && typeof window.HomepageState.initializeAppAuth === "function") {
      await window.HomepageState.initializeAppAuth();
    }

    loadVisits();
    bindBookmarkTracking();
    if (
      dashboardEnabled &&
      (getFeature("weeklyWeather", true) || getFeature("hourlyWeather", true)) &&
      window.initializeWeather
    ) {
      window.initializeWeather();
    }
    if (window.initializeWritingTracker) {
      await window.initializeWritingTracker();
    }
    if (getFeature("reading", true) && window.initializePaperTracker) {
      window.initializePaperTracker();
    }
    if (dashboardEnabled && getFeature("habit", true) && window.initializeHabitTracker) {
      window.initializeHabitTracker();
    }
    if (getFeature("todo", true) && window.initializeTodoList) {
      window.initializeTodoList();
    }
    if (getFeature("hackernews", true) && window.initializeHackerNews) {
      window.initializeHackerNews();
    }
    if (getFeature("githubtrending", true) && window.initializeGithubTrending) {
      window.initializeGithubTrending();
    }
  });

  if (window.HomepageState && window.HomepageState.events) {
    window.addEventListener(window.HomepageState.events.stateChanged, loadVisits);
  }

  window.HomepageTemplate = {
    getBookmarks,
    getBookmarkKeys,
    loadVisits
  };
})();

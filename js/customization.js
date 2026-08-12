(function () {
  const STORAGE_KEY = "homepage.customization.v1";
  const PREFERENCE_KEY = "customization";
  const MAX_QUOTES = 20;
  const MAX_BOOKMARKS = 20;
  const MAX_PREFERENCE_BYTES = 60000;

  const SECTION_ITEMS = [
    { id: "writing", label: "Writing" },
    { id: "bookmarks", label: "Bookmarks" },
    { id: "dashboard", label: "Dashboard widgets" }
  ];

  const WIDGET_ITEMS = [
    { id: "timer", label: "Timer", feature: "timer" },
    { id: "weekly-weather", label: "Weekly weather", feature: "weeklyWeather" },
    { id: "quote", label: "Quote", feature: "quote" },
    { id: "hourly-weather", label: "24-hour weather", feature: "hourlyWeather" },
    { id: "habit", label: "Habit tracker", feature: "habit" }
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function merge(base, override) {
    const result = clone(base || {});
    if (!isPlainObject(override)) return result;

    Object.keys(override).forEach((key) => {
      const value = override[key];
      result[key] = isPlainObject(value) && isPlainObject(result[key])
        ? merge(result[key], value)
        : clone(value);
    });
    return result;
  }

  function textValue(value, fallback, maxLength) {
    if (typeof value !== "string") return String(fallback || "").slice(0, maxLength);
    const trimmed = value.trim();
    return (trimmed || String(fallback || "")).slice(0, maxLength);
  }

  function optionalText(value, maxLength) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  }

  function boundedNumber(value, fallback, minimum, maximum) {
    const number = Number(value);
    return Number.isFinite(number) && number >= minimum && number <= maximum
      ? number
      : Number(fallback);
  }

  function orderedIds(value, items, fallback) {
    const allowed = new Set(items.map((item) => item.id));
    const result = [];
    (Array.isArray(value) ? value : []).forEach((id) => {
      if (allowed.has(id) && !result.includes(id)) result.push(id);
    });
    (Array.isArray(fallback) ? fallback : []).forEach((id) => {
      if (allowed.has(id) && !result.includes(id)) result.push(id);
    });
    items.forEach((item) => {
      if (!result.includes(item.id)) result.push(item.id);
    });
    return result;
  }

  function safeHttpUrl(value) {
    const candidate = optionalText(value, 1000);
    if (!candidate) return "";
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
    } catch (error) {
      return "";
    }
  }

  function safeIcon(value) {
    const candidate = optionalText(value, 1000);
    if (!candidate) return "";
    if (/^(?:javascript|data|vbscript):/i.test(candidate)) return "";
    if (/^https?:\/\//i.test(candidate)) return safeHttpUrl(candidate);
    return candidate.startsWith("//") ? "" : candidate;
  }

  function slug(value, fallback) {
    return optionalText(value, 80)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback;
  }

  function jsonByteLength(value) {
    const serialized = JSON.stringify(value);
    if (typeof TextEncoder === "function") return new TextEncoder().encode(serialized).length;
    return unescape(encodeURIComponent(serialized)).length;
  }

  function sanitizeCustomization(value, defaults) {
    const input = isPlainObject(value) ? value : {};
    const base = isPlainObject(defaults) ? defaults : {};
    const baseSite = base.site || {};
    const baseTimer = base.timer || {};
    const baseWriting = base.writing || {};
    const baseWeather = base.weather || {};
    const inputFeatures = isPlainObject(input.features) ? input.features : {};
    const baseFeatures = isPlainObject(base.features) ? base.features : {};

    const features = {};
    ["dashboard", "writing", "bookmarks", "timer", "weeklyWeather", "quote", "hourlyWeather", "habit"]
      .forEach((key) => {
        features[key] = typeof inputFeatures[key] === "boolean"
          ? inputFeatures[key]
          : baseFeatures[key] !== false;
      });

    const quotes = (Array.isArray(input.quotes) ? input.quotes : base.quotes || [])
      .slice(0, MAX_QUOTES)
      .reduce((result, quote) => {
        const source = typeof quote === "string" ? { text: quote, author: "" } : quote;
        if (!isPlainObject(source)) return result;
        const quoteText = optionalText(source.text, 500);
        if (!quoteText) return result;
        result.push({ text: quoteText, author: optionalText(source.author, 120) });
        return result;
      }, []);

    const usedIds = new Set();
    const bookmarks = (Array.isArray(input.bookmarks) ? input.bookmarks : base.bookmarks || [])
      .slice(0, MAX_BOOKMARKS)
      .reduce((result, bookmark, index) => {
        if (!isPlainObject(bookmark)) return result;
        const label = optionalText(bookmark.label, 80);
        const url = safeHttpUrl(bookmark.url);
        if (!label || !url) return result;
        let id = slug(bookmark.id || label, `bookmark-${index + 1}`);
        if (usedIds.has(id)) id = `${id}-${index + 1}`;
        usedIds.add(id);
        result.push({
          id,
          label,
          url,
          icon: safeIcon(bookmark.icon),
          newTab: bookmark.newTab === true
        });
        return result;
      }, []);

    const result = {
      version: 1,
      site: {
        title: textValue(input.site && input.site.title, baseSite.title || "My Homepage", 80),
        favicon: safeIcon(input.site && input.site.favicon) || safeIcon(baseSite.favicon)
      },
      sectionOrder: orderedIds(input.sectionOrder, SECTION_ITEMS, base.sectionOrder),
      dashboardWidgetOrder: orderedIds(input.dashboardWidgetOrder, WIDGET_ITEMS, base.dashboardWidgetOrder),
      features,
      timer: {
        start: textValue(input.timer && input.timer.start, baseTimer.start, 100),
        label: textValue(input.timer && input.timer.label, baseTimer.label, 100)
      },
      writing: {
        reminderInterval: Math.round(boundedNumber(
          input.writing && input.writing.reminderInterval,
          baseWriting.reminderInterval || 7,
          1,
          365
        ))
      },
      weather: {
        name: textValue(input.weather && input.weather.name, baseWeather.name || "Provo", 80),
        latitude: boundedNumber(input.weather && input.weather.latitude, baseWeather.latitude, -90, 90),
        longitude: boundedNumber(input.weather && input.weather.longitude, baseWeather.longitude, -180, 180),
        temperatureUnit: input.weather && input.weather.temperatureUnit === "celsius" ? "celsius" : "fahrenheit",
        windspeedUnit: input.weather && input.weather.windspeedUnit === "kmh" ? "kmh" : "mph",
        timezone: "auto"
      },
      quotes,
      bookmarks
    };

    while (jsonByteLength(result) > MAX_PREFERENCE_BYTES && result.bookmarks.length > 1) {
      result.bookmarks.pop();
    }
    while (jsonByteLength(result) > MAX_PREFERENCE_BYTES && result.quotes.length > 1) {
      result.quotes.pop();
    }
    return result;
  }

  const baseConfig = clone(window.APP_CONFIG || {});

  function readStoredCustomization() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return sanitizeCustomization(JSON.parse(raw), baseConfig);
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function sameValue(left, right) {
    return JSON.stringify(left || null) === JSON.stringify(right || null);
  }

  let activeCustomization = readStoredCustomization();
  if (activeCustomization) {
    window.APP_CONFIG = merge(baseConfig, activeCustomization);
  }

  let draft = sanitizeCustomization(window.APP_CONFIG || {}, baseConfig);
  let signedInDuringPageLoad = false;
  let reloadScheduled = false;

  function setMessage(message, tone) {
    const element = document.getElementById("customize-message");
    if (!element) return;
    element.textContent = message || "";
    element.className = `min-h-[1.25rem] text-sm ${tone === "error" ? "text-amber-600" : "text-gray-500"}`;
  }

  function scheduleReload() {
    if (reloadScheduled) return;
    reloadScheduled = true;
    window.setTimeout(() => window.location.reload(), 50);
  }

  function setInputValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value == null ? "" : String(value);
  }

  function createIconButton(label, symbol, disabled, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "customize-icon-button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = symbol;
    button.disabled = disabled;
    button.addEventListener("click", handler);
    return button;
  }

  function renderOrderList(containerId, items, order, featureKeys) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.replaceChildren();

    order.forEach((id, index) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) return;
      const row = document.createElement("div");
      row.className = "customize-order-row";

      const label = document.createElement("label");
      label.className = "flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-gray-700";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "h-4 w-4 rounded border-gray-300 text-blue-600";
      const featureKey = featureKeys[id];
      checkbox.checked = draft.features[featureKey] !== false;
      checkbox.addEventListener("change", () => {
        draft.features[featureKey] = checkbox.checked;
      });
      const labelText = document.createElement("span");
      labelText.textContent = item.label;
      label.append(checkbox, labelText);

      const controls = document.createElement("div");
      controls.className = "flex items-center gap-1";
      controls.append(
        createIconButton(`Move ${item.label} up`, "↑", index === 0, () => {
          [order[index - 1], order[index]] = [order[index], order[index - 1]];
          renderAllOrderLists();
        }),
        createIconButton(`Move ${item.label} down`, "↓", index === order.length - 1, () => {
          [order[index], order[index + 1]] = [order[index + 1], order[index]];
          renderAllOrderLists();
        })
      );
      row.append(label, controls);
      container.appendChild(row);
    });
  }

  function renderAllOrderLists() {
    renderOrderList(
      "customize-section-order",
      SECTION_ITEMS,
      draft.sectionOrder,
      { writing: "writing", bookmarks: "bookmarks", dashboard: "dashboard" }
    );
    renderOrderList(
      "customize-widget-order",
      WIDGET_ITEMS,
      draft.dashboardWidgetOrder,
      Object.fromEntries(WIDGET_ITEMS.map((item) => [item.id, item.feature]))
    );
  }

  function renderQuotes() {
    const container = document.getElementById("customize-quotes");
    if (!container) return;
    container.replaceChildren();

    draft.quotes.forEach((quote, index) => {
      const row = document.createElement("div");
      row.className = "customize-repeat-row";
      const text = document.createElement("textarea");
      text.rows = 2;
      text.maxLength = 500;
      text.required = true;
      text.placeholder = "Quote";
      text.className = "customize-field min-h-[4.5rem] flex-1 resize-y";
      text.value = quote.text;
      text.addEventListener("input", () => { quote.text = text.value; });
      const author = document.createElement("input");
      author.type = "text";
      author.maxLength = 120;
      author.placeholder = "Author (optional)";
      author.className = "customize-field sm:w-48";
      author.value = quote.author;
      author.addEventListener("input", () => { quote.author = author.value; });
      const remove = createIconButton("Remove quote", "×", false, () => {
        draft.quotes.splice(index, 1);
        renderQuotes();
      });
      row.append(text, author, remove);
      container.appendChild(row);
    });

    const add = document.getElementById("customize-add-quote");
    if (add) add.disabled = draft.quotes.length >= MAX_QUOTES;
  }

  function renderBookmarks() {
    const container = document.getElementById("customize-bookmarks");
    if (!container) return;
    container.replaceChildren();

    draft.bookmarks.forEach((bookmark, index) => {
      const card = document.createElement("fieldset");
      card.className = "customize-bookmark-card";
      const top = document.createElement("div");
      top.className = "flex items-center justify-between gap-3";
      const legend = document.createElement("legend");
      legend.className = "text-sm font-semibold text-gray-700";
      legend.textContent = bookmark.label || `Bookmark ${index + 1}`;
      const controls = document.createElement("div");
      controls.className = "flex items-center gap-1";
      controls.append(
        createIconButton("Move bookmark up", "↑", index === 0, () => {
          [draft.bookmarks[index - 1], draft.bookmarks[index]] = [draft.bookmarks[index], draft.bookmarks[index - 1]];
          renderBookmarks();
        }),
        createIconButton("Move bookmark down", "↓", index === draft.bookmarks.length - 1, () => {
          [draft.bookmarks[index], draft.bookmarks[index + 1]] = [draft.bookmarks[index + 1], draft.bookmarks[index]];
          renderBookmarks();
        }),
        createIconButton("Remove bookmark", "×", false, () => {
          draft.bookmarks.splice(index, 1);
          renderBookmarks();
        })
      );
      top.append(legend, controls);

      const fields = document.createElement("div");
      fields.className = "mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2";
      [
        { key: "label", placeholder: "Label", maxLength: 80 },
        { key: "url", placeholder: "https://example.com", maxLength: 1000 },
        { key: "icon", placeholder: "Icon URL (optional)", maxLength: 1000 },
        { key: "id", placeholder: "Stable ID", maxLength: 80 }
      ].forEach((definition) => {
        const input = document.createElement("input");
        input.type = definition.key === "url" ? "url" : "text";
        input.maxLength = definition.maxLength;
        input.placeholder = definition.placeholder;
        input.className = "customize-field";
        input.required = definition.key === "label" || definition.key === "url";
        input.value = bookmark[definition.key] || "";
        input.addEventListener("input", () => {
          bookmark[definition.key] = input.value;
          if (definition.key === "label") legend.textContent = input.value || `Bookmark ${index + 1}`;
        });
        fields.appendChild(input);
      });

      const newTabLabel = document.createElement("label");
      newTabLabel.className = "mt-3 flex items-center gap-2 text-xs text-gray-600";
      const newTab = document.createElement("input");
      newTab.type = "checkbox";
      newTab.checked = bookmark.newTab === true;
      newTab.addEventListener("change", () => { bookmark.newTab = newTab.checked; });
      newTabLabel.append(newTab, document.createTextNode("Open in a new tab"));
      card.append(top, fields, newTabLabel);
      container.appendChild(card);
    });

    const add = document.getElementById("customize-add-bookmark");
    if (add) add.disabled = draft.bookmarks.length >= MAX_BOOKMARKS;
  }

  function populateForm() {
    setInputValue("customize-title", draft.site.title);
    setInputValue("customize-favicon", draft.site.favicon);
    setInputValue("customize-timer-label", draft.timer.label);
    setInputValue("customize-timer-start", draft.timer.start);
    setInputValue("customize-reminder-interval", draft.writing.reminderInterval);
    setInputValue("customize-weather-name", draft.weather.name);
    setInputValue("customize-weather-latitude", draft.weather.latitude);
    setInputValue("customize-weather-longitude", draft.weather.longitude);
    setInputValue("customize-temperature-unit", draft.weather.temperatureUnit);
    setInputValue("customize-windspeed-unit", draft.weather.windspeedUnit);
    renderAllOrderLists();
    renderQuotes();
    renderBookmarks();
  }

  function collectForm() {
    const value = clone(draft);
    const get = (id) => {
      const element = document.getElementById(id);
      return element ? element.value : "";
    };
    value.site.title = get("customize-title");
    value.site.favicon = get("customize-favicon");
    value.timer.label = get("customize-timer-label");
    value.timer.start = get("customize-timer-start");
    value.writing.reminderInterval = get("customize-reminder-interval");
    value.weather.name = get("customize-weather-name");
    value.weather.latitude = get("customize-weather-latitude");
    value.weather.longitude = get("customize-weather-longitude");
    value.weather.temperatureUnit = get("customize-temperature-unit");
    value.weather.windspeedUnit = get("customize-windspeed-unit");
    return sanitizeCustomization(value, baseConfig);
  }

  function updateStorageCopy() {
    const element = document.getElementById("customize-storage-copy");
    if (!element) return;
    const state = window.HomepageState;
    element.textContent = state && state.isRemoteSyncActive()
      ? "Your settings are saved in this browser and synced to your signed-in account."
      : "Your settings are saved only in this browser. Sign in to include them in cloud sync.";
  }

  function openPanel() {
    const panel = document.getElementById("customize-modal");
    if (!panel) return;
    draft = sanitizeCustomization(window.APP_CONFIG || {}, baseConfig);
    populateForm();
    updateStorageCopy();
    setMessage("");
    panel.classList.remove("hidden");
    panel.classList.add("flex");
    document.body.classList.add("overflow-hidden");
    const firstInput = document.getElementById("customize-title");
    if (firstInput) firstInput.focus();
  }

  function closePanel() {
    const panel = document.getElementById("customize-modal");
    if (!panel) return;
    panel.classList.add("hidden");
    panel.classList.remove("flex");
    document.body.classList.remove("overflow-hidden");
  }

  async function savePreferences(customization) {
    const state = window.HomepageState;
    if (!state || typeof state.saveUserStatePatch !== "function") return true;
    const current = state.loadUserState();
    const preferences = isPlainObject(current.preferences) ? clone(current.preferences) : {};
    if (customization) preferences[PREFERENCE_KEY] = customization;
    else delete preferences[PREFERENCE_KEY];
    await state.saveUserStatePatch({ preferences });
    if (state.isRemoteSyncActive() && typeof state.syncNow === "function") {
      return state.syncNow();
    }
    return true;
  }

  async function handleSave(event) {
    event.preventDefault();
    const timerStart = document.getElementById("customize-timer-start");
    if (timerStart) {
      timerStart.setCustomValidity(Number.isNaN(new Date(timerStart.value).getTime())
        ? "Enter a valid date and time."
        : "");
      if (!timerStart.reportValidity()) return;
    }
    const submit = document.getElementById("customize-save");
    if (submit) submit.disabled = true;
    const customization = collectForm();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customization));
    setMessage("Saving settings...");
    const saved = await savePreferences(customization);
    if (!saved) {
      setMessage("Saved in this browser, but cloud sync failed. Check your connection and try again.", "error");
      if (submit) submit.disabled = false;
      return;
    }
    setMessage("Saved. Reloading the homepage...");
    scheduleReload();
  }

  async function handleReset() {
    if (!window.confirm("Reset browser customization and return to this site's defaults? Tracker history will not be deleted.")) return;
    const reset = document.getElementById("customize-reset");
    if (reset) reset.disabled = true;
    localStorage.removeItem(STORAGE_KEY);
    setMessage("Resetting settings...");
    const saved = await savePreferences(null);
    if (!saved) {
      setMessage("Reset in this browser, but cloud sync failed. Check your connection and try again.", "error");
      if (reset) reset.disabled = false;
      return;
    }
    scheduleReload();
  }

  function applyRemotePreferences(event) {
    if (!event || !event.detail || event.detail.source !== "remote-load") return;
    signedInDuringPageLoad = true;
    const preferences = event.detail.state && event.detail.state.preferences;
    const remoteValue = isPlainObject(preferences) && isPlainObject(preferences[PREFERENCE_KEY])
      ? sanitizeCustomization(preferences[PREFERENCE_KEY], baseConfig)
      : null;
    const localValue = readStoredCustomization();
    if (sameValue(remoteValue, localValue)) return;
    if (remoteValue) localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteValue));
    else localStorage.removeItem(STORAGE_KEY);
    scheduleReload();
  }

  function handleAuthChange(event) {
    const user = event && event.detail ? event.detail.user : null;
    if (user) {
      signedInDuringPageLoad = true;
      updateStorageCopy();
      return;
    }
    if (signedInDuringPageLoad) {
      localStorage.removeItem(STORAGE_KEY);
      scheduleReload();
    }
    updateStorageCopy();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const state = window.HomepageState;
    if (activeCustomization && state && typeof state.saveUserStatePatch === "function") {
      const current = state.loadUserState();
      const preferences = isPlainObject(current.preferences) ? clone(current.preferences) : {};
      if (!sameValue(preferences[PREFERENCE_KEY], activeCustomization)) {
        preferences[PREFERENCE_KEY] = activeCustomization;
        state.saveUserStatePatch({ preferences });
      }
    }

    const open = document.getElementById("customize-open");
    const close = document.getElementById("customize-close");
    const cancel = document.getElementById("customize-cancel");
    const reset = document.getElementById("customize-reset");
    const form = document.getElementById("customize-form");
    const backdrop = document.getElementById("customize-backdrop");
    const addQuote = document.getElementById("customize-add-quote");
    const addBookmark = document.getElementById("customize-add-bookmark");

    if (open) open.addEventListener("click", openPanel);
    if (close) close.addEventListener("click", closePanel);
    if (cancel) cancel.addEventListener("click", closePanel);
    if (reset) reset.addEventListener("click", handleReset);
    if (form) form.addEventListener("submit", handleSave);
    if (backdrop) backdrop.addEventListener("click", closePanel);
    if (addQuote) addQuote.addEventListener("click", () => {
      if (draft.quotes.length >= MAX_QUOTES) return;
      draft.quotes.push({ text: "", author: "" });
      renderQuotes();
    });
    if (addBookmark) addBookmark.addEventListener("click", () => {
      if (draft.bookmarks.length >= MAX_BOOKMARKS) return;
      const index = draft.bookmarks.length + 1;
      draft.bookmarks.push({ id: `bookmark-${index}`, label: "", url: "", icon: "", newTab: false });
      renderBookmarks();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePanel();
    });

    updateStorageCopy();
  });

  window.addEventListener("homepage-state-changed", applyRemotePreferences);
  window.addEventListener("homepage-auth-changed", handleAuthChange);

  window.HomepageCustomization = {
    baseConfig: clone(baseConfig),
    getActive: () => activeCustomization ? clone(activeCustomization) : null,
    sanitize: (value) => sanitizeCustomization(value, baseConfig),
    storageKey: STORAGE_KEY
  };
})();

/* ===========================
   GitHub Trending Repositories
   =========================== */

(function () {
  // Two different questions, two different sources.
  //
  // "New" views ask which brand-new repositories gathered the most stars, and
  // the GitHub search API answers that directly from the browser.
  //
  // "Trending" views ask which repositories — at any age — are gaining stars
  // fastest right now. No API reports that: the public events firehose is too
  // degraded to derive it, and github.com/trending sends no CORS header. So
  // the Pages workflow captures that page at deploy time into
  // data/github-trending.json and the browser reads it from our own origin.
  const SEARCH_URL = "https://api.github.com/search/repositories";
  const TRENDING_DATA_PATH = "data/github-trending.json";
  const DEFAULT_COUNT = 10;
  const MAX_COUNT = 25;
  const SEARCH_CACHE_KEY = "homepage.githubTrending.v2";
  const VIEW_KEY = "homepage.githubTrending.view";
  const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 10000;

  const VIEWS = [
    { id: "daily", source: "captured", period: "daily", label: "Today", caption: "Most stars gained today" },
    { id: "weekly", source: "captured", period: "weekly", label: "This week", caption: "Most stars gained this week" },
    { id: "monthly", source: "captured", period: "monthly", label: "This month", caption: "Most stars gained this month" },
    { id: "new-7", source: "search", days: 7, label: "New · 7d", caption: "New repositories from the last 7 days" },
    { id: "new-30", source: "search", days: 30, label: "New · 30d", caption: "New repositories from the last 30 days" }
  ];
  const DEFAULT_VIEW = "weekly";

  let initialized = false;
  let requestId = 0;
  let activeView = DEFAULT_VIEW;
  let capturedPromise = null;
  const els = {};
  const tabButtons = new Map();

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function findView(id) {
    return VIEWS.find((view) => view.id === id) || null;
  }

  function getSettings() {
    const config = isPlainObject(window.APP_CONFIG) ? window.APP_CONFIG : {};
    const github = isPlainObject(config.github) ? config.github : {};
    const count = Number(github.count);
    const language = typeof github.language === "string" ? github.language.trim() : "";
    return {
      count: Number.isFinite(count) && count >= 1 ? Math.min(Math.floor(count), MAX_COUNT) : DEFAULT_COUNT,
      // A stray query fragment here would change the search, not just filter it.
      language: /^[A-Za-z0-9+#. -]{1,40}$/.test(language) ? language : "",
      defaultView: findView(github.defaultView) ? github.defaultView : DEFAULT_VIEW
    };
  }

  function wholeCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  }

  function compactCount(value) {
    if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`.replace(".0M", "M");
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`.replace(".0k", "k");
    return String(value);
  }

  function timeAgo(value) {
    const parsed = typeof value === "number" ? value : Date.parse(value);
    if (!Number.isFinite(parsed)) return "";
    const seconds = Math.floor((Date.now() - parsed) / 1000);
    if (seconds < 0) return "";
    const steps = [
      { limit: 60, label: "second", size: 1 },
      { limit: 3600, label: "minute", size: 60 },
      { limit: 86400, label: "hour", size: 3600 },
      { limit: 2592000, label: "day", size: 86400 }
    ];
    const step = steps.find((candidate) => seconds < candidate.limit)
      || { label: "month", size: 2592000 };
    const amount = Math.max(1, Math.floor(seconds / step.size));
    return `${amount} ${step.label}${amount === 1 ? "" : "s"} ago`;
  }

  function repoUrl(fullName, candidate) {
    if (typeof candidate === "string" && candidate.trim()) {
      try {
        const parsed = new URL(candidate.trim());
        if (parsed.protocol === "https:" && parsed.hostname === "github.com") return parsed.href;
      } catch (error) {
        // Fall through to the name-derived URL below.
      }
    }
    return `https://github.com/${fullName.split("/").map(encodeURIComponent).join("/")}`;
  }

  function normalizeRepo(value) {
    if (!isPlainObject(value)) return null;
    const fullName = typeof value.full_name === "string"
      ? value.full_name.trim()
      : (typeof value.fullName === "string" ? value.fullName.trim() : "");
    if (!fullName || fullName.split("/").length !== 2) return null;
    return {
      fullName,
      url: repoUrl(fullName, value.html_url),
      description: typeof value.description === "string" ? value.description.trim().slice(0, 300) : "",
      stars: wholeCount(value.stargazers_count != null ? value.stargazers_count : value.stars),
      forks: wholeCount(value.forks_count != null ? value.forks_count : value.forks),
      language: typeof value.language === "string" ? value.language.trim().slice(0, 40) : "",
      pushedAt: typeof value.pushed_at === "string" ? value.pushed_at : "",
      delta: wholeCount(value.delta)
    };
  }

  /* --- captured trending data --- */

  function loadCapturedData(force) {
    if (capturedPromise && !force) return capturedPromise;
    const url = new URL(TRENDING_DATA_PATH, document.baseURI).href;
    capturedPromise = fetch(url, { cache: force ? "reload" : "no-cache" })
      .then((response) => {
        if (response.status === 404) throw new Error("NOT_CAPTURED");
        if (!response.ok) throw new Error(`The captured trending list failed to load (${response.status}).`);
        return response.json();
      })
      .then((payload) => {
        if (!isPlainObject(payload) || !isPlainObject(payload.periods)) {
          throw new Error("The captured trending list is not in the expected format.");
        }
        return payload;
      })
      .catch((error) => {
        // A failed load should not be cached as a permanent answer.
        capturedPromise = null;
        throw error;
      });
    return capturedPromise;
  }

  async function readCapturedView(view, settings, force) {
    const payload = await loadCapturedData(force);
    const rows = Array.isArray(payload.periods[view.period]) ? payload.periods[view.period] : [];
    let repos = rows.map(normalizeRepo).filter(Boolean);
    if (settings.language) {
      const wanted = settings.language.toLowerCase();
      repos = repos.filter((repo) => repo.language.toLowerCase() === wanted);
    }
    return {
      repos: repos.slice(0, settings.count),
      capturedAt: Date.parse(payload.generatedAt),
      empty: !rows.length
    };
  }

  /* --- live search data --- */

  function windowStart(days) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function buildSearchRequest(view, settings) {
    const terms = [`created:>${windowStart(view.days)}`, "stars:>1"];
    if (settings.language) terms.push(`language:"${settings.language}"`);
    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", terms.join(" "));
    url.searchParams.set("sort", "stars");
    url.searchParams.set("order", "desc");
    url.searchParams.set("per_page", String(settings.count));
    return { url: url.href, signature: `${terms.join(" ")}|${settings.count}` };
  }

  function readSearchCache(viewId, signature) {
    try {
      const raw = localStorage.getItem(SEARCH_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const entry = isPlainObject(parsed) ? parsed[viewId] : null;
      if (!isPlainObject(entry) || entry.signature !== signature) return null;
      const repos = (Array.isArray(entry.repos) ? entry.repos : []).map(normalizeRepo).filter(Boolean);
      const fetchedAt = Number(entry.fetchedAt);
      if (!repos.length || !Number.isFinite(fetchedAt)) return null;
      return { repos, fetchedAt };
    } catch (error) {
      return null;
    }
  }

  function writeSearchCache(viewId, signature, repos) {
    try {
      const raw = localStorage.getItem(SEARCH_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const store = isPlainObject(parsed) ? parsed : {};
      store[viewId] = { signature, fetchedAt: Date.now(), repos };
      localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(store));
    } catch (error) {
      // A full or unavailable localStorage should not break the section.
    }
  }

  async function fetchSearchView(request, count) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller
      ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      : null;
    try {
      const response = await fetch(request.url, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        signal: controller ? controller.signal : undefined
      });
      if (response.status === 403 || response.status === 429) {
        throw new Error("GitHub is rate limiting this browser. Try again in a minute.");
      }
      if (!response.ok) throw new Error(`GitHub request failed (${response.status})`);
      const payload = await response.json();
      if (!isPlainObject(payload) || !Array.isArray(payload.items)) {
        throw new Error("GitHub returned an unexpected response.");
      }
      return payload.items.map(normalizeRepo).filter(Boolean).slice(0, count);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* --- rendering --- */

  function setStatus(message, tone) {
    if (!els.status) return;
    els.status.textContent = message || "";
    els.status.className = `text-sm ${tone === "error" ? "text-amber-600" : "text-gray-500"}`;
  }

  function plainPart(value) {
    const span = document.createElement("span");
    span.textContent = value;
    return span;
  }

  function buildRepoItem(repo, rank, view) {
    const item = document.createElement("li");
    item.className = "flex gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3";

    const rankLabel = document.createElement("span");
    rankLabel.className = "w-6 shrink-0 text-sm font-semibold tabular-nums text-gray-400";
    rankLabel.textContent = String(rank);

    const content = document.createElement("div");
    content.className = "min-w-0 flex-1";

    const link = document.createElement("a");
    link.href = repo.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.className = "font-medium leading-snug text-gray-800 hover:text-blue-600 hover:underline";
    const [owner, name] = repo.fullName.split("/");
    const ownerLabel = document.createElement("span");
    ownerLabel.className = "text-gray-500";
    ownerLabel.textContent = `${owner}/`;
    link.append(ownerLabel, document.createTextNode(name));
    content.appendChild(link);

    if (repo.description) {
      const description = document.createElement("p");
      description.className = "mt-1 text-sm leading-snug text-gray-600";
      description.textContent = repo.description;
      content.appendChild(description);
    }

    const meta = document.createElement("div");
    meta.className = "mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500";
    const parts = [];

    if (view.source === "captured" && repo.delta) {
      const gained = document.createElement("span");
      gained.className = "font-semibold text-emerald-600";
      gained.textContent = `+${compactCount(repo.delta)} ${view.period === "daily" ? "today" : view.period === "weekly" ? "this week" : "this month"}`;
      parts.push(gained);
    }
    parts.push(plainPart(`${compactCount(repo.stars)} star${repo.stars === 1 ? "" : "s"}`));
    if (repo.forks) parts.push(plainPart(`${compactCount(repo.forks)} fork${repo.forks === 1 ? "" : "s"}`));
    if (repo.language) parts.push(plainPart(repo.language));
    const pushed = view.source === "search" ? timeAgo(repo.pushedAt) : "";
    if (pushed) parts.push(plainPart(`pushed ${pushed}`));

    // Each part is an element so the flex gap separates them; adjacent text
    // nodes would otherwise collapse into a single anonymous flex item.
    parts.forEach((part, index) => {
      if (index > 0) meta.appendChild(plainPart("·"));
      meta.appendChild(part);
    });
    content.appendChild(meta);

    item.append(rankLabel, content);
    return item;
  }

  function renderMessage(message) {
    if (!els.list) return;
    els.list.replaceChildren();
    const row = document.createElement("li");
    row.className = "py-6 text-center text-sm text-gray-500";
    row.textContent = message;
    els.list.appendChild(row);
  }

  function renderRepos(repos, view) {
    if (!els.list) return;
    els.list.replaceChildren();
    repos.forEach((repo, index) => {
      els.list.appendChild(buildRepoItem(repo, index + 1, view));
    });
    if (!repos.length) {
      const settings = getSettings();
      renderMessage(settings.language
        ? `No ${settings.language} repositories are in this list right now.`
        : "No repositories were returned.");
    }
  }

  function renderCaption(view) {
    if (!els.caption) return;
    const settings = getSettings();
    els.caption.textContent = settings.language
      ? `${view.caption} · ${settings.language}`
      : view.caption;
  }

  function renderTabs() {
    if (!els.tabs) return;
    els.tabs.replaceChildren();
    tabButtons.clear();

    VIEWS.forEach((view, index) => {
      const previous = VIEWS[index - 1];
      if (previous && previous.source !== view.source) {
        const divider = document.createElement("span");
        divider.className = "mx-1 h-4 w-px bg-gray-200";
        divider.setAttribute("aria-hidden", "true");
        els.tabs.appendChild(divider);
      }

      const tab = document.createElement("button");
      tab.type = "button";
      tab.id = `gh-tab-${view.id}`;
      tab.setAttribute("role", "tab");
      tab.dataset.viewId = view.id;
      tab.textContent = view.label;
      tab.addEventListener("click", () => selectView(view.id));
      tab.addEventListener("keydown", handleTabKeydown);
      els.tabs.appendChild(tab);
      tabButtons.set(view.id, tab);
    });
    paintTabs();
  }

  function paintTabs() {
    tabButtons.forEach((tab, viewId) => {
      const selected = viewId === activeView;
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.tabIndex = selected ? 0 : -1;
      tab.className = selected
        ? "rounded-full bg-gray-800 px-3 py-1.5 text-xs font-medium text-white"
        : "rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200";
    });
    if (els.list) els.list.setAttribute("aria-labelledby", `gh-tab-${activeView}`);
  }

  function handleTabKeydown(event) {
    const keys = { ArrowLeft: -1, ArrowRight: 1 };
    const index = VIEWS.findIndex((view) => view.id === activeView);
    let target = null;
    if (keys[event.key]) {
      target = VIEWS[(index + keys[event.key] + VIEWS.length) % VIEWS.length];
    } else if (event.key === "Home") {
      target = VIEWS[0];
    } else if (event.key === "End") {
      target = VIEWS[VIEWS.length - 1];
    }
    if (!target) return;
    event.preventDefault();
    selectView(target.id);
    const button = tabButtons.get(target.id);
    if (button) button.focus();
  }

  function rememberView(viewId) {
    try {
      localStorage.setItem(VIEW_KEY, viewId);
    } catch (error) {
      // Remembering the tab is a convenience, not a requirement.
    }
  }

  function recallView(fallback) {
    try {
      const stored = localStorage.getItem(VIEW_KEY);
      return findView(stored) ? stored : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function selectView(viewId) {
    if (!findView(viewId) || viewId === activeView) return;
    activeView = viewId;
    rememberView(viewId);
    paintTabs();
    loadView(false);
  }

  /* --- loading --- */

  async function loadView(force) {
    const view = findView(activeView);
    if (!view) return;
    const settings = getSettings();
    renderCaption(view);

    // Switching tabs supersedes whatever is in flight: a late response must
    // not paint over the tab the reader has since moved to.
    const token = ++requestId;
    const superseded = () => token !== requestId;
    const startLoad = () => {
      if (els.refresh) els.refresh.disabled = true;
    };
    const endLoad = () => {
      if (!superseded() && els.refresh) els.refresh.disabled = false;
    };

    if (view.source === "search") {
      const request = buildSearchRequest(view, settings);
      const cached = readSearchCache(view.id, request.signature);
      if (cached && !force && Date.now() - cached.fetchedAt < SEARCH_CACHE_TTL_MS) {
        renderRepos(cached.repos, view);
        setStatus(`Updated ${new Date(cached.fetchedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`);
        return;
      }
      if (cached) renderRepos(cached.repos, view);

      startLoad();
      setStatus(cached ? "Refreshing..." : "Loading repositories...");
      try {
        const repos = await fetchSearchView(request, settings.count);
        if (!repos.length) throw new Error("No repositories could be loaded.");
        writeSearchCache(view.id, request.signature, repos);
        if (superseded()) return;
        renderRepos(repos, view);
        setStatus(`Updated ${new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`);
      } catch (error) {
        if (superseded()) return;
        const message = error && error.name === "AbortError"
          ? "GitHub took too long to respond."
          : (error && error.message) || "GitHub could not be reached.";
        setStatus(cached ? `${message} Showing the last saved list.` : message, "error");
        if (!cached) renderMessage("Repositories are unavailable right now. Select Refresh to try again.");
      } finally {
        endLoad();
      }
      return;
    }

    startLoad();
    setStatus("Loading repositories...");
    try {
      const result = await readCapturedView(view, settings, force);
      if (superseded()) return;
      if (result.empty) {
        renderMessage("This trending list was not captured on the last deploy.");
        setStatus("Unavailable", "error");
        return;
      }
      renderRepos(result.repos, view);
      const captured = timeAgo(result.capturedAt);
      setStatus(captured ? `Captured ${captured}` : "");
    } catch (error) {
      if (superseded()) return;
      if (error && error.message === "NOT_CAPTURED") {
        renderMessage("Trending lists are captured when the site is deployed, so they are not available in this local copy. The New tabs work everywhere.");
        setStatus("Not captured here");
      } else {
        // A network-level failure surfaces as a bare TypeError ("Failed to
        // fetch"), which says nothing useful on screen.
        const offline = error instanceof TypeError;
        renderMessage("The captured trending list could not be loaded. Select Refresh to try again.");
        setStatus(offline ? "Could not be reached" : (error && error.message) || "Unavailable", "error");
      }
    } finally {
      endLoad();
    }
  }

  function initializeGithubTrending() {
    if (initialized) return;
    els.list = document.getElementById("gh-list");
    if (!els.list) return;
    initialized = true;
    els.status = document.getElementById("gh-status");
    els.refresh = document.getElementById("gh-refresh");
    els.caption = document.getElementById("gh-window");
    els.tabs = document.getElementById("gh-tabs");

    activeView = recallView(getSettings().defaultView);
    renderTabs();
    if (els.refresh) els.refresh.addEventListener("click", () => loadView(true));
    loadView(false);
  }

  window.initializeGithubTrending = initializeGithubTrending;
})();

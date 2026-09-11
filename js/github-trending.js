/* ===========================
   GitHub Trending Repositories
   =========================== */

(function () {
  // GitHub publishes no trending API, so the trending list is approximated
  // with the search API: repositories created inside the recent window,
  // ordered by stars.
  const SEARCH_URL = "https://api.github.com/search/repositories";
  const DEFAULT_COUNT = 10;
  const DEFAULT_DAYS = 7;
  const MAX_COUNT = 25;
  const CACHE_KEY = "homepage.githubTrending.v1";
  const CACHE_TTL_MS = 30 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 10000;

  let initialized = false;
  let loading = false;
  const els = {};

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function getSettings() {
    const config = isPlainObject(window.APP_CONFIG) ? window.APP_CONFIG : {};
    const github = isPlainObject(config.github) ? config.github : {};
    const count = Number(github.count);
    const days = Number(github.days);
    const language = typeof github.language === "string" ? github.language.trim() : "";
    return {
      count: Number.isFinite(count) && count >= 1 ? Math.min(Math.floor(count), MAX_COUNT) : DEFAULT_COUNT,
      days: Number.isFinite(days) && days >= 1 ? Math.min(Math.floor(days), 365) : DEFAULT_DAYS,
      // A stray query fragment here would change the search, not just filter it.
      language: /^[A-Za-z0-9+#. -]{1,40}$/.test(language) ? language : ""
    };
  }

  function windowStart(days) {
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return start.toISOString().slice(0, 10);
  }

  function buildRequest(settings) {
    const terms = [`created:>${windowStart(settings.days)}`, "stars:>1"];
    if (settings.language) terms.push(`language:"${settings.language}"`);
    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", terms.join(" "));
    url.searchParams.set("sort", "stars");
    url.searchParams.set("order", "desc");
    url.searchParams.set("per_page", String(settings.count));
    return { url: url.href, signature: `${terms.join(" ")}|${settings.count}` };
  }

  function safeRepoUrl(value, fullName) {
    if (typeof value === "string" && value.trim()) {
      try {
        const parsed = new URL(value.trim());
        if (parsed.protocol === "https:" && parsed.hostname === "github.com") return parsed.href;
      } catch (error) {
        // Fall through to the name-derived URL below.
      }
    }
    return `https://github.com/${fullName.split("/").map(encodeURIComponent).join("/")}`;
  }

  function compactCount(value) {
    if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`.replace(".0M", "M");
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`.replace(".0k", "k");
    return String(value);
  }

  function wholeCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  }

  function timeAgo(isoDate) {
    const parsed = Date.parse(isoDate);
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
    const value = Math.max(1, Math.floor(seconds / step.size));
    return `${value} ${step.label}${value === 1 ? "" : "s"} ago`;
  }

  function normalizeRepo(value) {
    if (!isPlainObject(value)) return null;
    const fullName = typeof value.full_name === "string" ? value.full_name.trim() : "";
    if (!fullName || !fullName.includes("/")) return null;
    return {
      fullName,
      url: safeRepoUrl(value.html_url, fullName),
      description: typeof value.description === "string" ? value.description.trim().slice(0, 300) : "",
      stars: wholeCount(value.stargazers_count),
      forks: wholeCount(value.forks_count),
      language: typeof value.language === "string" ? value.language.trim().slice(0, 40) : "",
      pushedAt: typeof value.pushed_at === "string" ? value.pushed_at : ""
    };
  }

  function readCache(signature) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed) || !Array.isArray(parsed.repos)) return null;
      if (parsed.signature !== signature) return null;
      const repos = parsed.repos.map(normalizeRepo).filter(Boolean);
      const fetchedAt = Number(parsed.fetchedAt);
      if (!repos.length || !Number.isFinite(fetchedAt)) return null;
      return { repos, fetchedAt };
    } catch (error) {
      return null;
    }
  }

  function writeCache(repos, signature) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), signature, repos }));
    } catch (error) {
      // A full or unavailable localStorage should not break the section.
    }
  }

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

  function buildRepoItem(repo, rank) {
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
    const parts = [plainPart(`${compactCount(repo.stars)} star${repo.stars === 1 ? "" : "s"}`)];
    if (repo.forks) parts.push(plainPart(`${compactCount(repo.forks)} fork${repo.forks === 1 ? "" : "s"}`));
    if (repo.language) parts.push(plainPart(repo.language));
    const pushed = timeAgo(repo.pushedAt);
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

  function renderRepos(repos, fetchedAt) {
    if (!els.list) return;
    els.list.replaceChildren();
    repos.forEach((repo, index) => {
      els.list.appendChild(buildRepoItem(repo, index + 1));
    });
    if (!repos.length) {
      const empty = document.createElement("li");
      empty.className = "py-6 text-center text-sm text-gray-500";
      empty.textContent = "No repositories were returned.";
      els.list.appendChild(empty);
    }
    const stamp = new Date(fetchedAt);
    setStatus(Number.isNaN(stamp.getTime())
      ? ""
      : `Updated ${stamp.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`);
  }

  async function fetchRepos(request, count) {
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

  async function loadRepos(force) {
    if (loading) return;

    const settings = getSettings();
    const request = buildRequest(settings);
    const cached = readCache(request.signature);
    if (cached && !force && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      renderRepos(cached.repos, cached.fetchedAt);
      return;
    }
    if (cached) renderRepos(cached.repos, cached.fetchedAt);

    loading = true;
    if (els.refresh) els.refresh.disabled = true;
    setStatus(cached ? "Refreshing..." : "Loading repositories...");

    try {
      const repos = await fetchRepos(request, settings.count);
      if (!repos.length) throw new Error("No repositories could be loaded.");
      const fetchedAt = Date.now();
      writeCache(repos, request.signature);
      renderRepos(repos, fetchedAt);
    } catch (error) {
      const message = error && error.name === "AbortError"
        ? "GitHub took too long to respond."
        : (error && error.message) || "GitHub could not be reached.";
      setStatus(cached ? `${message} Showing the last saved list.` : message, "error");
      if (!cached && els.list) {
        els.list.replaceChildren();
        const failed = document.createElement("li");
        failed.className = "py-6 text-center text-sm text-gray-500";
        failed.textContent = "Repositories are unavailable right now. Select Refresh to try again.";
        els.list.appendChild(failed);
      }
    } finally {
      loading = false;
      if (els.refresh) els.refresh.disabled = false;
    }
  }

  function initializeGithubTrending() {
    if (initialized) return;
    els.list = document.getElementById("gh-list");
    if (!els.list) return;
    initialized = true;
    els.status = document.getElementById("gh-status");
    els.refresh = document.getElementById("gh-refresh");
    els.window = document.getElementById("gh-window");
    if (els.window) {
      const settings = getSettings();
      const scope = settings.language ? `${settings.language} repositories` : "New repositories";
      els.window.textContent = settings.days === 1
        ? `${scope} from the last day`
        : `${scope} from the last ${settings.days} days`;
    }
    if (els.refresh) els.refresh.addEventListener("click", () => loadRepos(true));
    loadRepos(false);
  }

  window.initializeGithubTrending = initializeGithubTrending;
})();

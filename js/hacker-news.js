/* ===========================
   Hacker News Top Stories
   =========================== */

(function () {
  const API_BASE = "https://hacker-news.firebaseio.com/v0";
  const ITEM_BASE = "https://news.ycombinator.com/item?id=";
  const STORY_COUNT = 10;
  const CACHE_KEY = "homepage.hackerNews.v1";
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 10000;

  let initialized = false;
  let loading = false;
  const els = {};

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function safeHttpUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const parsed = new URL(value.trim());
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
    } catch (error) {
      return "";
    }
  }

  function hostLabel(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (error) {
      return "";
    }
  }

  function timeAgo(unixSeconds) {
    const seconds = Math.floor(Date.now() / 1000) - Number(unixSeconds);
    if (!Number.isFinite(seconds) || seconds < 0) return "";
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

  async function fetchJson(path) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller
      ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      : null;
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        headers: { Accept: "application/json" },
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) throw new Error(`Hacker News request failed (${response.status})`);
      return await response.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function normalizeStory(value) {
    if (!isPlainObject(value)) return null;
    const id = Number(value.id);
    const title = typeof value.title === "string" ? value.title.trim() : "";
    if (!Number.isFinite(id) || !title) return null;
    const url = safeHttpUrl(value.url);
    const score = Number(value.score);
    const comments = Number(value.descendants);
    return {
      id,
      title,
      url,
      by: typeof value.by === "string" ? value.by : "",
      score: Number.isFinite(score) && score >= 0 ? Math.floor(score) : 0,
      comments: Number.isFinite(comments) && comments >= 0 ? Math.floor(comments) : 0,
      time: Number(value.time) || 0
    };
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed) || !Array.isArray(parsed.stories)) return null;
      const stories = parsed.stories.map(normalizeStory).filter(Boolean);
      const fetchedAt = Number(parsed.fetchedAt);
      if (!stories.length || !Number.isFinite(fetchedAt)) return null;
      return { stories, fetchedAt };
    } catch (error) {
      return null;
    }
  }

  function writeCache(stories) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), stories }));
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

  function buildStoryItem(story, rank) {
    const item = document.createElement("li");
    item.className = "flex gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3";

    const rankLabel = document.createElement("span");
    rankLabel.className = "w-6 shrink-0 text-sm font-semibold tabular-nums text-gray-400";
    rankLabel.textContent = String(rank);

    const content = document.createElement("div");
    content.className = "min-w-0 flex-1";

    const discussionUrl = `${ITEM_BASE}${story.id}`;
    const link = document.createElement("a");
    link.href = story.url || discussionUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.className = "font-medium leading-snug text-gray-800 hover:text-blue-600 hover:underline";
    link.textContent = story.title;
    content.appendChild(link);

    const host = story.url ? hostLabel(story.url) : "";
    if (host) {
      const domain = document.createElement("span");
      domain.className = "ml-2 text-xs text-gray-400";
      domain.textContent = `(${host})`;
      content.appendChild(domain);
    }

    const meta = document.createElement("div");
    meta.className = "mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500";
    const parts = [];
    parts.push(plainPart(`${story.score} point${story.score === 1 ? "" : "s"}`));
    if (story.by) parts.push(plainPart(`by ${story.by}`));
    const posted = timeAgo(story.time);
    if (posted) parts.push(plainPart(posted));

    const comments = document.createElement("a");
    comments.href = discussionUrl;
    comments.target = "_blank";
    comments.rel = "noreferrer";
    comments.className = "text-gray-500 hover:text-blue-600 hover:underline";
    comments.textContent = `${story.comments} comment${story.comments === 1 ? "" : "s"}`;
    parts.push(comments);

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

  function renderStories(stories, fetchedAt) {
    if (!els.list) return;
    els.list.replaceChildren();
    stories.forEach((story, index) => {
      els.list.appendChild(buildStoryItem(story, index + 1));
    });
    if (!stories.length) {
      const empty = document.createElement("li");
      empty.className = "py-6 text-center text-sm text-gray-500";
      empty.textContent = "No stories were returned.";
      els.list.appendChild(empty);
    }
    const stamp = new Date(fetchedAt);
    setStatus(Number.isNaN(stamp.getTime())
      ? ""
      : `Updated ${stamp.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`);
  }

  async function loadStories(force) {
    if (loading) return;

    const cached = readCache();
    if (cached && !force && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      renderStories(cached.stories, cached.fetchedAt);
      return;
    }
    if (cached) renderStories(cached.stories, cached.fetchedAt);

    loading = true;
    if (els.refresh) els.refresh.disabled = true;
    setStatus(cached ? "Refreshing..." : "Loading stories...");

    try {
      const ids = await fetchJson("/topstories.json");
      if (!Array.isArray(ids)) throw new Error("Hacker News returned an unexpected response.");
      const topIds = ids
        .filter((id) => Number.isFinite(Number(id)))
        .slice(0, STORY_COUNT);
      const items = await Promise.all(
        topIds.map((id) => fetchJson(`/item/${encodeURIComponent(id)}.json`).catch(() => null))
      );
      const stories = items.map(normalizeStory).filter(Boolean);
      if (!stories.length) throw new Error("No stories could be loaded.");
      const fetchedAt = Date.now();
      writeCache(stories);
      renderStories(stories, fetchedAt);
    } catch (error) {
      const message = error && error.name === "AbortError"
        ? "Hacker News took too long to respond."
        : (error && error.message) || "Hacker News could not be reached.";
      setStatus(cached ? `${message} Showing the last saved list.` : message, "error");
      if (!cached && els.list) {
        els.list.replaceChildren();
        const failed = document.createElement("li");
        failed.className = "py-6 text-center text-sm text-gray-500";
        failed.textContent = "Stories are unavailable right now. Select Refresh to try again.";
        els.list.appendChild(failed);
      }
    } finally {
      loading = false;
      if (els.refresh) els.refresh.disabled = false;
    }
  }

  function initializeHackerNews() {
    if (initialized) return;
    els.list = document.getElementById("hn-list");
    if (!els.list) return;
    initialized = true;
    els.status = document.getElementById("hn-status");
    els.refresh = document.getElementById("hn-refresh");
    if (els.refresh) els.refresh.addEventListener("click", () => loadStories(true));
    loadStories(false);
  }

  window.initializeHackerNews = initializeHackerNews;
})();

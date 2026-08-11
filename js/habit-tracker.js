/* ===========================
   Habit Tracker (30-Day Focus)
   =========================== */

(function () {
  const STORAGE_KEY = "habitTracker.v1";
  const TOTAL_DAYS = 30;
  let initialized = false;
  let state = null;

  const els = {
    title: document.getElementById("habit-title"),
    reset: document.getElementById("habit-reset"),
    grid: document.getElementById("habit-grid"),
    ring: document.getElementById("habit-progress-ring"),
    percent: document.getElementById("habit-progress-percent"),
    dayLabel: document.getElementById("habit-day-label"),
    dateLabel: document.getElementById("habit-date-label"),
    streak: document.getElementById("habit-streak"),
    completed: document.getElementById("habit-completed"),
    remaining: document.getElementById("habit-remaining")
  };

  if (!els.grid) return;

  function todayISO() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function loadState() {
    const homepageState = window.HomepageState;

    if (homepageState && typeof homepageState.loadUserState === "function") {
      const remoteState = homepageState.loadUserState();
      const habitData = remoteState && remoteState.habit_data ? remoteState.habit_data : {};
      if (habitData && typeof habitData === "object") {
        const parsed = {
          title: typeof habitData.title === "string" ? habitData.title : "",
          startDate: habitData.startDate || todayISO(),
          checked: Array.isArray(habitData.checked) ? habitData.checked.slice(0, TOTAL_DAYS).map(Boolean) : []
        };
        while (parsed.checked.length < TOTAL_DAYS) parsed.checked.push(false);
        return parsed;
      }
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        title: "",
        startDate: todayISO(),
        checked: Array(TOTAL_DAYS).fill(false)
      };
    }

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.checked)) throw new Error("bad");
      parsed.checked = parsed.checked.slice(0, TOTAL_DAYS);
      while (parsed.checked.length < TOTAL_DAYS) parsed.checked.push(false);
      if (!parsed.startDate) parsed.startDate = todayISO();
      if (typeof parsed.title !== "string") parsed.title = "";
      return parsed;
    } catch (err) {
      return {
        title: "",
        startDate: todayISO(),
        checked: Array(TOTAL_DAYS).fill(false)
      };
    }
  }

  function saveState(state) {
    const homepageState = window.HomepageState;
    if (homepageState && typeof homepageState.saveUserStatePatch === "function") {
      homepageState.saveUserStatePatch({ habit_data: state });
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function renderGrid(state) {
    els.grid.innerHTML = "";
    for (let i = 0; i < TOTAL_DAYS; i += 1) {
      const isDone = !!state.checked[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = [
        "h-9",
        "rounded-lg",
        "border",
        "text-xs",
        "font-medium",
        "transition-colors",
        "focus:outline-none",
        "focus:ring-2",
        "focus:ring-gray-300",
        isDone
          ? "bg-gray-900 text-white border-gray-900"
          : "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700"
      ].join(" ");
      btn.textContent = String(i + 1).padStart(2, "0");
      btn.addEventListener("click", () => {
        state.checked[i] = !state.checked[i];
        saveState(state);
        updateUI(state);
      });
      els.grid.appendChild(btn);
    }
  }

  function computeStreak(state) {
    let lastChecked = -1;
    for (let i = state.checked.length - 1; i >= 0; i -= 1) {
      if (state.checked[i]) {
        lastChecked = i;
        break;
      }
    }
    if (lastChecked === -1) return 0;

    let streak = 0;
    for (let i = lastChecked; i >= 0; i -= 1) {
      if (!state.checked[i]) break;
      streak += 1;
    }
    return streak;
  }

  function updateProgressRing(percent) {
    const circumference = 2 * Math.PI * 48;
    const offset = circumference - (percent / 100) * circumference;
    els.ring.style.strokeDasharray = `${circumference.toFixed(1)}`;
    els.ring.style.strokeDashoffset = `${offset.toFixed(1)}`;
  }

  function updateUI(state) {
    const completed = state.checked.filter(Boolean).length;
    const percent = Math.round((completed / TOTAL_DAYS) * 100);
    const streak = computeStreak(state);

    if (els.title) els.title.value = state.title || "";
    if (els.percent) els.percent.textContent = `${percent}%`;
    if (els.completed) els.completed.textContent = `${completed}`;
    if (els.streak) els.streak.textContent = `${streak}`;
    if (els.dayLabel) els.dayLabel.textContent = `Day ${Math.min(completed + 1, TOTAL_DAYS)} of ${TOTAL_DAYS}`;
    if (els.remaining) els.remaining.textContent = `${TOTAL_DAYS - completed} days left`;
    if (els.dateLabel) els.dateLabel.textContent = `Start: ${state.startDate}`;

    updateProgressRing(percent);
    renderGrid(state);
  }

  function bindEvents() {
    if (els.title) {
      els.title.addEventListener("input", (e) => {
        state.title = e.target.value.slice(0, 40);
        saveState(state);
      });
    }
    if (els.reset) {
      els.reset.addEventListener("click", () => {
        const shouldReset = window.confirm("Start a new 30-day cycle? This clears the current grid.");
        if (!shouldReset) return;
        state.title = "";
        state.startDate = todayISO();
        state.checked = Array(TOTAL_DAYS).fill(false);
        saveState(state);
        updateUI(state);
      });
    }
  }

  function refreshFromSharedState() {
    if (!initialized) return;
    state = loadState();
    updateUI(state);
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    state = loadState();
    updateUI(state);
    bindEvents();

    const homepageState = window.HomepageState;
    if (homepageState && homepageState.events) {
      window.addEventListener(homepageState.events.stateChanged, refreshFromSharedState);
    }
  }

  window.initializeHabitTracker = initialize;
})();

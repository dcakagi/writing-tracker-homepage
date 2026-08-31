/* ===========================
   To-Do List Widget
   =========================== */

(function () {
  const STORAGE_KEY = "todoList.v1";
  const MAX_ITEMS = 100;
  const MAX_TITLE = 200;
  const MAX_NOTES = 2000;
  const SAVE_DEBOUNCE_MS = 400;

  const STATUS_IDS = ["not-started", "in-progress", "done"];
  const STATUS_LABELS = {
    "not-started": "Not started",
    "in-progress": "In progress",
    done: "Finished"
  };
  const STATUS_CLASSES = {
    "not-started": "border-gray-300 bg-gray-100 text-gray-700",
    "in-progress": "border-amber-300 bg-amber-100 text-amber-800",
    done: "border-green-300 bg-green-100 text-green-800"
  };

  const FILTERS = [
    { id: "all", label: "All" },
    { id: "not-started", label: "Not started" },
    { id: "in-progress", label: "In progress" },
    { id: "done", label: "Finished" }
  ];

  let initialized = false;
  let items = [];
  let activeFilter = "all";
  let saveTimer = null;
  const expandedIds = new Set();

  const els = {
    widget: document.getElementById("todo-widget"),
    addForm: document.getElementById("todo-add-form"),
    addInput: document.getElementById("todo-add-input"),
    filters: document.getElementById("todo-filters"),
    clearDone: document.getElementById("todo-clear-done"),
    list: document.getElementById("todo-list"),
    empty: document.getElementById("todo-empty"),
    progressBar: document.getElementById("todo-progress-bar"),
    progressLabel: document.getElementById("todo-progress-label"),
    message: document.getElementById("todo-msg")
  };

  if (!els.list) return;

  /* ---------- helpers ---------- */

  function todayISO() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function createId() {
    return `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function text(value, maxLength) {
    return typeof value === "string" ? value.slice(0, maxLength) : "";
  }

  function isoTimestamp(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }

  function dueDateValue(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
      ? value.trim()
      : "";
  }

  function formatDueDate(value) {
    const parts = value.split("-").map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function formatTimestamp(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function normalizeItems(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : [])
      .slice(0, MAX_ITEMS)
      .reduce((result, item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return result;
        const title = text(item.title, MAX_TITLE).trim();
        if (!title) return result;
        let id = typeof item.id === "string" ? item.id.trim().slice(0, 64) : "";
        if (!id || seen.has(id)) id = createId();
        seen.add(id);
        const status = STATUS_IDS.includes(item.status) ? item.status : "not-started";
        result.push({
          id,
          title,
          status,
          notes: text(item.notes, MAX_NOTES),
          completionNotes: text(item.completionNotes, MAX_NOTES),
          dueDate: dueDateValue(item.dueDate),
          createdAt: isoTimestamp(item.createdAt),
          updatedAt: isoTimestamp(item.updatedAt),
          completedAt: status === "done" ? isoTimestamp(item.completedAt) : ""
        });
        return result;
      }, []);
  }

  /* ---------- storage ---------- */

  function loadItems() {
    const homepageState = window.HomepageState;
    if (homepageState && typeof homepageState.loadUserState === "function") {
      const todoData = homepageState.loadUserState().todo_data;
      return normalizeItems(todoData && todoData.items);
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return normalizeItems(parsed && parsed.items);
    } catch (error) {
      return [];
    }
  }

  function persist() {
    const payload = { items };
    const homepageState = window.HomepageState;
    if (homepageState && typeof homepageState.saveUserStatePatch === "function") {
      homepageState.saveUserStatePatch({ todo_data: payload });
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function save() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    persist();
  }

  function saveSoon() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      persist();
    }, SAVE_DEBOUNCE_MS);
  }

  function touch(item) {
    item.updatedAt = new Date().toISOString();
  }

  let messageTimer = null;

  function setMessage(message) {
    if (!els.message) return;
    els.message.textContent = message || "";
    if (messageTimer) clearTimeout(messageTimer);
    if (!message) return;
    messageTimer = window.setTimeout(() => {
      messageTimer = null;
      els.message.textContent = "";
    }, 6000);
  }

  /* ---------- rendering ---------- */

  function countByStatus(statusId) {
    return items.filter((item) => item.status === statusId).length;
  }

  function visibleItems() {
    return activeFilter === "all"
      ? items
      : items.filter((item) => item.status === activeFilter);
  }

  function createIconButton(label, symbol, disabled, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "todo-icon-button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = symbol;
    button.disabled = disabled;
    button.addEventListener("click", handler);
    return button;
  }

  function createNotesField(labelText, helpText, value, onInput) {
    const wrapper = document.createElement("label");
    wrapper.className = "block";
    const label = document.createElement("span");
    label.className = "todo-field-label";
    label.textContent = labelText;
    const area = document.createElement("textarea");
    area.rows = 3;
    area.maxLength = MAX_NOTES;
    area.className = "todo-field min-h-[4.5rem] resize-y";
    area.placeholder = helpText;
    area.value = value || "";
    area.addEventListener("input", () => onInput(area.value));
    wrapper.append(label, area);
    return wrapper;
  }

  function buildMeta(item) {
    const meta = document.createElement("span");
    meta.className = "mt-0.5 block text-xs text-gray-500";

    const parts = [];
    if (item.dueDate) {
      const overdue = item.status !== "done" && item.dueDate < todayISO();
      const dueToday = item.status !== "done" && item.dueDate === todayISO();
      const due = document.createElement("span");
      due.className = overdue
        ? "font-medium text-red-600"
        : dueToday
        ? "font-medium text-amber-600"
        : "text-gray-500";
      due.textContent = overdue
        ? `Overdue ${formatDueDate(item.dueDate)}`
        : `Due ${formatDueDate(item.dueDate)}`;
      parts.push(due);
    }
    if (item.status === "done" && item.completedAt) {
      parts.push(document.createTextNode(`Finished ${formatTimestamp(item.completedAt)}`));
    } else if (item.createdAt) {
      parts.push(document.createTextNode(`Added ${formatTimestamp(item.createdAt)}`));
    }
    if (item.notes.trim() || item.completionNotes.trim()) {
      parts.push(document.createTextNode("Has notes"));
    }

    parts.forEach((part, index) => {
      if (index > 0) meta.appendChild(document.createTextNode(" · "));
      meta.appendChild(part);
    });
    if (!parts.length) meta.textContent = "No due date set";
    return meta;
  }

  function buildDetail(item) {
    const detail = document.createElement("div");
    detail.className = "mt-3 space-y-3 border-t border-gray-200 pt-3";
    detail.id = `todo-detail-${item.id}`;

    const topRow = document.createElement("div");
    topRow.className = "grid grid-cols-1 gap-3 sm:grid-cols-3";

    const titleWrapper = document.createElement("label");
    titleWrapper.className = "block sm:col-span-2";
    const titleLabel = document.createElement("span");
    titleLabel.className = "todo-field-label";
    titleLabel.textContent = "Item";
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.maxLength = MAX_TITLE;
    titleInput.className = "todo-field";
    titleInput.value = item.title;
    const previousTitle = item.title;
    titleInput.addEventListener("input", () => {
      item.title = titleInput.value.slice(0, MAX_TITLE);
      const heading = els.list.querySelector(`[data-todo-title="${item.id}"]`);
      if (heading) heading.textContent = item.title;
      if (!item.title.trim()) return;
      touch(item);
      saveSoon();
    });
    titleInput.addEventListener("blur", () => {
      if (item.title.trim()) return;
      item.title = previousTitle;
      touch(item);
      save();
      setMessage("An item needs a title, so the previous one was restored.");
      render();
    });
    titleWrapper.append(titleLabel, titleInput);

    const dueWrapper = document.createElement("label");
    dueWrapper.className = "block";
    const dueLabel = document.createElement("span");
    dueLabel.className = "todo-field-label";
    dueLabel.textContent = "Target date (optional)";
    const dueInput = document.createElement("input");
    dueInput.type = "date";
    dueInput.className = "todo-field";
    dueInput.value = item.dueDate;
    dueInput.addEventListener("change", () => {
      item.dueDate = dueDateValue(dueInput.value);
      touch(item);
      save();
      render();
    });
    dueWrapper.append(dueLabel, dueInput);

    topRow.append(titleWrapper, dueWrapper);

    const notesRow = document.createElement("div");
    notesRow.className = "grid grid-cols-1 gap-3 lg:grid-cols-2";
    notesRow.append(
      createNotesField(
        "Working notes",
        "Where this stands, blockers, next step...",
        item.notes,
        (value) => {
          item.notes = value.slice(0, MAX_NOTES);
          touch(item);
          saveSoon();
        }
      ),
      createNotesField(
        "Post-completion notes",
        item.status === "done"
          ? "What the outcome was, what you learned..."
          : "Saved for when this item is finished.",
        item.completionNotes,
        (value) => {
          item.completionNotes = value.slice(0, MAX_NOTES);
          touch(item);
          saveSoon();
        }
      )
    );

    detail.append(topRow, notesRow);
    return detail;
  }

  function buildItemCard(item, index) {
    const card = document.createElement("div");
    card.className = "rounded-xl border border-gray-200 bg-gray-50 p-3";
    card.dataset.todoId = item.id;

    const row = document.createElement("div");
    row.className = "flex items-start gap-2";

    const status = document.createElement("select");
    status.className = `todo-status ${STATUS_CLASSES[item.status]}`;
    status.setAttribute("aria-label", `Status for ${item.title}`);
    STATUS_IDS.forEach((statusId) => {
      const option = document.createElement("option");
      option.value = statusId;
      option.textContent = STATUS_LABELS[statusId];
      status.appendChild(option);
    });
    status.value = item.status;
    status.addEventListener("change", () => {
      const nextStatus = STATUS_IDS.includes(status.value) ? status.value : "not-started";
      if (nextStatus === item.status) return;
      item.status = nextStatus;
      item.completedAt = nextStatus === "done" ? new Date().toISOString() : "";
      if (nextStatus === "done") expandedIds.add(item.id);
      touch(item);
      save();
      render();
    });

    const isExpanded = expandedIds.has(item.id);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
    toggle.setAttribute("aria-expanded", String(isExpanded));
    toggle.setAttribute("aria-controls", `todo-detail-${item.id}`);
    const title = document.createElement("span");
    title.dataset.todoTitle = item.id;
    title.className = item.status === "done"
      ? "block truncate text-sm font-medium text-gray-500 line-through"
      : "block truncate text-sm font-medium text-gray-800";
    title.textContent = item.title;
    toggle.append(title, buildMeta(item));
    toggle.addEventListener("click", () => {
      if (expandedIds.has(item.id)) expandedIds.delete(item.id);
      else expandedIds.add(item.id);
      render();
    });

    const controls = document.createElement("div");
    controls.className = "flex items-center gap-1";
    controls.append(
      createIconButton(`Move ${item.title} up`, "↑", index === 0, () => {
        const position = items.indexOf(item);
        if (position <= 0) return;
        [items[position - 1], items[position]] = [items[position], items[position - 1]];
        save();
        render();
      }),
      createIconButton(`Move ${item.title} down`, "↓", index === items.length - 1, () => {
        const position = items.indexOf(item);
        if (position < 0 || position >= items.length - 1) return;
        [items[position], items[position + 1]] = [items[position + 1], items[position]];
        save();
        render();
      }),
      createIconButton(
        isExpanded ? `Hide notes for ${item.title}` : `Show notes for ${item.title}`,
        isExpanded ? "⌃" : "⌄",
        false,
        () => {
          if (expandedIds.has(item.id)) expandedIds.delete(item.id);
          else expandedIds.add(item.id);
          render();
        }
      ),
      createIconButton(`Remove ${item.title}`, "×", false, () => {
        const hasNotes = Boolean(item.notes.trim() || item.completionNotes.trim());
        const prompt = hasNotes
          ? `Remove "${item.title}"? Its notes are deleted too.`
          : `Remove "${item.title}"?`;
        if (!window.confirm(prompt)) return;
        const position = items.indexOf(item);
        if (position < 0) return;
        items.splice(position, 1);
        expandedIds.delete(item.id);
        save();
        render();
      })
    );

    row.append(status, toggle, controls);
    card.appendChild(row);
    if (isExpanded) card.appendChild(buildDetail(item));
    return card;
  }

  function renderFilters() {
    if (!els.filters) return;
    els.filters.replaceChildren();

    FILTERS.forEach((filter) => {
      const count = filter.id === "all" ? items.length : countByStatus(filter.id);
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.todoFilter = filter.id;
      button.className = `todo-filter ${activeFilter === filter.id ? "todo-filter-active" : ""}`.trim();
      button.setAttribute("aria-pressed", String(activeFilter === filter.id));
      button.textContent = `${filter.label} (${count})`;
      button.addEventListener("click", () => {
        activeFilter = filter.id;
        render();
      });
      els.filters.appendChild(button);
    });
  }

  function renderProgress() {
    const total = items.length;
    const done = countByStatus("done");
    const percent = total ? Math.round((done / total) * 100) : 0;

    if (els.progressBar) els.progressBar.style.width = `${percent}%`;
    if (els.progressLabel) {
      els.progressLabel.textContent = total
        ? `${done} of ${total} finished (${percent}%)`
        : "Nothing on the list yet";
    }
  }

  function render() {
    renderProgress();
    renderFilters();

    if (els.clearDone) els.clearDone.disabled = countByStatus("done") === 0;

    const shown = visibleItems();
    els.list.replaceChildren();
    shown.forEach((item) => {
      els.list.appendChild(buildItemCard(item, items.indexOf(item)));
    });

    if (els.empty) {
      els.empty.classList.toggle("hidden", shown.length > 0);
      els.empty.textContent = items.length
        ? `No items with the status "${STATUS_LABELS[activeFilter] || activeFilter}".`
        : "Add your first item above. Each one can hold working notes and post-completion notes.";
    }
  }

  /* ---------- events ---------- */

  function addItem(rawTitle) {
    const title = rawTitle.trim().slice(0, MAX_TITLE);
    if (!title) return;
    if (items.length >= MAX_ITEMS) {
      setMessage(`The list holds up to ${MAX_ITEMS} items. Remove or clear finished items to add more.`);
      return;
    }

    const now = new Date().toISOString();
    items.push({
      id: createId(),
      title,
      status: "not-started",
      notes: "",
      completionNotes: "",
      dueDate: "",
      createdAt: now,
      updatedAt: now,
      completedAt: ""
    });
    if (activeFilter !== "all" && activeFilter !== "not-started") activeFilter = "all";
    setMessage("");
    save();
    render();
  }

  function bindEvents() {
    if (els.addForm) {
      els.addForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!els.addInput) return;
        addItem(els.addInput.value);
        els.addInput.value = "";
        els.addInput.focus();
      });
    }

    if (els.clearDone) {
      els.clearDone.addEventListener("click", () => {
        const finished = countByStatus("done");
        if (!finished) return;
        const plural = finished === 1 ? "item" : "items";
        if (!window.confirm(`Remove ${finished} finished ${plural}? Their notes are deleted too.`)) return;
        items = items.filter((item) => {
          if (item.status !== "done") return true;
          expandedIds.delete(item.id);
          return false;
        });
        if (activeFilter === "done") activeFilter = "all";
        save();
        render();
      });
    }

    window.addEventListener("beforeunload", () => {
      if (saveTimer) save();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && saveTimer) save();
    });
  }

  function refreshFromSharedState(event) {
    if (!initialized) return;
    // Local saves come from this page, including this widget's own debounced
    // writes. Re-rendering on them would interrupt in-progress note editing.
    if (event && event.detail && event.detail.source === "local-save") return;
    items = loadItems();
    const availableIds = new Set(items.map((item) => item.id));
    Array.from(expandedIds).forEach((id) => {
      if (!availableIds.has(id)) expandedIds.delete(id);
    });
    render();
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    items = loadItems();
    render();
    bindEvents();

    const homepageState = window.HomepageState;
    if (homepageState && homepageState.events) {
      window.addEventListener(homepageState.events.stateChanged, refreshFromSharedState);
    }
  }

  window.initializeTodoList = initialize;
})();

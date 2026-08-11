(function () {
  const CACHE_KEY = "homepage.appState.v1";
  const MIGRATION_KEY_PREFIX = "homepage.supabaseMigration.v1:";
  const LEGACY_KEYS = {
    writing: "wt_data_2025",
    habit: "habitTracker.v1",
    export: "wt_last_export",
    activeTimer: "wtActiveTimer"
  };
  const STATE_EVENT = "homepage-state-changed";
  const AUTH_EVENT = "homepage-auth-changed";
  const SYNC_EVENT = "homepage-sync-changed";
  const SYNC_DEBOUNCE_MS = 800;

  const internal = {
    client: null,
    initialized: false,
    configured: false,
    currentUser: null,
    currentState: createDefaultState(),
    syncStatus: "local-only",
    syncMessage: "Local-only mode",
    syncTimer: null,
    isSendingLink: false,
    isVerifyingOtp: false,
    loadingUserId: null,
    pendingOtpEmail: "",
    ui: {}
  };

  function todayISO() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function createDefaultState() {
    return {
      writing_data: {},
      habit_data: {},
      bookmark_counts: {},
      preferences: {}
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getBookmarkKeys() {
    const bookmarks = window.APP_CONFIG && Array.isArray(window.APP_CONFIG.bookmarks)
      ? window.APP_CONFIG.bookmarks
      : [];
    const seen = new Set();

    return bookmarks.reduce((keys, bookmark, index) => {
      const fallbackId = `bookmark-${index + 1}`;
      let id = bookmark && typeof bookmark.id === "string"
        ? bookmark.id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
        : "";
      id = id || fallbackId;
      if (seen.has(id)) id = `${id}-${index + 1}`;
      seen.add(id);
      keys.push(id);
      return keys;
    }, []);
  }

  function parseStoredJson(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function sanitizeWritingData(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = {};
    Object.keys(value).forEach((dateKey) => {
      const entry = value[dateKey];
      if (!entry || typeof entry !== "object") return;
      const time = Number(entry.time);
      if (!Number.isFinite(time) || time < 0) return;
      result[dateKey] = { time: Math.round(time) };
    });
    return result;
  }

  function sanitizeHabitData(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = {};
    if (typeof value.title === "string" && value.title.trim()) {
      result.title = value.title.slice(0, 40);
    }
    if (typeof value.startDate === "string" && value.startDate.trim()) {
      result.startDate = value.startDate;
    }
    if (Array.isArray(value.checked)) {
      result.checked = value.checked.slice(0, 30).map(Boolean);
    }
    return result;
  }

  function sanitizeBookmarkCounts(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = {};

    getBookmarkKeys().forEach((key) => {
      const count = Number(value[key]);
      if (!Number.isFinite(count) || count < 0) return;
      result[key] = Math.floor(count);
    });
    return result;
  }

  function sanitizePreferences(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return clone(value);
  }

  function sanitizeState(value) {
    const next = createDefaultState();
    if (!value || typeof value !== "object") return next;
    next.writing_data = sanitizeWritingData(value.writing_data);
    next.habit_data = sanitizeHabitData(value.habit_data);
    next.bookmark_counts = sanitizeBookmarkCounts(value.bookmark_counts);
    next.preferences = sanitizePreferences(value.preferences);
    return next;
  }

  function hasWritingData(value) {
    return Object.keys(sanitizeWritingData(value)).length > 0;
  }

  function hasHabitData(value) {
    const habit = sanitizeHabitData(value);
    if (typeof habit.title === "string" && habit.title.trim()) return true;
    if (typeof habit.startDate === "string" && habit.startDate.trim()) return true;
    return Array.isArray(habit.checked) && habit.checked.some(Boolean);
  }

  function hasBookmarkData(value) {
    const bookmarks = sanitizeBookmarkCounts(value);
    return Object.values(bookmarks).some((count) => count > 0);
  }

  function hasMeaningfulState(value) {
    const state = sanitizeState(value);
    return (
      hasWritingData(state.writing_data) ||
      hasHabitData(state.habit_data) ||
      hasBookmarkData(state.bookmark_counts) ||
      Object.keys(state.preferences).length > 0
    );
  }

  function readLegacyState() {
    const writingData = sanitizeWritingData(parseStoredJson(LEGACY_KEYS.writing, {}));
    const habitData = sanitizeHabitData(parseStoredJson(LEGACY_KEYS.habit, {}));
    const bookmarkCounts = {};

    getBookmarkKeys().forEach((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const count = Number(raw);
      if (!Number.isFinite(count) || count < 0) return;
      bookmarkCounts[key] = Math.floor(count);
    });

    return sanitizeState({
      writing_data: writingData,
      habit_data: habitData,
      bookmark_counts: bookmarkCounts,
      preferences: {}
    });
  }

  function readCachedState() {
    return sanitizeState(parseStoredJson(CACHE_KEY, createDefaultState()));
  }

  function getInitialLocalState() {
    const cached = readCachedState();
    const legacy = readLegacyState();

    return sanitizeState({
      writing_data: hasWritingData(cached.writing_data) ? cached.writing_data : legacy.writing_data,
      habit_data: hasHabitData(cached.habit_data) ? cached.habit_data : legacy.habit_data,
      bookmark_counts: hasBookmarkData(cached.bookmark_counts) ? cached.bookmark_counts : legacy.bookmark_counts,
      preferences: cached.preferences
    });
  }

  function mirrorLegacyState(state) {
    localStorage.setItem(LEGACY_KEYS.writing, JSON.stringify(state.writing_data || {}));
    localStorage.setItem(LEGACY_KEYS.habit, JSON.stringify(state.habit_data || {}));

    getBookmarkKeys().forEach((key) => {
      localStorage.setItem(key, String((state.bookmark_counts && state.bookmark_counts[key]) || 0));
    });
  }

  function persistLocalState(state) {
    const sanitized = sanitizeState(state);
    localStorage.setItem(CACHE_KEY, JSON.stringify(sanitized));
    mirrorLegacyState(sanitized);
  }

  function clearLocalStateCache() {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(LEGACY_KEYS.writing);
    localStorage.removeItem(LEGACY_KEYS.habit);
    localStorage.removeItem(LEGACY_KEYS.activeTimer);
    getBookmarkKeys().forEach((key) => localStorage.removeItem(key));
  }

  function emitStateChange(source) {
    window.dispatchEvent(new CustomEvent(STATE_EVENT, {
      detail: {
        state: loadUserState(),
        source: source || "unknown"
      }
    }));
  }

  function emitAuthChange() {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, {
      detail: {
        user: getCurrentUser()
      }
    }));
  }

  function emitSyncChange() {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, {
      detail: {
        status: internal.syncStatus,
        message: internal.syncMessage
      }
    }));
  }

  function setSyncStatus(status, message) {
    internal.syncStatus = status;
    internal.syncMessage = message;
    renderAuthUi();
    emitSyncChange();
  }

  function getSupabaseConfig() {
    const config = window.APP_CONFIG && window.APP_CONFIG.supabase;
    return config && typeof config === "object" ? config : {};
  }

  function getAccessRequestConfig() {
    const config = window.APP_CONFIG && window.APP_CONFIG.accessRequest;
    return config && typeof config === "object" ? config : {};
  }

  function hasSupabaseConfig() {
    const config = getSupabaseConfig();
    return Boolean(
      config.enabled === true &&
      typeof config.url === "string" &&
      config.url.trim() &&
      typeof config.publishableKey === "string" &&
      config.publishableKey.trim()
    );
  }

  function ensureClient() {
    if (internal.client || !hasSupabaseConfig()) return internal.client;
    if (!window.supabase || typeof window.supabase.createClient !== "function") return null;

    const config = getSupabaseConfig();
    internal.client = window.supabase.createClient(config.url.trim(), config.publishableKey.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    return internal.client;
  }

  function bindUi() {
    internal.ui.root = document.getElementById("app-auth-card");
    internal.ui.shell = document.getElementById("app-auth-shell");
    internal.ui.trigger = document.getElementById("app-auth-trigger");
    internal.ui.toggle = document.getElementById("app-auth-toggle");
    internal.ui.triggerSummary = document.getElementById("app-auth-trigger-summary");
    internal.ui.triggerLabel = document.getElementById("app-auth-trigger-label");
    internal.ui.close = document.getElementById("app-auth-close");
    internal.ui.requestForm = document.getElementById("app-auth-request-form");
    internal.ui.verifyForm = document.getElementById("app-auth-verify-form");
    internal.ui.emailInput = document.getElementById("app-auth-email-input");
    internal.ui.submit = document.getElementById("app-auth-submit");
    internal.ui.signOut = document.getElementById("app-signout-btn");
    internal.ui.signedOut = document.getElementById("app-auth-signed-out");
    internal.ui.signedIn = document.getElementById("app-auth-signed-in");
    internal.ui.message = document.getElementById("app-auth-message");
    internal.ui.userEmail = document.getElementById("app-auth-user-email");
    internal.ui.mode = document.getElementById("app-auth-mode");
    internal.ui.statusPill = document.getElementById("app-auth-pill");
    internal.ui.copy = document.getElementById("app-auth-copy");
    internal.ui.sync = document.getElementById("app-sync-status");
    internal.ui.verifyPanel = document.getElementById("app-auth-verify");
    internal.ui.otpCopy = document.getElementById("app-auth-otp-copy");
    internal.ui.otpInput = document.getElementById("app-auth-otp-input");
    internal.ui.verifyButton = document.getElementById("app-auth-verify-btn");
    internal.ui.resendButton = document.getElementById("app-auth-resend-btn");
    internal.ui.changeEmailButton = document.getElementById("app-auth-change-email-btn");
    internal.ui.syncOptions = document.getElementById("app-sync-options");
    internal.ui.accessRequestGroup = document.getElementById("app-access-request-group");
    internal.ui.accessRequestLink = document.getElementById("app-access-request-link");
    internal.ui.accessRequestUnconfigured = document.getElementById("app-access-request-unconfigured");
    internal.ui.backupControls = document.getElementById("backup-controls");
    internal.ui.backupSlot = document.getElementById("app-backup-slot");

    if (internal.ui.toggle && !internal.ui.toggle.dataset.bound) {
      internal.ui.toggle.dataset.bound = "true";
      internal.ui.toggle.addEventListener("click", () => {
        if (!internal.ui.root) return;
        internal.ui.root.classList.toggle("hidden");
        internal.ui.toggle.setAttribute(
          "aria-expanded",
          String(!internal.ui.root.classList.contains("hidden"))
        );
      });
    }

    if (internal.ui.close && !internal.ui.close.dataset.bound) {
      internal.ui.close.dataset.bound = "true";
      internal.ui.close.addEventListener("click", () => {
        if (!internal.ui.root) return;
        internal.ui.root.classList.add("hidden");
        if (internal.ui.toggle) internal.ui.toggle.setAttribute("aria-expanded", "false");
      });
    }

    if (document.body && !document.body.dataset.appAuthDropdownBound) {
      document.body.dataset.appAuthDropdownBound = "true";
      document.addEventListener("click", (event) => {
        if (!internal.ui.root || !internal.ui.shell) return;
        if (internal.ui.root.classList.contains("hidden")) return;
        if (internal.ui.shell.contains(event.target)) return;
        internal.ui.root.classList.add("hidden");
        if (internal.ui.toggle) internal.ui.toggle.setAttribute("aria-expanded", "false");
      });
    }

    if (internal.ui.requestForm && !internal.ui.requestForm.dataset.bound) {
      internal.ui.requestForm.dataset.bound = "true";
      internal.ui.requestForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const email = internal.ui.emailInput ? internal.ui.emailInput.value.trim() : "";
        if (!email) {
          setInlineMessage("Enter your email to receive a one-time code.", "text-amber-600");
          return;
        }
        await sendEmailOtp(email);
      });
    }

    if (internal.ui.verifyForm && !internal.ui.verifyForm.dataset.bound) {
      internal.ui.verifyForm.dataset.bound = "true";
      internal.ui.verifyForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const token = internal.ui.otpInput ? internal.ui.otpInput.value.trim() : "";
        if (!token) {
          setInlineMessage("Enter the 6-digit code from your email.", "text-amber-600");
          return;
        }
        await verifyEmailOtp(token);
      });
    }

    if (internal.ui.signOut && !internal.ui.signOut.dataset.bound) {
      internal.ui.signOut.dataset.bound = "true";
      internal.ui.signOut.addEventListener("click", async () => {
        await signOut();
      });
    }

    if (internal.ui.resendButton && !internal.ui.resendButton.dataset.bound) {
      internal.ui.resendButton.dataset.bound = "true";
      internal.ui.resendButton.addEventListener("click", async () => {
        if (!internal.pendingOtpEmail) return;
        await sendEmailOtp(internal.pendingOtpEmail);
      });
    }

    if (internal.ui.changeEmailButton && !internal.ui.changeEmailButton.dataset.bound) {
      internal.ui.changeEmailButton.dataset.bound = "true";
      internal.ui.changeEmailButton.addEventListener("click", () => {
        internal.pendingOtpEmail = "";
        if (internal.ui.otpInput) internal.ui.otpInput.value = "";
        renderAuthUi();
        setInlineMessage("", "text-gray-500");
        if (internal.ui.emailInput) internal.ui.emailInput.focus();
      });
    }
  }

  function setInlineMessage(message, colorClass) {
    if (!internal.ui.message) return;
    internal.ui.message.textContent = message || "";
    internal.ui.message.className = `text-sm min-h-[1.25rem] ${colorClass || "text-gray-500"}`;
  }

  function renderAuthUi() {
    const isConfigured = internal.configured;
    if (internal.ui.shell) {
      internal.ui.shell.classList.remove("hidden");
    }
    if (!internal.ui.root) return;

    const isSignedIn = Boolean(internal.currentUser);
    const isAwaitingOtp = Boolean(internal.pendingOtpEmail) && !isSignedIn;
    const signedOutCopy = "Sign in with a one-time code to sync your data securely across browsers.";

    const backupDestination = isConfigured ? internal.ui.backupSlot : internal.ui.trigger;
    if (
      internal.ui.backupControls &&
      backupDestination &&
      internal.ui.backupControls.parentNode !== backupDestination
    ) {
      backupDestination.appendChild(internal.ui.backupControls);
    }
    if (internal.ui.triggerSummary) {
      internal.ui.triggerSummary.classList.toggle("hidden", !isConfigured);
    }

    if (internal.ui.mode) {
      internal.ui.mode.textContent = isConfigured ? "Secure Sync" : "Optional Sync";
    }

    if (internal.ui.triggerLabel) {
      internal.ui.triggerLabel.textContent = isSignedIn
        ? (internal.currentUser.email || "Signed in")
        : !isConfigured
        ? "Sync options"
        : isAwaitingOtp
        ? "Code sent"
        : "Sign in";
    }

    if (internal.ui.copy) {
      internal.ui.copy.textContent = isSignedIn
        ? "This browser stays signed in until you sign out or the session expires."
        : isConfigured
        ? signedOutCopy
        : "Keep using local storage, request access to shared sync, or connect a Supabase project you control.";
    }

    if (internal.ui.signedOut) {
      internal.ui.signedOut.classList.toggle("hidden", isSignedIn || !isConfigured);
    }

    if (internal.ui.signedIn) {
      internal.ui.signedIn.classList.toggle("hidden", !isSignedIn);
    }

    if (internal.ui.userEmail) {
      internal.ui.userEmail.textContent = isSignedIn ? (internal.currentUser.email || "Signed in") : "";
    }

    if (internal.ui.submit) {
      internal.ui.submit.disabled = internal.isSendingLink;
      internal.ui.submit.textContent = internal.isSendingLink ? "Sending..." : "Email code";
      internal.ui.submit.className = internal.ui.submit.disabled
        ? "rounded-lg bg-blue-300 px-4 py-2 text-sm font-medium text-white cursor-not-allowed"
        : "rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors";
    }

    if (internal.ui.verifyPanel) {
      internal.ui.verifyPanel.classList.toggle("hidden", !isAwaitingOtp);
    }

    if (internal.ui.otpCopy) {
      internal.ui.otpCopy.textContent = isAwaitingOtp
        ? `Enter the 6-digit code sent to ${internal.pendingOtpEmail}.`
        : "";
    }

    if (internal.ui.verifyButton) {
      internal.ui.verifyButton.disabled = internal.isVerifyingOtp;
      internal.ui.verifyButton.textContent = internal.isVerifyingOtp ? "Verifying..." : "Verify code";
      internal.ui.verifyButton.className = internal.ui.verifyButton.disabled
        ? "rounded-lg bg-gray-400 px-4 py-2 text-sm font-medium text-white cursor-not-allowed"
        : "rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 transition-colors";
    }

    if (internal.ui.resendButton) {
      internal.ui.resendButton.disabled = !isAwaitingOtp || internal.isSendingLink;
    }

    if (internal.ui.changeEmailButton) {
      internal.ui.changeEmailButton.disabled = !isAwaitingOtp || internal.isVerifyingOtp;
    }

    const accessRequest = getAccessRequestConfig();
    const showAvailableOptions = !isSignedIn;
    const showAccessRequest = showAvailableOptions && accessRequest.enabled === true;
    const ownerName = typeof accessRequest.ownerName === "string" ? accessRequest.ownerName.trim() : "";
    const requestEmail = typeof accessRequest.email === "string" ? accessRequest.email.trim() : "";
    const hasRequestEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestEmail);

    if (internal.ui.syncOptions) {
      internal.ui.syncOptions.classList.toggle("hidden", !showAvailableOptions);
    }
    if (internal.ui.accessRequestGroup) {
      internal.ui.accessRequestGroup.classList.toggle("hidden", !showAccessRequest);
    }
    if (internal.ui.accessRequestLink) {
      internal.ui.accessRequestLink.classList.toggle("hidden", !showAccessRequest || !hasRequestEmail);
      internal.ui.accessRequestLink.textContent = ownerName
        ? `Email ${ownerName} to request access`
        : "Request access by email";
      if (hasRequestEmail) {
        const subject = typeof accessRequest.subject === "string" && accessRequest.subject.trim()
          ? accessRequest.subject.trim()
          : "Homepage sync access request";
        const body = "Hello,\n\nI would like to request access to this homepage's shared sync project.\n\nMy email address is: ";
        internal.ui.accessRequestLink.href = `mailto:${requestEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      }
    }
    if (internal.ui.accessRequestUnconfigured) {
      internal.ui.accessRequestUnconfigured.classList.toggle("hidden", !showAccessRequest || hasRequestEmail);
      internal.ui.accessRequestUnconfigured.textContent = ownerName
        ? `Email ${ownerName} to request access.`
        : "Ask the person who shared this page to invite you.";
    }

    if (internal.ui.statusPill) {
      const statusLabel = {
        "local-only": "Optional",
        "signed-out": "Signed out",
        syncing: "Syncing",
        synced: "Synced",
        "not-synced": "Not synced"
      }[internal.syncStatus] || "Status";
      internal.ui.statusPill.textContent = statusLabel;
      internal.ui.statusPill.className = [
        "inline-flex rounded-full px-3 py-1 text-xs font-medium",
        internal.syncStatus === "synced"
          ? "bg-green-100 text-green-700"
          : internal.syncStatus === "syncing"
          ? "bg-blue-100 text-blue-700"
          : internal.syncStatus === "not-synced"
          ? "bg-amber-100 text-amber-700"
          : "bg-gray-100 text-gray-600"
      ].join(" ");
    }

    if (internal.ui.sync) {
      internal.ui.sync.textContent = internal.syncMessage;
      internal.ui.sync.className = internal.syncStatus === "not-synced"
        ? "text-sm text-amber-600"
        : "text-sm text-gray-500";
    }

    if (!isSignedIn && !internal.isSendingLink) {
      setInlineMessage("", "text-gray-500");
    }
  }

  function buildDbRecord(user, state) {
    const sanitized = sanitizeState(state);
    return {
      user_id: user.id,
      writing_data: sanitized.writing_data,
      habit_data: sanitized.habit_data,
      bookmark_counts: sanitized.bookmark_counts,
      preferences: sanitized.preferences
    };
  }

  async function ensureUserRow(user) {
    const client = ensureClient();
    if (!client) return null;

    const { error: upsertError } = await client
      .from("user_state")
      .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });

    if (upsertError) throw upsertError;

    const { data, error } = await client
      .from("user_state")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    if (data) return data;

    const blank = buildDbRecord(user, createDefaultState());
    const { error: createError } = await client
      .from("user_state")
      .upsert(blank, { onConflict: "user_id" });

    if (createError) throw createError;

    const { data: createdData, error: refetchError } = await client
      .from("user_state")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (refetchError) throw refetchError;
    return createdData;
  }

  async function writeRemoteState(user, nextState) {
    const client = ensureClient();
    if (!client || !user) return;
    const payload = buildDbRecord(user, nextState);
    const { error } = await client
      .from("user_state")
      .upsert(payload, { onConflict: "user_id" });

    if (error) throw error;
  }

  async function handleSignedInUser(user) {
    if (internal.loadingUserId === user.id) return;
    if (internal.currentUser && internal.currentUser.id === user.id && internal.syncStatus === "synced") return;

    internal.loadingUserId = user.id;
    internal.currentUser = { id: user.id, email: user.email || "" };
    emitAuthChange();
    setSyncStatus("syncing", "Loading your synced data...");
    try {
      internal.pendingOtpEmail = "";
      if (internal.ui.otpInput) internal.ui.otpInput.value = "";
      const remoteRow = await ensureUserRow(user);
      const remoteState = sanitizeState({
        writing_data: remoteRow.writing_data,
        habit_data: remoteRow.habit_data,
        bookmark_counts: remoteRow.bookmark_counts,
        preferences: remoteRow.preferences
      });
      const localState = getInitialLocalState();
      const migrationKey = `${MIGRATION_KEY_PREFIX}${user.id}`;
      const migrationComplete = localStorage.getItem(migrationKey) === "done";

      let chosenState = remoteState;
      const remoteHasData = hasMeaningfulState(remoteState);
      const localHasData = hasMeaningfulState(localState);

      if (!migrationComplete && !remoteHasData && localHasData) {
        const shouldImport = window.confirm(
          "Local tracker data was found in this browser.\n\nPress OK to import it into Supabase, or Cancel to start with an empty synced state."
        );
        if (shouldImport) {
          await writeRemoteState(user, localState);
          chosenState = localState;
        }
        localStorage.setItem(migrationKey, "done");
      } else if (!migrationComplete && remoteHasData && localHasData) {
        const keepRemote = window.confirm(
          "Supabase already has saved data for this account.\n\nPress OK to keep the Supabase copy.\nPress Cancel to replace it with the data stored in this browser."
        );
        if (!keepRemote) {
          await writeRemoteState(user, localState);
          chosenState = localState;
        }
        localStorage.setItem(migrationKey, "done");
      }

      internal.currentState = sanitizeState(chosenState);
      persistLocalState(internal.currentState);
      emitStateChange("remote-load");
      setSyncStatus("synced", "Signed in and synced.");
    } finally {
      internal.loadingUserId = null;
    }
  }

  async function syncNow() {
    if (internal.syncTimer) {
      clearTimeout(internal.syncTimer);
      internal.syncTimer = null;
    }
    if (!internal.currentUser || !internal.client) return;

    setSyncStatus("syncing", "Syncing changes...");

    try {
      await writeRemoteState(internal.currentUser, internal.currentState);
      setSyncStatus("synced", "All changes synced.");
    } catch (error) {
      setSyncStatus("not-synced", `Last sync failed: ${error.message || "Unknown error"}`);
    }
  }

  function scheduleSync() {
    if (!internal.currentUser || !internal.client) return;
    if (internal.syncTimer) clearTimeout(internal.syncTimer);
    internal.syncTimer = window.setTimeout(() => {
      syncNow();
    }, SYNC_DEBOUNCE_MS);
  }

  async function initializeAppAuth() {
    bindUi();
    internal.currentState = getInitialLocalState();
    persistLocalState(internal.currentState);
    emitStateChange("initial-local");

    internal.configured = hasSupabaseConfig();
    renderAuthUi();

    if (!internal.configured) {
      internal.initialized = true;
      setSyncStatus("local-only", "Saved in this browser.");
      emitAuthChange();
      return;
    }

    const client = ensureClient();
    if (!client) {
      internal.initialized = true;
      setSyncStatus("not-synced", "Supabase client failed to load. Refresh after the CDN script is available.");
      emitAuthChange();
      return;
    }

    client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearLocalStateCache();
        internal.currentState = createDefaultState();
        emitStateChange("sign-out");
        internal.pendingOtpEmail = "";
        if (internal.ui.otpInput) internal.ui.otpInput.value = "";
        internal.currentUser = null;
        emitAuthChange();
        setSyncStatus("signed-out", "Signed out.");
        renderAuthUi();
        return;
      }

      if (session && session.user) {
        Promise.resolve()
          .then(() => handleSignedInUser(session.user))
          .catch((error) => {
            setSyncStatus("not-synced", `Unable to load synced data: ${error.message || "Unknown error"}`);
          });
      }
    });

    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;

      if (data.session && data.session.user) {
        await handleSignedInUser(data.session.user);
      } else {
        setSyncStatus("signed-out", "Sign in to sync this homepage across devices.");
        emitAuthChange();
      }
    } catch (error) {
      setSyncStatus("not-synced", `Auth setup failed: ${error.message || "Unknown error"}`);
      emitAuthChange();
    }

    internal.initialized = true;
    renderAuthUi();
  }

  function getCurrentUser() {
    return internal.currentUser ? clone(internal.currentUser) : null;
  }

  function loadUserState() {
    return sanitizeState(clone(internal.currentState));
  }

  async function saveUserStatePatch(patch) {
    const nextState = sanitizeState({
      writing_data: Object.prototype.hasOwnProperty.call(patch || {}, "writing_data")
        ? patch.writing_data
        : internal.currentState.writing_data,
      habit_data: Object.prototype.hasOwnProperty.call(patch || {}, "habit_data")
        ? patch.habit_data
        : internal.currentState.habit_data,
      bookmark_counts: Object.prototype.hasOwnProperty.call(patch || {}, "bookmark_counts")
        ? patch.bookmark_counts
        : internal.currentState.bookmark_counts,
      preferences: Object.prototype.hasOwnProperty.call(patch || {}, "preferences")
        ? patch.preferences
        : internal.currentState.preferences
    });

    internal.currentState = nextState;
    persistLocalState(nextState);
    emitStateChange("local-save");

    if (internal.currentUser && internal.client) {
      scheduleSync();
    }
  }

  async function sendMagicLink(email) {
    return sendEmailOtp(email);
  }

  async function sendEmailOtp(email) {
    const client = ensureClient();
    if (!client) {
      setInlineMessage("Supabase is not configured yet.", "text-amber-600");
      return;
    }

    internal.isSendingLink = true;
    renderAuthUi();
    setInlineMessage("Sending your one-time code...", "text-blue-600");

    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false
      }
    });

    internal.isSendingLink = false;

    if (error) {
      renderAuthUi();
      setInlineMessage(error.message || "Could not send the one-time code.", "text-amber-600");
      return;
    }

    internal.pendingOtpEmail = email;
    if (internal.ui.emailInput) {
      internal.ui.emailInput.value = email;
    }
    renderAuthUi();
    if (internal.ui.otpInput) internal.ui.otpInput.focus();
    setInlineMessage("Check your email for the 6-digit code.", "text-green-600");
  }

  async function verifyEmailOtp(token) {
    const client = ensureClient();
    if (!client) {
      setInlineMessage("Supabase is not configured yet.", "text-amber-600");
      return;
    }
    if (!internal.pendingOtpEmail) {
      setInlineMessage("Enter your email first, then request a code.", "text-amber-600");
      return;
    }

    internal.isVerifyingOtp = true;
    renderAuthUi();
    setInlineMessage("Verifying code...", "text-blue-600");

    const { error } = await client.auth.verifyOtp({
      email: internal.pendingOtpEmail,
      token,
      type: "email"
    });

    internal.isVerifyingOtp = false;
    renderAuthUi();

    if (error) {
      setInlineMessage(error.message || "Could not verify the code.", "text-amber-600");
      return;
    }

    setInlineMessage("Code accepted. Loading your synced data...", "text-green-600");
  }

  async function signOut() {
    const client = ensureClient();
    clearLocalStateCache();
    internal.currentState = createDefaultState();
    emitStateChange("sign-out");
    internal.pendingOtpEmail = "";
    if (internal.ui.otpInput) internal.ui.otpInput.value = "";

    if (!client) {
      internal.currentUser = null;
      emitAuthChange();
      setSyncStatus("signed-out", "Signed out.");
      return;
    }

    const { error } = await client.auth.signOut();
    if (error) {
      setSyncStatus("not-synced", `Sign out failed: ${error.message || "Unknown error"}`);
      return;
    }

    internal.currentUser = null;
    emitAuthChange();
    setSyncStatus("signed-out", "Signed out.");
  }

  function isRemoteSyncActive() {
    return Boolean(internal.currentUser && internal.client);
  }

  function getSyncStatus() {
    return {
      status: internal.syncStatus,
      message: internal.syncMessage
    };
  }

  window.HomepageState = {
    initializeAppAuth,
    getCurrentUser,
    loadUserState,
    saveUserStatePatch,
    sendEmailOtp,
    verifyEmailOtp,
    sendMagicLink,
    signOut,
    isRemoteSyncActive,
    getSyncStatus,
    events: {
      stateChanged: STATE_EVENT,
      authChanged: AUTH_EVENT,
      syncChanged: SYNC_EVENT
    }
  };
})();

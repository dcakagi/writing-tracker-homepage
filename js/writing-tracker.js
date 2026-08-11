/* ===========================
   Writing Tracker Module
   =========================== */

function wtGetReminderIntervalMs() {
  const configuredDays = Number(
    window.APP_CONFIG &&
    window.APP_CONFIG.writing &&
    window.APP_CONFIG.writing.reminderInterval
  );
  const days = Number.isFinite(configuredDays) && configuredDays > 0
    ? configuredDays
    : 7;
  return days * 24 * 60 * 60 * 1000;
}

// Storage Configuration
const WT_CONFIG = {
  storageKey: 'wt_data_2025',
  exportKey: 'wt_last_export',
  activeTimerKey: 'wtActiveTimer',
  reminderInterval: wtGetReminderIntervalMs()
};

// State Variables
let wtData = {};
let wtCalYear = (new Date()).getFullYear();
let wtCalMonth = (new Date()).getMonth();
let wtStartTime = null;
let wtAccumulatedTime = 0;
let wtTimerInterval = null;
let wtChartRange = '12M';
let wtInitialized = false;

const WT_CHART_RANGE_MONTHS = {
  '6M': 6,
  '12M': 12,
  '24M': 24,
  'ALL': null
};

// Cache for computed statistics
let wtStatsCache = {
  monthlyTotals: null,
  mostProductiveWeekday: null,
  isDirty: true
};

// DOM Elements
let wtTimerDisplay, wtStartBtn, wtStopBtn, wtSessionMsg;
let wtManualMinutes, wtAddMinutesBtn;
let wtExportBtn, wtImportInput, wtImportMsg;
let wtEditModal, wtEditForm, wtEditDateLabel, wtEditCurrentValue, wtEditHours, wtEditMinutes, wtEditMsg;
let wtEditCloseBtn, wtEditCancelBtn, wtEditDeleteBtn;
let wtEditingDate = null;

const wtCumulativeHoverGuidePlugin = {
  id: 'wtCumulativeHoverGuide',
  afterDatasetsDraw(chart, _args, pluginOptions) {
    if (pluginOptions?.enabled === false) return;
    const activeElements = chart.tooltip?.getActiveElements?.() || [];
    if (!activeElements.length) return;

    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    const x = activeElements[0].element?.x;
    if (typeof x !== 'number') return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.lineWidth = pluginOptions?.lineWidth || 1;
    ctx.strokeStyle = pluginOptions?.color || 'rgba(59,130,246,0.28)';
    ctx.setLineDash(pluginOptions?.dash || [4, 4]);
    ctx.stroke();
    ctx.restore();
  }
};

if (window.Chart && !window.__wtCumulativeHoverGuideRegistered) {
  Chart.register(wtCumulativeHoverGuidePlugin);
  window.__wtCumulativeHoverGuideRegistered = true;
}

/* ===========================
   Data Management
   =========================== */
function wtLoadData() {
  const homepageState = window.HomepageState;
  if (homepageState && typeof homepageState.loadUserState === 'function') {
    const userState = homepageState.loadUserState();
    return userState && userState.writing_data ? userState.writing_data : {};
  }

  try {
    const rawData = localStorage.getItem(WT_CONFIG.storageKey);
    return rawData ? JSON.parse(rawData) : {};
  } catch (error) {
    console.error('Error loading writing data:', error);
    return {};
  }
}

function wtSaveData(data) {
  const homepageState = window.HomepageState;
  try {
    if (homepageState && typeof homepageState.saveUserStatePatch === 'function') {
      homepageState.saveUserStatePatch({ writing_data: data });
    } else {
      localStorage.setItem(WT_CONFIG.storageKey, JSON.stringify(data));
    }
    wtStatsCache.isDirty = true; // Invalidate cache when data changes
  } catch (error) {
    console.error('Error saving writing data:', error);
  }
}

function wtInvalidateCache() {
  wtStatsCache.isDirty = true;
}

function wtComputeAllStats() {
  if (!wtStatsCache.isDirty) return; // Use cached values if still valid

  // Compute monthly totals (used by multiple functions)
  wtStatsCache.monthlyTotals = wtGetMonthlyTotals();

  // Compute most productive weekday (used by render function)
  wtStatsCache.mostProductiveWeekday = wtCalculateMostProductiveWeekday();

  wtStatsCache.isDirty = false;
}

function wtGetTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${('0' + (now.getMonth() + 1)).slice(-2)}-${('0' + now.getDate()).slice(-2)}`;
}

function wtFormatDuration(totalSeconds) {
  const totalMinutes = Math.round((totalSeconds || 0) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function wtFormatDateLabel(dateStr) {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return dateStr;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [year, month, day] = parts;
  return `${monthNames[month - 1]} ${day}, ${year}`;
}

function wtRenderAll() {
  wtRenderCalendar();
  wtRenderMonthlyTotals();
  wtRenderCumulativeOverlay();
  wtRenderProportion();
  wtRenderMostProductiveWeekday();
}

function wtSetDayTime(dateStr, totalSeconds) {
  const nextSeconds = Math.max(0, Math.round(totalSeconds || 0));

  if (nextSeconds > 0) {
    wtData[dateStr] = {
      ...(wtData[dateStr] || {}),
      time: nextSeconds
    };
  } else {
    delete wtData[dateStr];
  }

  wtSaveData(wtData);
}

function wtShowSessionMessage(message, tone = 'info') {
  if (!wtSessionMsg) return;

  wtSessionMsg.textContent = message;
  wtSessionMsg.className = tone === 'error'
    ? 'text-sm text-red-600 mb-4 min-h-[1.25rem]'
    : 'text-sm text-blue-600 mb-4 min-h-[1.25rem]';
}

/* ===========================
   Export Reminder System
   =========================== */
function wtCheckExportReminder() {
  const homepageState = window.HomepageState;
  if (homepageState && typeof homepageState.isRemoteSyncActive === 'function' && homepageState.isRemoteSyncActive()) {
    wtExportBtn.className = "bg-gray-500 text-white px-3 py-1 rounded-full text-xs font-medium hover:bg-gray-600 transition-colors";
    wtExportBtn.textContent = "Export";
    wtImportMsg.textContent = "Auto-sync is on.";
    wtImportMsg.className = "text-green-600 text-xs ml-2";
    return;
  }

  const lastExport = localStorage.getItem(WT_CONFIG.exportKey);
  const now = new Date();
  const reminderThreshold = new Date(now.getTime() - WT_CONFIG.reminderInterval);

  if (!lastExport || new Date(lastExport) < reminderThreshold) {
    wtShowExportReminder(lastExport, now);
  }
}

function wtShowExportReminder(lastExport, now) {
  wtExportBtn.className = "bg-orange-500 text-white px-3 py-1 rounded-full text-xs font-medium hover:bg-orange-600 transition-colors animate-pulse";
  wtExportBtn.textContent = "Export (backup!)";

  if (!lastExport) {
    wtImportMsg.textContent = "💾 Backup your data!";
  } else {
    const daysSince = Math.floor((now - new Date(lastExport)) / (24 * 60 * 60 * 1000));
    wtImportMsg.textContent = `💾 Last backup: ${daysSince} days ago`;
  }
  wtImportMsg.className = "text-orange-600 text-xs ml-2 font-medium";
}

function wtResetExportReminder() {
  localStorage.setItem(WT_CONFIG.exportKey, new Date().toISOString());
  wtExportBtn.className = "bg-gray-500 text-white px-3 py-1 rounded-full text-xs font-medium hover:bg-gray-600 transition-colors";
  wtExportBtn.textContent = "Export";

  wtImportMsg.textContent = "✅ Data backed up!";
  wtImportMsg.className = "text-green-600 text-xs ml-2";
  setTimeout(() => {
    if (wtImportMsg.textContent === "✅ Data backed up!") {
      wtImportMsg.textContent = "";
    }
  }, 3000);
}

/* ===========================
   Timer Management
   =========================== */
function wtLoadActiveTimer() {
  const activeTimer = localStorage.getItem(WT_CONFIG.activeTimerKey);
  if (activeTimer) {
    const timerData = JSON.parse(activeTimer);
    wtStartTime = new Date(timerData.startTime);
    wtAccumulatedTime = timerData.accumulated || 0;

  wtTimerInterval = setInterval(wtUpdateTimerDisplay, 1000);
    wtSetTimerRunningState();
  }
}

function wtSaveActiveTimer() {
  if (wtStartTime) {
    localStorage.setItem(WT_CONFIG.activeTimerKey, JSON.stringify({
      startTime: wtStartTime.toISOString(),
      accumulated: wtAccumulatedTime
    }));
  } else {
    localStorage.removeItem(WT_CONFIG.activeTimerKey);
  }
}

function wtGetCurrentTime() {
  if (!wtStartTime) return wtAccumulatedTime;
  const now = new Date();
  const elapsedMs = now.getTime() - wtStartTime.getTime();
  return Math.floor(elapsedMs / 1000) + wtAccumulatedTime;
}

function wtUpdateTimerDisplay() {
  const totalSeconds = wtGetCurrentTime();
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  wtTimerDisplay.textContent = `${minutes}:${('0'+seconds).slice(-2)}`;
}

function wtSetTimerRunningState() {
  wtStartBtn.disabled = true;
  wtStartBtn.className = "bg-blue-300 text-white px-6 py-2 rounded-lg font-medium cursor-not-allowed";
  wtStopBtn.disabled = false;
  wtStopBtn.className = "bg-blue-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-600 transition-colors";
}

function wtSetTimerStoppedState() {
  wtStartBtn.disabled = false;
  wtStartBtn.className = "bg-blue-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-600 transition-colors";
  wtStopBtn.disabled = true;
  wtStopBtn.className = "bg-blue-300 text-white px-6 py-2 rounded-lg font-medium cursor-not-allowed";
}

/* ===========================
   Session Management
   =========================== */
function wtSaveSession() {
  if (wtAccumulatedTime > 0) {
    const today = wtGetTodayKey();
    const updatedTime = (wtData[today]?.time || 0) + wtAccumulatedTime;
    wtSetDayTime(today, updatedTime);
    wtRenderAll();

    const minutes = Math.floor(wtAccumulatedTime / 60);
    const seconds = wtAccumulatedTime % 60;
    wtShowSessionMessage(`Session saved! (+${minutes}:${('0'+seconds).slice(-2)})`);
    setTimeout(() => {
      if (wtSessionMsg.textContent.startsWith('Session saved!')) {
        wtSessionMsg.textContent = '';
      }
    }, 3000);

    wtAccumulatedTime = 0;
    wtUpdateTimerDisplay();
  }
}

/* ===========================
   Editing
   =========================== */
function wtOpenEditModal(dateStr) {
  if (!wtEditModal) return;

  const currentSeconds = wtData[dateStr]?.time || 0;
  const totalMinutes = Math.round(currentSeconds / 60);
  wtEditingDate = dateStr;
  wtEditDateLabel.textContent = wtFormatDateLabel(dateStr);
  wtEditCurrentValue.textContent = currentSeconds > 0
    ? `Currently saved: ${wtFormatDuration(currentSeconds)}`
    : 'No writing time saved for this day yet.';
  wtEditHours.value = String(Math.floor(totalMinutes / 60));
  wtEditMinutes.value = String(totalMinutes % 60);
  wtEditMsg.textContent = '';
  wtEditModal.classList.remove('hidden');
  wtEditModal.classList.add('flex');

  requestAnimationFrame(() => {
    wtEditHours.focus();
    wtEditHours.select();
  });
}

function wtCloseEditModal() {
  if (!wtEditModal) return;

  wtEditingDate = null;
  wtEditMsg.textContent = '';
  wtEditForm.reset();
  wtEditModal.classList.add('hidden');
  wtEditModal.classList.remove('flex');
}

function wtSaveEditedDay(event) {
  event.preventDefault();
  if (!wtEditingDate) return;

  const hours = wtEditHours.value.trim() === '' ? 0 : Number(wtEditHours.value);
  const minutes = wtEditMinutes.value.trim() === '' ? 0 : Number(wtEditMinutes.value);

  if (!Number.isInteger(hours) || hours < 0) {
    wtEditMsg.textContent = 'Hours must be a whole number 0 or greater.';
    return;
  }

  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    wtEditMsg.textContent = 'Minutes must be a whole number between 0 and 59.';
    return;
  }

  const totalSeconds = ((hours * 60) + minutes) * 60;
  const editedDate = wtEditingDate;

  wtSetDayTime(editedDate, totalSeconds);
  wtRenderAll();
  wtCloseEditModal();

  wtShowSessionMessage(
    totalSeconds > 0
      ? `Updated ${wtFormatDateLabel(editedDate)} to ${wtFormatDuration(totalSeconds)}.`
      : `Cleared writing time for ${wtFormatDateLabel(editedDate)}.`
  );
}

function wtClearEditedDay() {
  if (!wtEditingDate) return;

  const editedDate = wtEditingDate;
  wtSetDayTime(editedDate, 0);
  wtRenderAll();
  wtCloseEditModal();
  wtShowSessionMessage(`Cleared writing time for ${wtFormatDateLabel(editedDate)}.`);
}

/* ===========================
   Calendar Rendering
   =========================== */
function wtRenderCalendar() {
  const calendar = document.getElementById('wt-calendar');
  calendar.innerHTML = '';

  const year = wtCalYear;
  const month = wtCalMonth;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Update month label
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  document.getElementById('wt-monthLabel').textContent = `${monthNames[month]} ${year}`;

  // Calculate streaks (across all data)
  const currentStreak = wtCalculateCurrentStreakGlobal();
  const maxStreak = wtCalculateMaxStreakGlobal();
  document.getElementById('wt-streak').textContent = `Current streak: ${currentStreak} day${currentStreak === 1 ? '' : 's'} | Max streak: ${maxStreak} day${maxStreak === 1 ? '' : 's'}`;
  // render streak widgets (only current and max)
  wtRenderCurrentStreakWidget(currentStreak, maxStreak);
  wtRenderMaxStreakWidget(maxStreak);

  // Find max time for color scaling
  const maxTime = wtGetMaxTimeForMonth(year, month, daysInMonth);

  // Render calendar days
  wtRenderCalendarDays(calendar, year, month, firstDay, daysInMonth, maxTime);
}

// Returns the current streak ending today (skipping weekends)
// Returns the current streak ending today, across all months (skipping weekends)
function wtCalculateCurrentStreakGlobal() {
  // Find the earliest and latest date in wtData
  const allDays = Object.keys(wtData).sort();
  if (allDays.length === 0) return 0;
  let streak = 0;
  // Start from today, but if today is unwritten, start from yesterday, etc.
  let d = new Date();
  let foundFirstWritten = false;
  while (!foundFirstWritten) {
    const dateStr = `${d.getFullYear()}-${('0'+(d.getMonth()+1)).slice(-2)}-${('0'+d.getDate()).slice(-2)}`;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    if (!isWeekend) {
      if (wtData[dateStr] && wtData[dateStr].time > 0) {
        foundFirstWritten = true;
        break;
      }
    }
    // If we've reached the earliest day, stop
    if (dateStr <= allDays[0]) return 0;
    d.setDate(d.getDate() - 1);
  }
  // Now count streak backward from first written day
  for (; ;) {
    const dateStr = `${d.getFullYear()}-${('0'+(d.getMonth()+1)).slice(-2)}-${('0'+d.getDate()).slice(-2)}`;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    if (!isWeekend) {
      if (wtData[dateStr] && wtData[dateStr].time > 0) {
        streak++;
      } else {
        break;
      }
    }
    if (dateStr <= allDays[0]) break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// Returns the max streak across all months (skipping weekends)
function wtCalculateMaxStreakGlobal() {
  const allDays = Object.keys(wtData).sort();
  if (allDays.length === 0) return 0;
  // Iterate day-by-day using local date construction to avoid timezone/daylight issues.
  const startParts = allDays[0].split('-').map(Number);
  const endParts = allDays[allDays.length - 1].split('-').map(Number);
  let y = startParts[0], m = startParts[1] - 1, day = startParts[2];
  const endY = endParts[0], endM = endParts[1] - 1, endDay = endParts[2];

  let maxStreak = 0;
  let currentStreak = 0;

  // Helper to compare local dates
  function isBeforeOrEqual(aY, aM, aD, bY, bM, bD) {
    if (aY !== bY) return aY < bY;
    if (aM !== bM) return aM < bM;
    return aD <= bD;
  }

  while (isBeforeOrEqual(y, m, day, endY, endM, endDay)) {
    const dateStr = `${y}-${('0'+(m+1)).slice(-2)}-${('0'+day).slice(-2)}`;
    const dt = new Date(y, m, day);
    const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
    if (!isWeekend) {
      if (wtData[dateStr] && wtData[dateStr].time > 0) {
        currentStreak++;
      } else {
        if (currentStreak > maxStreak) maxStreak = currentStreak;
        currentStreak = 0;
      }
    }

    // increment local date
    const next = new Date(y, m, day + 1);
    y = next.getFullYear();
    m = next.getMonth();
    day = next.getDate();
  }

  if (currentStreak > maxStreak) maxStreak = currentStreak;
  return maxStreak;
}

function wtGetMaxTimeForMonth(year, month, daysInMonth) {
  let maxTime = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${('0'+(month+1)).slice(-2)}-${('0'+d).slice(-2)}`;
    if (wtData[dateStr] && wtData[dateStr].time > maxTime) {
      maxTime = wtData[dateStr].time;
    }
  }
  return maxTime;
}

function wtRenderCalendarDays(calendar, year, month, firstDay, daysInMonth, maxTime) {
  const today = wtGetTodayKey();

  // Add empty cells for days before the first day of the month
  for (let i = 0; i < firstDay; i++) {
    calendar.appendChild(document.createElement('div'));
  }

  // Add days of the month
  for (let d = 1; d <= daysInMonth; d++) {
    const day = document.createElement('button');
    day.type = 'button';
    day.className = 'flex items-center justify-center w-8 h-8 rounded text-gray-700 text-sm cursor-pointer wt-calendar-day';

    const dateStr = `${year}-${('0'+(month+1)).slice(-2)}-${('0'+d).slice(-2)}`;
    day.textContent = d;

    const time = wtData[dateStr]?.time || 0;
    if (time > 0) {
      const ratio = maxTime ? time / maxTime : 0;
      const r = Math.round(207 + (37-207)*ratio);
      const g = Math.round(226 + (99-226)*ratio);
      const b = Math.round(255 + (235-255)*ratio);
      day.style.backgroundColor = `rgb(${r},${g},${b})`;
      day.classList.add('font-bold','text-blue-800');
    } else {
      day.style.backgroundColor = '#f1f5f9';
    }

    if (dateStr === today) {
      day.classList.add('ring-2', 'ring-blue-300', 'ring-offset-1');
    }

    day.title = `${dateStr}\nTime: ${wtFormatDuration(time)}`;
    day.setAttribute('aria-label', `Edit writing time for ${wtFormatDateLabel(dateStr)}. Current total ${wtFormatDuration(time)}.`);
    day.addEventListener('click', () => wtOpenEditModal(dateStr));
    calendar.appendChild(day);
  }
}

/* ===========================
   Graph Rendering
   =========================== */
/* (removed) The old per-day wt-graph chart was removed in favor of the new charts:
   - #wt-monthly (monthly totals)
   - #wt-cumulative (this vs last month cumulative)
   - #wt-proportion (weekday activity proportion over months)
*/

/* ===========================
       Monthly Totals & Cumulative Charts
       =========================== */

    function wtFormatMonthLabel(monthKey) {
      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const [yStr, mStr] = monthKey.split('-');
      const y = Number(yStr);
      const m = Number(mStr) - 1;
      if (Number.isNaN(y) || Number.isNaN(m) || m < 0 || m > 11) return monthKey;
      return `${monthNames[m]}`;
    }

    function wtGetMonthlySeriesForRange() {
      wtComputeAllStats(); // Ensure cache is populated
      const monthly = wtGetMonthlyTotals();
      const rangeMonths = WT_CHART_RANGE_MONTHS[wtChartRange];
      if (!rangeMonths) return { labels: monthly.labels.slice(), data: monthly.data.slice() };
      const startIdx = Math.max(monthly.labels.length - rangeMonths, 0);
      return {
        labels: monthly.labels.slice(startIdx),
        data: monthly.data.slice(startIdx)
      };
    }

    function wtApplyChartWidth(canvasEl, scrollContainerId, pointCount) {
      if (!canvasEl) return;
      const scrollEl = document.getElementById(scrollContainerId);
      const baseWidth = 300;
      const allWidth = Math.max(baseWidth, pointCount * 44);
      const targetWidth = wtChartRange === 'ALL' ? allWidth : baseWidth;
      canvasEl.width = targetWidth;
      canvasEl.style.width = `${targetWidth}px`;
      if (scrollEl && wtChartRange !== 'ALL') scrollEl.scrollLeft = 0;
    }

    function wtGetMonthlyTotals() {
      // Return cached value if available and valid
      if (wtStatsCache.monthlyTotals && !wtStatsCache.isDirty) {
        return wtStatsCache.monthlyTotals;
      }

      const totals = {};
      Object.keys(wtData).forEach(key => {
        const parts = key.split('-'); // YYYY-MM-DD
        if (parts.length !== 3) return;
        const monthKey = `${parts[0]}-${parts[1]}`;
      // convert seconds -> hours (one decimal)
      totals[monthKey] = (totals[monthKey] || 0) + parseFloat(((wtData[key].time || 0) / 3600).toFixed(1));
      });
      const labels = Object.keys(totals).sort();
      const data = labels.map(l => totals[l]);
      return { labels, data };
    }

    function wtRenderMonthlyTotals() {
      const el = document.getElementById('wt-monthly');
      if (!el) return;
      const { labels, data } = wtGetMonthlySeriesForRange();
      wtApplyChartWidth(el, 'wt-monthly-scroll', labels.length);

      if (window.wtMonthlyChart) window.wtMonthlyChart.destroy();

      const ctx = el.getContext('2d');
      window.wtMonthlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels.map(wtFormatMonthLabel),
          datasets: [{
            label: 'Hours',
            data: data,
            backgroundColor: 'rgba(59,130,246,0.6)',
            borderColor: 'rgba(59,130,246,1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#6b7280', font: { size: 12 } }, grid: { display: false } },
            y: {
              ticks: { color: '#6b7280', font: { size: 11 } },
              beginAtZero: true,
              title: { display: true, text: 'Hours', color: '#6b7280' },
              afterFit: (scale) => { scale.width = 48; }
            }
          }
        }
      });
    }

    function wtRenderCumulativeOverlay() {
      const el = document.getElementById('wt-cumulative');
      if (!el) return;

      const today = new Date();
      const currYear = today.getFullYear();
      const currMonth = today.getMonth(); // 0-indexed

      function daysInMonth(y, m) { return new Date(y, m+1, 0).getDate(); }

      const prevDate = new Date(currYear, currMonth - 1, 1);
      const prevYear = prevDate.getFullYear();
      const prevMonth = prevDate.getMonth();

      const daysCurr = daysInMonth(currYear, currMonth);
      const daysPrev = daysInMonth(prevYear, prevMonth);
      const maxDays = Math.max(daysCurr, daysPrev);

      const cumCurr = new Array(maxDays).fill(0);
      const cumPrev = new Array(maxDays).fill(0);

      let running = 0;
      for (let d = 1; d <= maxDays; d++) {
        if (d <= daysCurr) {
          const dateStr = `${currYear}-${('0'+(currMonth+1)).slice(-2)}-${('0'+d).slice(-2)}`;
      running += parseFloat(((wtData[dateStr]?.time || 0) / 3600).toFixed(1));
          cumCurr[d-1] = running;
        } else {
          cumCurr[d-1] = running;
        }
      }

      running = 0;
      for (let d = 1; d <= maxDays; d++) {
        if (d <= daysPrev) {
          const dateStr = `${prevYear}-${('0'+(prevMonth+1)).slice(-2)}-${('0'+d).slice(-2)}`;
      running += parseFloat(((wtData[dateStr]?.time || 0) / 3600).toFixed(1));
          cumPrev[d-1] = running;
        } else {
          cumPrev[d-1] = running;
        }
      }

      const labels = Array.from({length: maxDays}, (_,i) => `${i+1}`);

      // Historical average cumulative trajectory (exclude current month),
      // plus a light +/-1 std-dev band to show typical variation.
      const currentMonthKey = `${currYear}-${('0'+(currMonth+1)).slice(-2)}`;
      const monthDailyHours = {};
      Object.keys(wtData).forEach((dateStr) => {
        const parts = dateStr.split('-').map(Number);
        if (parts.length !== 3) return;
        const [y, m, d] = parts;
        if (!y || !m || !d) return;
        if (m < 1 || m > 12) return;
        const monthKey = `${y}-${('0'+m).slice(-2)}`;
        if (monthKey === currentMonthKey) return;
        const monthDays = new Date(y, m, 0).getDate();
        if (!monthDailyHours[monthKey]) monthDailyHours[monthKey] = new Array(monthDays).fill(0);
        if (d < 1 || d > monthDays) return;
        monthDailyHours[monthKey][d - 1] += (wtData[dateStr]?.time || 0) / 3600;
      });

      const historicalMonths = Object.values(monthDailyHours).filter(arr => Array.isArray(arr) && arr.length > 0);
      const avgCum = new Array(maxDays).fill(null);
      const avgCumLower = new Array(maxDays).fill(null);
      const avgCumUpper = new Array(maxDays).fill(null);
      if (historicalMonths.length > 0) {
        const historicalCum = historicalMonths.map((daily) => {
          const cum = new Array(maxDays).fill(0);
          let r = 0;
          for (let d = 1; d <= maxDays; d++) {
            if (d <= daily.length) r += daily[d - 1];
            cum[d - 1] = r;
          }
          return cum;
        });

        for (let i = 0; i < maxDays; i++) {
          const vals = historicalCum.map(v => v[i]);
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          const variance = vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / vals.length;
          const stdDev = Math.sqrt(variance);
          avgCum[i] = parseFloat(mean.toFixed(1));
          avgCumLower[i] = parseFloat(Math.max(0, mean - stdDev).toFixed(1));
          avgCumUpper[i] = parseFloat((mean + stdDev).toFixed(1));
        }
      }

      const showAverageOverlay = historicalMonths.length > 0;
      const cumulativeDatasets = [];
      if (showAverageOverlay) {
        cumulativeDatasets.push(
          {
            label: 'Average band',
            data: avgCumLower,
            borderColor: 'rgba(148,163,184,0)',
            backgroundColor: 'rgba(148,163,184,0)',
            borderWidth: 0,
            pointRadius: 0,
            order: 0,
            _legend: false,
            _tooltip: false
          },
          {
            label: 'Average band',
            data: avgCumUpper,
            borderColor: 'rgba(148,163,184,0)',
            backgroundColor: 'rgba(148,163,184,0.14)',
            borderWidth: 0,
            pointRadius: 0,
            fill: '-1',
            order: 0,
            _legend: false,
            _tooltip: false
          },
          {
            label: 'Average',
            data: avgCum,
            borderColor: 'rgba(117, 177, 200, 0.75)',
            backgroundColor: 'rgba(107, 142, 190, 0.1)',
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHitRadius: 10,
            borderDash: [2, 2],
            order: 1
          }
        );
      }
      cumulativeDatasets.push(
        {
          label: 'Last month',
          data: cumPrev,
          borderColor: 'rgba(107,114,128,0.7)',
          backgroundColor: 'rgba(107,114,128,0.08)',
          borderWidth: 1,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHitRadius: 10,
          borderDash: [4,4],
          order: 2
        },
        {
          label: 'This month',
          data: cumCurr,
          borderColor: 'rgba(59,130,246,1)',
          backgroundColor: 'rgba(59,130,246,0.12)',
          borderWidth: 2,
          pointRadius: 1,
          pointHoverRadius: 4,
          pointHitRadius: 10,
          order: 3
        }
      );

      if (window.wtCumulativeChart) window.wtCumulativeChart.destroy();

      const ctx = el.getContext('2d');
      window.wtCumulativeChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: cumulativeDatasets
        },
        options: {
          responsive: false,
          interaction: {
            mode: 'index',
            intersect: false,
            axis: 'x'
          },
          plugins: {
            tooltip: {
              filter: (tooltipItem) => tooltipItem.dataset?._tooltip !== false,
              callbacks: {
                title: (items) => items.length ? `Day ${items[0].label}` : '',
                label: (context) => `${context.dataset.label}: ${Number(context.parsed?.y || 0).toFixed(1)}h`
              }
            },
            legend: {
              position: 'right',
              labels: {
                color: '#6b7280',
                filter: (legendItem, chartData) => {
                  const ds = chartData?.datasets?.[legendItem.datasetIndex];
                  return !ds || ds._legend !== false;
                }
              }
            },
            wtCumulativeHoverGuide: {
              color: 'rgba(59,130,246,0.28)',
              dash: [4, 4],
              lineWidth: 1
            }
          },
          scales: {
            x: { ticks: { color: '#6b7280', font: { size: 11 } }, title: { display: true, text: 'Day of month', color: '#6b7280' } },
            y: { ticks: { color: '#6b7280', font: { size: 11 } }, beginAtZero: true, title: { display: true, text: 'Cumulative hours', color: '#6b7280' } }
          }
        }
      });
      // Also compute and draw the best month (highest total hours) as a comparison line
      try {
        wtComputeAllStats(); // Ensure cache is populated
        const monthly = wtGetMonthlyTotals();
        if (monthly.labels && monthly.labels.length) {
          const maxIdx = monthly.data.reduce((bestIdx, val, idx, arr) => val > (arr[bestIdx] || 0) ? idx : bestIdx, 0);
          const bestKey = monthly.labels[maxIdx]; // format YYYY-MM
          const parts = bestKey.split('-').map(Number);
          if (parts.length === 2) {
            const bestYear = parts[0];
            const bestMonth = parts[1] - 1; // to 0-indexed
            const daysBest = new Date(bestYear, bestMonth + 1, 0).getDate();
            const cumBest = new Array(maxDays).fill(0);
            let runningBest = 0;
            for (let d = 1; d <= maxDays; d++) {
              if (d <= daysBest) {
                const dateStr = `${bestYear}-${('0'+(bestMonth+1)).slice(-2)}-${('0'+d).slice(-2)}`;
                runningBest += parseFloat(((wtData[dateStr]?.time || 0) / 3600).toFixed(1));
                cumBest[d-1] = runningBest;
              } else {
                cumBest[d-1] = runningBest;
              }
            }

            // append the best month dataset to the existing chart
            window.wtCumulativeChart.data.datasets.push({
              label: 'Best month',
              data: cumBest,
              borderColor: 'rgba(147,51,234,1)',
              backgroundColor: 'rgba(147,51,234,0.08)',
              borderWidth: 1,
              pointRadius: 0,
              pointHoverRadius: 4,
              pointHitRadius: 10,
              borderDash: [3,3],
              order: 4
            });
            window.wtCumulativeChart.update();
          }
        }
      } catch (e) {
        console.error('Error computing best month for cumulative overlay:', e);
      }
}

function wtRenderProportion() {
  const el = document.getElementById('wt-proportion');
  if (!el) return;

  // Match the monthly-hours chart range exactly.
  const labels = [];
  const data = [];
  const monthly = wtGetMonthlySeriesForRange();
  wtApplyChartWidth(el, 'wt-proportion-scroll', monthly.labels.length);

  monthly.labels.forEach((monthKey) => {
    const [yStr, mStr] = monthKey.split('-');
    const y = Number(yStr);
    const m = Number(mStr) - 1; // to 0-indexed
    if (Number.isNaN(y) || Number.isNaN(m) || m < 0 || m > 11) return;

    const daysInMonth = new Date(y, m + 1, 0).getDate();
    let weekdayCount = 0;
    let writtenWeekdays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, m, d);
      const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
      if (!isWeekend) {
        weekdayCount++;
        const dateStr = `${y}-${('0'+(m+1)).slice(-2)}-${('0'+d).slice(-2)}`;
        if (wtData[dateStr] && wtData[dateStr].time > 0) writtenWeekdays++;
      }
    }
    const pct = weekdayCount ? Math.round((writtenWeekdays / weekdayCount) * 100) : 0;
    labels.push(wtFormatMonthLabel(monthKey));
    data.push(pct);
  });

  if (window.wtProportionChart) window.wtProportionChart.destroy();
  const ctx = el.getContext('2d');
  window.wtProportionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '% weekdays written',
        data,
        backgroundColor: 'rgba(59,130,246,0.8)'
      }]
    },
    options: {
      responsive: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6b7280' }, grid: { display: false } },
        y: {
          ticks: { color: '#6b7280', maxTicksLimit: 5 },
          min: 0,
          max: 100,
          title: { display: true, text: '% Days Wrote', color: '#6b7280' },
          afterFit: (scale) => { scale.width = 48; }
        }
      }
    }
  });
}

function wtRenderCurrentStreakWidget(currentStreak, maxStreak) {
  const container = document.getElementById('wt-currentStreakWidget');
  if (!container) return;
  const target = Math.max(maxStreak, 1); // progress toward the recorded max streak
  const pct = Math.min(currentStreak / target, 1);
  const size = 56;
  const radius = 22;
  const stroke = 6;
  const circ = 2 * Math.PI * radius;
  const dash = pct * circ;

  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <defs>
        <linearGradient id="wtRingGrad2" x1="0" x2="1">
          <stop offset="0%" stop-color="#60a5fa" />
          <stop offset="100%" stop-color="#2563eb" />
        </linearGradient>
      </defs>
      <g transform="translate(${size/2}, ${size/2})">
        <circle r="${radius}" fill="none" stroke="#eef2ff" stroke-width="${stroke}" />
        <circle r="${radius}" fill="none" stroke="url(#wtRingGrad2)" stroke-width="${stroke}"
          stroke-dasharray="${dash} ${circ - dash}" stroke-linecap="round" transform="rotate(-90)" />
        <text x="0" y="6" text-anchor="middle" font-size="14" fill="#1e3a8a" font-weight="700">${currentStreak}</text>
      </g>
    </svg>
  `;

  // no badges display here; ring shows progress toward maxStreak
  container.innerHTML = `<div style="position:relative; width:${size}px; height:${size}px">${svg}</div>`;
  container.setAttribute('title', `Current streak: ${currentStreak} / ${target} days`);
}

function wtRenderMaxStreakWidget(maxStreak) {
  const container = document.getElementById('wt-maxStreakWidget');
  if (!container) return;
  container.textContent = `${maxStreak}`;
  container.setAttribute('title', `Longest streak: ${maxStreak} days`);
}

// Stats widget removed per request.

/* ===========================
   Most Productive Weekday
   =========================== */
function wtCalculateMostProductiveWeekday() {
  // Return cached value if available and valid
  if (wtStatsCache.mostProductiveWeekday && !wtStatsCache.isDirty) {
    return wtStatsCache.mostProductiveWeekday;
  }

  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const totals = [0, 0, 0, 0, 0, 0, 0]; // seconds per weekday
  const counts = [0, 0, 0, 0, 0, 0, 0]; // count of days with data

  Object.keys(wtData).forEach(key => {
    const parts = key.split('-').map(Number);
    if (parts.length !== 3) return;
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    const dow = date.getDay();
    const secs = wtData[key].time || 0;
    if (secs > 0) {
      totals[dow] += secs;
      counts[dow]++;
    }
  });

  // Calculate averages (hours) for each weekday
  const averages = totals.map((total, i) => ({
    day: weekdayNames[i],
    dayNum: i,
    avgHours: counts[i] > 0 ? +(total / counts[i] / 3600).toFixed(1) : 0,
    count: counts[i]
  }));

  // Find max (exclude weekends for "most productive")
  const weekdays = averages.filter(a => a.dayNum >= 1 && a.dayNum <= 5);
  if (weekdays.length === 0) return null;

  const best = weekdays.reduce((max, curr) => curr.avgHours > max.avgHours ? curr : max, weekdays[0]);
  return { best, all: averages };
}

function wtRenderMostProductiveWeekday() {
  const container = document.getElementById('wt-productiveWeekday');
  if (!container) return;

  wtComputeAllStats(); // Ensure cache is populated
  const result = wtCalculateMostProductiveWeekday();
  if (!result || result.best.avgHours === 0) {
    container.innerHTML = '<span class="text-gray-500 text-sm">No data yet</span>';
    return;
  }

  const { best, all } = result;

  // Show the best weekday as the main stat
  const html = `
    <div class="flex items-center gap-2">
      <span class="text-lg font-bold text-blue-600">${best.day}</span>
      <span class="text-sm text-gray-600">${best.avgHours}h avg</span>
    </div>
    <div class="flex gap-1 mt-1">
      ${all.filter(a => a.dayNum >= 1 && a.dayNum <= 5).map(a => {
        const pct = best.avgHours > 0 ? (a.avgHours / best.avgHours) * 100 : 0;
        const height = Math.max(pct, 5);
        const isBest = a.day === best.day;
        return `
          <div class="flex flex-col items-center" style="width: 20%">
            <div class="w-full bg-gray-200 rounded" style="height: 40px; display: flex; align-items: flex-end;">
              <div class="w-full rounded ${isBest ? 'bg-blue-500' : 'bg-blue-300'}"
                   style="height: ${height}%"
                   title="${a.day}: ${a.avgHours}h avg (${a.count} days)"></div>
            </div>
            <span class="text-xs text-gray-500 mt-1">${a.day.slice(0,1)}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;

  container.innerHTML = html;
}

/* ===========================
   Export/Import Functions
   =========================== */
function wtExportData() {
  const dataStr = JSON.stringify(wtData, null, 2);
  const blob = new Blob([dataStr], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'writing-tracker-data.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  wtResetExportReminder();
}

function wtImportData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const imported = JSON.parse(evt.target.result);
      if (typeof imported === 'object' && imported !== null) {
        wtData = imported;
        wtInvalidateCache();
        wtSaveData(wtData);
        wtRenderAll();
        wtImportMsg.textContent = 'Import successful!';
        setTimeout(() => { wtImportMsg.textContent = ''; }, 2000);
      } else {
        wtImportMsg.textContent = 'Invalid file.';
      }
    } catch {
      wtImportMsg.textContent = 'Error reading file.';
    }
  };
  reader.readAsText(file);
}

function wtHandleSharedStateChange() {
  if (!wtInitialized) return;
  wtData = wtLoadData();
  wtInvalidateCache();
  wtRenderAll();
  wtCheckExportReminder();
}

/* ===========================
   Event Handlers
   =========================== */
function wtSetupEventHandlers() {
  // Timer controls
  wtStartBtn.onclick = () => {
    if (!wtStartTime) {
      wtStartTime = new Date();
      wtTimerInterval = setInterval(wtUpdateTimerDisplay, 100);
      wtSaveActiveTimer();
      wtSetTimerRunningState();
    }
  };

  wtStopBtn.onclick = () => {
    if (wtStartTime) {
      const finalTime = wtGetCurrentTime();
      wtAccumulatedTime = finalTime;
      wtStartTime = null;
      clearInterval(wtTimerInterval);
      wtTimerInterval = null;
      wtSaveActiveTimer();
      wtSetTimerStoppedState();
      wtSaveSession();
    }
  };

  // Manual time addition
  wtAddMinutesBtn.onclick = () => {
    const min = parseInt(wtManualMinutes.value, 10);
    if (!isNaN(min) && min > 0) {
      const today = wtGetTodayKey();
      const updatedTime = (wtData[today]?.time || 0) + (min * 60);
      wtSetDayTime(today, updatedTime);
      wtRenderAll();
      wtShowSessionMessage(`Added ${min} minute${min === 1 ? '' : 's'}!`);
      setTimeout(() => {
        if (wtSessionMsg.textContent === `Added ${min} minute${min === 1 ? '' : 's'}!`) {
          wtSessionMsg.textContent = '';
        }
      }, 2000);
      wtManualMinutes.value = '';
    }
  };

  // Calendar navigation
  document.getElementById('wt-prevMonth').onclick = () => {
    wtCalMonth--;
    if (wtCalMonth < 0) {
      wtCalMonth = 11;
      wtCalYear--;
    }
    wtRenderCalendar();
  };

  document.getElementById('wt-nextMonth').onclick = () => {
    wtCalMonth++;
    if (wtCalMonth > 11) {
      wtCalMonth = 0;
      wtCalYear++;
    }
    wtRenderCalendar();
  };

  // Export/Import
  wtExportBtn.onclick = wtExportData;
  wtImportInput.onchange = wtImportData;
  wtEditForm.onsubmit = wtSaveEditedDay;
  wtEditCloseBtn.onclick = wtCloseEditModal;
  wtEditCancelBtn.onclick = wtCloseEditModal;
  wtEditDeleteBtn.onclick = wtClearEditedDay;
  wtEditModal.onclick = (event) => {
    if (event.target === wtEditModal) wtCloseEditModal();
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && wtEditModal && !wtEditModal.classList.contains('hidden')) {
      wtCloseEditModal();
    }
  });

  // Chart range controls (shared by monthly + proportion charts)
  document.querySelectorAll('[data-wt-range]').forEach((btn) => {
    btn.onclick = () => {
      const nextRange = btn.getAttribute('data-wt-range');
      if (!Object.prototype.hasOwnProperty.call(WT_CHART_RANGE_MONTHS, nextRange)) return;
      wtChartRange = nextRange;
      wtUpdateChartRangeButtons();
      wtRenderMonthlyTotals();
      wtRenderProportion();
    };
  });
}

function wtUpdateChartRangeButtons() {
  document.querySelectorAll('[data-wt-range]').forEach((btn) => {
    const isActive = btn.getAttribute('data-wt-range') === wtChartRange;
    btn.className = isActive
      ? "px-2 py-1 rounded-md text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
      : "px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors";
  });
}

/* ===========================
   Initialization
   =========================== */
function initializeWritingTracker() {
  if (wtInitialized) return;
  wtInitialized = true;
  // Cache DOM elements
  wtTimerDisplay = document.getElementById('wt-timerDisplay');
  wtStartBtn = document.getElementById('wt-startBtn');
  wtStopBtn = document.getElementById('wt-stopBtn');
  wtSessionMsg = document.getElementById('wt-sessionMsg');
  wtManualMinutes = document.getElementById('wt-manualMinutes');
  wtAddMinutesBtn = document.getElementById('wt-addMinutesBtn');
  wtExportBtn = document.getElementById('wt-exportBtn');
  wtImportInput = document.getElementById('wt-importInput');
  wtImportMsg = document.getElementById('wt-importMsg');
  wtEditModal = document.getElementById('wt-editModal');
  wtEditForm = document.getElementById('wt-editForm');
  wtEditDateLabel = document.getElementById('wt-editDateLabel');
  wtEditCurrentValue = document.getElementById('wt-editCurrentValue');
  wtEditHours = document.getElementById('wt-editHours');
  wtEditMinutes = document.getElementById('wt-editMinutes');
  wtEditMsg = document.getElementById('wt-editMsg');
  wtEditCloseBtn = document.getElementById('wt-editCloseBtn');
  wtEditCancelBtn = document.getElementById('wt-editCancelBtn');
  wtEditDeleteBtn = document.getElementById('wt-editDeleteBtn');
  wtUpdateChartRangeButtons();

  // Load data and initialize
  wtData = wtLoadData();
  // Lazy load timer display
  const timerDisplay = document.getElementById('wt-timerDisplay');
  if ('IntersectionObserver' in window && timerDisplay) {
    const timerObserver = new IntersectionObserver((entries, obs) => {
      if (entries[0].isIntersecting) {
        wtLoadActiveTimer();
        wtUpdateTimerDisplay();
        obs.disconnect();
      }
    }, { threshold: 0.1 });
    timerObserver.observe(timerDisplay);
  } else {
    wtLoadActiveTimer();
    wtUpdateTimerDisplay();
  }

  // Lazy load calendar
  const calendarEl = document.getElementById('wt-calendar');
  if ('IntersectionObserver' in window && calendarEl) {
    const calObserver = new IntersectionObserver((entries, obs) => {
      if (entries[0].isIntersecting) {
        wtRenderCalendar();
        obs.disconnect();
      }
    }, { threshold: 0.1 });
    calObserver.observe(calendarEl);
  } else {
    wtRenderCalendar();
  }

  // Lazy load charts when visible (anchor on the cumulative canvas)
  const chartsAnchor = document.getElementById('wt-cumulative') || document.getElementById('wt-monthly');
  if ('IntersectionObserver' in window && chartsAnchor) {
    const observer = new IntersectionObserver((entries, obs) => {
      if (entries[0].isIntersecting) {
        wtRenderMonthlyTotals();
        wtRenderCumulativeOverlay();
        wtRenderProportion();
        wtRenderMostProductiveWeekday();
        obs.disconnect();
      }
    }, { threshold: 0.1 });
    observer.observe(chartsAnchor);
  } else {
    wtRenderAll();
  }
  wtCheckExportReminder();

  // Setup event handlers
  wtSetupEventHandlers();

  const homepageState = window.HomepageState;
  if (homepageState && homepageState.events) {
    window.addEventListener(homepageState.events.stateChanged, wtHandleSharedStateChange);
    window.addEventListener(homepageState.events.syncChanged, wtCheckExportReminder);
  }
}

// Make function globally available
window.initializeWritingTracker = initializeWritingTracker;

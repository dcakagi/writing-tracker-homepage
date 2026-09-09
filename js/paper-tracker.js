/* ===========================
   Paper Reading Tracker
   =========================== */

(function () {
  let paperData = { papers: [] };
  let calendarYear = new Date().getFullYear();
  let calendarMonth = new Date().getMonth();
  let selectedDate = '';
  let editingId = '';
  let initialized = false;
  const ui = {};

  function todayISO() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function formatDate(dateStr, options) {
    const parts = String(dateStr || '').split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return dateStr || '';
    return new Intl.DateTimeFormat(undefined, options || { year: 'numeric', month: 'short', day: 'numeric' })
      .format(new Date(parts[0], parts[1] - 1, parts[2]));
  }

  function loadData() {
    const stateApi = window.HomepageState;
    if (!stateApi || typeof stateApi.loadUserState !== 'function') return { papers: [] };
    const stored = stateApi.loadUserState().paper_data;
    return stored && Array.isArray(stored.papers) ? stored : { papers: [] };
  }

  async function saveData() {
    const stateApi = window.HomepageState;
    if (!stateApi || typeof stateApi.saveUserStatePatch !== 'function') return;
    await stateApi.saveUserStatePatch({ paper_data: paperData });
  }

  function setMessage(element, message, tone) {
    if (!element) return;
    element.textContent = message || '';
    const color = tone === 'error' ? 'text-red-600' : tone === 'success' ? 'text-green-600' : 'text-gray-500';
    element.className = `min-h-[1.25rem] text-sm ${color}`;
  }

  function safeHttpUrl(value) {
    const candidate = String(value || '').trim();
    if (!candidate) return '';
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch (error) {
      return '';
    }
  }

  function cleanDoi(value) {
    return String(value || '')
      .trim()
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
      .replace(/^doi:\s*/i, '')
      .trim();
  }

  function crossrefDate(message) {
    const source = message['published-print'] || message['published-online'] || message.issued;
    const parts = source && source['date-parts'] && source['date-parts'][0];
    if (!Array.isArray(parts) || !parts.length) return '';
    return parts.map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0')).join('-');
  }

  async function lookupDoi() {
    const doi = cleanDoi(ui.doi.value);
    if (!doi) {
      setMessage(ui.lookupMsg, 'Enter a DOI first.', 'error');
      ui.doi.focus();
      return;
    }

    ui.lookup.disabled = true;
    ui.lookup.textContent = 'Looking up…';
    setMessage(ui.lookupMsg, 'Looking up citation details…');
    try {
      const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(response.status === 404 ? 'No Crossref record was found for that DOI.' : 'Crossref lookup failed.');
      const payload = await response.json();
      const message = payload && payload.message;
      if (!message || typeof message !== 'object') throw new Error('Crossref returned an unexpected response.');

      const authors = Array.isArray(message.author)
        ? message.author.map((author) => [author.given, author.family].filter(Boolean).join(' ')).filter(Boolean).join(', ')
        : '';
      ui.doi.value = message.DOI || doi;
      if (Array.isArray(message.title) && message.title[0]) ui.title.value = message.title[0];
      if (authors) ui.authors.value = authors;
      if (Array.isArray(message['container-title']) && message['container-title'][0]) ui.venue.value = message['container-title'][0];
      const publicationDate = crossrefDate(message);
      if (publicationDate) ui.publicationDate.value = publicationDate;
      ui.url.value = message.URL || `https://doi.org/${message.DOI || doi}`;
      setMessage(ui.lookupMsg, 'Citation details filled. Review them before saving.', 'success');
      if (!ui.readDate.value) ui.readDate.value = todayISO();
    } catch (error) {
      setMessage(ui.lookupMsg, `${error.message || 'DOI lookup failed'} You can enter the details manually.`, 'error');
    } finally {
      ui.lookup.disabled = false;
      ui.lookup.textContent = 'Fill from DOI';
    }
  }

  function resetForm() {
    editingId = '';
    ui.form.reset();
    ui.readDate.value = todayISO();
    ui.formHeading.textContent = 'Log a paper';
    ui.save.textContent = 'Save paper';
    ui.cancelEdit.classList.add('hidden');
    setMessage(ui.lookupMsg, '');
    setMessage(ui.formMsg, '');
  }

  function paperFromForm(existing) {
    const now = new Date().toISOString();
    const doi = cleanDoi(ui.doi.value);
    return {
      id: existing ? existing.id : `paper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: ui.title.value.trim(),
      authors: ui.authors.value.trim(),
      publicationDate: ui.publicationDate.value.trim(),
      venue: ui.venue.value.trim(),
      doi,
      url: safeHttpUrl(ui.url.value) || (doi ? safeHttpUrl(`https://doi.org/${doi}`) : ''),
      readDate: ui.readDate.value,
      notes: ui.notes.value.trim(),
      createdAt: existing && existing.createdAt ? existing.createdAt : now,
      updatedAt: now
    };
  }

  async function submitForm(event) {
    event.preventDefault();
    if (!ui.form.reportValidity()) return;
    const existing = editingId ? paperData.papers.find((paper) => paper.id === editingId) : null;
    const paper = paperFromForm(existing);
    if (!paper.title || !/^\d{4}-\d{2}-\d{2}$/.test(paper.readDate)) {
      setMessage(ui.formMsg, 'A title and date read are required.', 'error');
      return;
    }
    if (ui.url.value.trim() && !paper.url) {
      setMessage(ui.formMsg, 'The paper link must be an http or https address.', 'error');
      return;
    }

    if (existing) {
      paperData.papers = paperData.papers.map((item) => item.id === existing.id ? paper : item);
    } else {
      paperData.papers = [...paperData.papers, paper];
    }
    await saveData();
    paperData = loadData();
    const message = existing ? 'Paper updated.' : 'Paper added to the archive.';
    resetForm();
    setMessage(ui.formMsg, message, 'success');
    renderAll();
  }

  function editPaper(id) {
    const paper = paperData.papers.find((item) => item.id === id);
    if (!paper) return;
    editingId = id;
    ui.doi.value = paper.doi || '';
    ui.title.value = paper.title || '';
    ui.authors.value = paper.authors || '';
    ui.venue.value = paper.venue || '';
    ui.publicationDate.value = paper.publicationDate || '';
    ui.readDate.value = paper.readDate || todayISO();
    ui.url.value = paper.url || '';
    ui.notes.value = paper.notes || '';
    ui.formHeading.textContent = 'Edit paper';
    ui.save.textContent = 'Save changes';
    ui.cancelEdit.classList.remove('hidden');
    setMessage(ui.lookupMsg, '');
    setMessage(ui.formMsg, '');
    ui.formHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    ui.title.focus({ preventScroll: true });
  }

  async function deletePaper(id) {
    const paper = paperData.papers.find((item) => item.id === id);
    if (!paper || !window.confirm(`Remove “${paper.title}” from the paper archive?`)) return;
    paperData.papers = paperData.papers.filter((item) => item.id !== id);
    if (editingId === id) resetForm();
    await saveData();
    paperData = loadData();
    renderAll();
  }

  function appendText(parent, tag, text, className) {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    parent.appendChild(element);
    return element;
  }

  function renderArchive() {
    const query = ui.search.value.trim().toLowerCase();
    const papers = paperData.papers
      .filter((paper) => !selectedDate || paper.readDate === selectedDate)
      .filter((paper) => !query || [paper.title, paper.authors, paper.venue, paper.notes, paper.doi]
        .some((value) => String(value || '').toLowerCase().includes(query)))
      .sort((left, right) => right.readDate.localeCompare(left.readDate) || right.updatedAt.localeCompare(left.updatedAt));

    ui.archive.replaceChildren();
    ui.empty.classList.toggle('hidden', papers.length > 0);
    ui.empty.textContent = paperData.papers.length ? 'No papers match this filter.' : 'No papers logged yet.';
    ui.archiveLabel.textContent = selectedDate
      ? `${papers.length} paper${papers.length === 1 ? '' : 's'} read ${formatDate(selectedDate)}`
      : `${paperData.papers.length} paper${paperData.papers.length === 1 ? '' : 's'} in the archive`;

    papers.forEach((paper) => {
      const card = document.createElement('article');
      card.className = 'paper-archive-card rounded-xl border border-gray-200 bg-gray-50 p-4';
      const top = document.createElement('div');
      top.className = 'flex items-start justify-between gap-3';
      const content = document.createElement('div');
      content.className = 'min-w-0';
      if (paper.url) {
        const link = document.createElement('a');
        link.href = paper.url;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.className = 'font-semibold leading-snug text-gray-800 hover:text-blue-600 hover:underline';
        link.textContent = paper.title;
        content.appendChild(link);
      } else {
        appendText(content, 'h4', paper.title, 'font-semibold leading-snug text-gray-800');
      }
      if (paper.authors) appendText(content, 'p', paper.authors, 'mt-1 text-sm text-gray-600');
      const citation = [paper.venue, paper.publicationDate].filter(Boolean).join(' · ');
      if (citation) appendText(content, 'p', citation, 'mt-1 text-xs text-gray-500');
      appendText(content, 'p', `Read ${formatDate(paper.readDate)}`, 'mt-2 text-xs font-medium text-blue-600');

      const actions = document.createElement('div');
      actions.className = 'flex shrink-0 gap-1';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'paper-action';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => editPaper(paper.id));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'paper-action text-red-600';
      remove.textContent = 'Delete';
      remove.addEventListener('click', () => deletePaper(paper.id));
      actions.append(edit, remove);
      top.append(content, actions);
      card.appendChild(top);

      if (paper.notes) appendText(card, 'p', paper.notes, 'paper-notes mt-3 border-t border-gray-200 pt-3 text-sm leading-relaxed text-gray-700');
      ui.archive.appendChild(card);
    });
  }

  function renderCalendar() {
    ui.calendar.replaceChildren();
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    ui.monthLabel.textContent = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' })
      .format(new Date(calendarYear, calendarMonth, 1));
    const counts = paperData.papers.reduce((map, paper) => {
      map[paper.readDate] = (map[paper.readDate] || 0) + 1;
      return map;
    }, {});
    for (let blank = 0; blank < firstDay; blank++) ui.calendar.appendChild(document.createElement('div'));

    for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber++) {
      const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
      const count = counts[dateStr] || 0;
      const day = document.createElement('button');
      day.type = 'button';
      day.className = count
        ? 'paper-calendar-day bg-violet-100 font-semibold text-violet-800 hover:bg-violet-200'
        : 'paper-calendar-day bg-slate-100 text-gray-600';
      if (dateStr === todayISO()) day.classList.add('paper-calendar-today');
      if (dateStr === selectedDate) day.classList.add('paper-calendar-selected');
      day.textContent = String(dayNumber);
      day.title = count ? `${count} paper${count === 1 ? '' : 's'} read` : 'No papers logged';
      day.setAttribute('aria-label', `${formatDate(dateStr)}: ${day.title}`);
      day.disabled = count === 0;
      if (count) day.addEventListener('click', () => {
        selectedDate = dateStr;
        ui.clearDateFilter.classList.remove('invisible');
        renderCalendar();
        renderArchive();
      });
      ui.calendar.appendChild(day);
    }
  }

  function renderWeekSummary() {
    const now = new Date();
    const mondayOffset = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    const start = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    const end = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;
    const thisWeek = paperData.papers.filter((paper) => paper.readDate >= start && paper.readDate <= end);
    const readingDays = new Set(thisWeek.map((paper) => paper.readDate)).size;
    ui.weekSummary.textContent = `${thisWeek.length} paper${thisWeek.length === 1 ? '' : 's'} this week · ${readingDays} reading day${readingDays === 1 ? '' : 's'}`;
  }

  function renderAll() {
    if (selectedDate && !paperData.papers.some((paper) => paper.readDate === selectedDate)) {
      selectedDate = '';
      ui.clearDateFilter.classList.add('invisible');
    }
    renderWeekSummary();
    renderCalendar();
    renderArchive();
  }

  function bindUi() {
    ui.form = document.getElementById('pt-paperForm');
    ui.formHeading = document.getElementById('pt-formHeading');
    ui.doi = document.getElementById('pt-doi');
    ui.lookup = document.getElementById('pt-doiLookup');
    ui.lookupMsg = document.getElementById('pt-lookupMsg');
    ui.title = document.getElementById('pt-title');
    ui.authors = document.getElementById('pt-authors');
    ui.venue = document.getElementById('pt-venue');
    ui.publicationDate = document.getElementById('pt-publicationDate');
    ui.readDate = document.getElementById('pt-readDate');
    ui.url = document.getElementById('pt-url');
    ui.notes = document.getElementById('pt-notes');
    ui.formMsg = document.getElementById('pt-formMsg');
    ui.save = document.getElementById('pt-savePaper');
    ui.cancelEdit = document.getElementById('pt-cancelEdit');
    ui.weekSummary = document.getElementById('pt-weekSummary');
    ui.calendar = document.getElementById('pt-calendar');
    ui.monthLabel = document.getElementById('pt-monthLabel');
    ui.clearDateFilter = document.getElementById('pt-clearDateFilter');
    ui.search = document.getElementById('pt-search');
    ui.archive = document.getElementById('pt-archive');
    ui.archiveLabel = document.getElementById('pt-archiveLabel');
    ui.empty = document.getElementById('pt-empty');
  }

  function bindEvents() {
    ui.lookup.addEventListener('click', lookupDoi);
    ui.form.addEventListener('submit', submitForm);
    ui.cancelEdit.addEventListener('click', resetForm);
    ui.search.addEventListener('input', renderArchive);
    document.getElementById('pt-prevMonth').addEventListener('click', () => {
      calendarMonth--;
      if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
      renderCalendar();
    });
    document.getElementById('pt-nextMonth').addEventListener('click', () => {
      calendarMonth++;
      if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
      renderCalendar();
    });
    ui.clearDateFilter.addEventListener('click', () => {
      selectedDate = '';
      ui.clearDateFilter.classList.add('invisible');
      renderCalendar();
      renderArchive();
    });
    const stateApi = window.HomepageState;
    if (stateApi && stateApi.events) {
      window.addEventListener(stateApi.events.stateChanged, (event) => {
        if (!initialized) return;
        if (event && event.detail && event.detail.source === 'local-save') return;
        paperData = loadData();
        renderAll();
      });
    }
  }

  function initializePaperTracker() {
    if (initialized || !document.getElementById('pt-paperForm')) return;
    initialized = true;
    bindUi();
    paperData = loadData();
    resetForm();
    bindEvents();
    renderAll();
  }

  window.initializePaperTracker = initializePaperTracker;
})();

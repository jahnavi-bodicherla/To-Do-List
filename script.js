/* ═══════════════════════════════════════════════════
   Glassy To-Do · script.js
   IIFE module — zero global pollution
   ─────────────────────────────────────────────────
   Features: add/toggle/delete, priority, filter,
   search, clear completed, export/import JSON,
   theme toggle, localStorage persistence
   ═══════════════════════════════════════════════════ */

(function GlassyTodo() {
  'use strict';

  /* ── Storage keys ── */
  const STORAGE_TASKS = 'glassy_tasks_v1';
  const STORAGE_THEME = 'glassy_theme_v1';
  const MAX_LEN       = 160;
  const WARN_AT       = 140;

  /* ── DOM references ── */
  const html          = document.documentElement;
  const taskInput     = document.getElementById('taskInput');
  const inputWrap     = document.getElementById('inputWrap');
  const addBtn        = document.getElementById('addBtn');
  const charCount     = document.getElementById('charCount');
  const priorityBtns  = document.querySelectorAll('.priority-btn');
  const searchInput   = document.getElementById('searchInput');
  const exportBtn     = document.getElementById('exportBtn');
  const importInput   = document.getElementById('importInput');
  const filterTrack   = document.getElementById('filterTrack');
  const filterPill    = document.getElementById('filterPill');
  const filterTabs    = document.querySelectorAll('.filter-tab');
  const clearBtn      = document.getElementById('clearBtn');
  const taskList      = document.getElementById('taskList');
  const emptyState    = document.getElementById('emptyState');
  const emptyMsg      = document.getElementById('emptyMsg');
  const themeToggle   = document.getElementById('themeToggle');
  const themeIcon     = document.getElementById('themeIcon');
  const themeText     = document.getElementById('themeText');
  const dateDisplay   = document.getElementById('dateDisplay');
  const statTotal     = document.getElementById('statTotal');
  const statDone      = document.getElementById('statDone');
  const statActive    = document.getElementById('statActive');

  /* ── State ── */
  const state = {
    tasks:    loadTasks(),
    filter:   'all',
    theme:    loadStoredTheme(),
    priority: 'low',   // selected priority for new task
    search:   '',
  };

  let _submitting = false;  // rapid-submit guard

  /* ══════════════════════════════════════
     STORAGE
     ══════════════════════════════════════ */

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_TASKS, JSON.stringify(state.tasks));
    } catch (e) {
      console.warn('[Glassy] saveTasks:', e.message);
    }
  }

  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_TASKS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(t =>
        t && typeof t.id        === 'number' &&
             typeof t.text      === 'string'  &&
             typeof t.completed === 'boolean' &&
             typeof t.createdAt === 'number'  &&
             ['low','medium','high'].includes(t.priority) &&
             t.text.trim().length > 0
      );
    } catch (e) {
      console.warn('[Glassy] loadTasks:', e.message);
      try { localStorage.removeItem(STORAGE_TASKS); } catch (_) {}
      return [];
    }
  }

  function loadStoredTheme() {
    try {
      const t = localStorage.getItem(STORAGE_THEME);
      return t === 'light' ? 'light' : 'dark';
    } catch (_) { return 'dark'; }
  }

  /* ══════════════════════════════════════
     STATE MUTATIONS
     ══════════════════════════════════════ */

  function addTask() {
    if (_submitting) return;
    const text = (taskInput.value || '').replace(/\s+/g, ' ').trim();

    if (!text) {
      shake();
      taskInput.focus();
      return;
    }

    _submitting = true;
    setTimeout(() => { _submitting = false; }, 280);

    const task = {
      id:        Date.now(),
      text,
      completed: false,
      priority:  state.priority,
      createdAt: Date.now(),
    };

    state.tasks.unshift(task);
    saveTasks();

    // Switch to 'all' if on 'completed' so user sees new task
    if (state.filter === 'completed') {
      state.filter = 'all';
      syncFilterTabs();
    }

    taskInput.value = '';
    updateCharCount();
    render();
    taskInput.focus();
  }

  function toggleTask(id) {
    const t = state.tasks.find(t => t.id === id);
    if (!t) return;
    t.completed = !t.completed;
    saveTasks();
    render();
  }

  /**
   * deleteTask(id)
   * Applies .exiting CSS class → waits for transitionend → removes from state.
   * Safety timeout in case transition never fires.
   */
  function deleteTask(id) {
    const li = taskList.querySelector(`.task-item[data-id="${id}"]`);
    if (!li) return;

    li.classList.add('exiting');

    const remove = () => {
      state.tasks = state.tasks.filter(t => t.id !== id);
      saveTasks();
      render();
    };

    li.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 350);   // fallback
  }

  function filterTasks(filter) {
    if (state.filter === filter) return;
    state.filter = filter;
    syncFilterTabs();
    render();
  }

  /**
   * getFilteredTasks()
   * Returns derived subset — never mutates state.tasks.
   * Also applies search query.
   */
  function getFilteredTasks() {
    let tasks = state.tasks;

    switch (state.filter) {
      case 'active':    tasks = tasks.filter(t => !t.completed); break;
      case 'completed': tasks = tasks.filter(t =>  t.completed); break;
    }

    if (state.search) {
      const q = state.search.toLowerCase();
      tasks = tasks.filter(t => t.text.toLowerCase().includes(q));
    }

    return tasks;
  }

  function clearCompleted() {
    const count = state.tasks.filter(t => t.completed).length;
    if (!count) return;
    state.tasks = state.tasks.filter(t => !t.completed);
    saveTasks();
    if (state.filter === 'completed') {
      state.filter = 'all';
      syncFilterTabs();
    }
    render();
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    try { localStorage.setItem(STORAGE_THEME, state.theme); } catch (_) {}
  }

  function setPriority(p) {
    state.priority = p;
    priorityBtns.forEach(btn => {
      const active = btn.dataset.priority === p;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  /* ══════════════════════════════════════
     RENDER
     ══════════════════════════════════════ */

  function render() {
    const visible = getFilteredTasks();
    taskList.innerHTML = '';

    if (visible.length === 0) {
      emptyState.hidden = false;
      emptyMsg.textContent = getEmptyMsg();
    } else {
      emptyState.hidden = true;
      visible.forEach((task, i) => {
        const li = buildItem(task, i);
        taskList.appendChild(li);
      });
    }

    updateStats();
    updateClearBtn();
    positionPill(false);
  }

  function buildItem(task, idx) {
    const li = document.createElement('li');
    li.classList.add('task-item');
    if (task.completed) li.classList.add('completed');
    li.dataset.id       = task.id;
    li.dataset.priority = task.priority;
    li.style.setProperty('--i', Math.min(idx, 10));
    li.setAttribute('role', 'listitem');

    /* Checkbox */
    const check = document.createElement('input');
    check.type    = 'checkbox';
    check.checked = task.completed;
    check.classList.add('task-check');
    check.setAttribute('aria-label', (task.completed ? 'Uncheck: ' : 'Complete: ') + task.text);
    check.addEventListener('change', () => toggleTask(task.id));

    /* Body */
    const body = document.createElement('div');
    body.classList.add('task-body');

    const textEl = document.createElement('span');
    textEl.classList.add('task-text');
    textEl.textContent = task.text;  // textContent — no XSS risk

    const meta = document.createElement('div');
    meta.classList.add('task-meta');

    const badge = document.createElement('span');
    badge.classList.add('task-priority-badge', `badge-${task.priority}`);
    badge.textContent = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);

    const ts = document.createElement('span');
    ts.textContent = formatTimestamp(task.createdAt);

    meta.appendChild(badge);
    meta.appendChild(ts);
    body.appendChild(textEl);
    body.appendChild(meta);

    /* Delete button */
    const del = document.createElement('button');
    del.type = 'button';
    del.classList.add('task-del');
    del.setAttribute('aria-label', 'Delete task: ' + task.text);
    del.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M1.5 1.5l10 10M11.5 1.5l-10 10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
    </svg>`;
    del.addEventListener('click', () => deleteTask(task.id));

    li.appendChild(check);
    li.appendChild(body);
    li.appendChild(del);
    return li;
  }

  /* ══════════════════════════════════════
     UI HELPERS
     ══════════════════════════════════════ */

  function updateStats() {
    const total  = state.tasks.length;
    const done   = state.tasks.filter(t => t.completed).length;
    const active = total - done;
    statTotal.textContent  = `${total} total`;
    statDone.textContent   = `${done} completed`;
    statActive.textContent = `${active} active`;
  }

  function updateClearBtn() {
    clearBtn.disabled = !state.tasks.some(t => t.completed);
  }

  /**
   * positionPill(instant)
   * Moves the gradient pill to sit under the active filter tab.
   * Uses offsetLeft + offsetWidth — no hardcoded values.
   */
  function positionPill(instant) {
    const active = filterTrack.querySelector('.filter-tab.active');
    if (!active) return;

    if (instant) {
      filterPill.style.transition = 'none';
    }

    filterPill.style.width     = `${active.offsetWidth}px`;
    filterPill.style.transform = `translateX(${active.offsetLeft - 4}px)`;

    if (instant) {
      requestAnimationFrame(() => { filterPill.style.transition = ''; });
    }
  }

  function syncFilterTabs() {
    filterTabs.forEach(btn => {
      const on = btn.dataset.filter === state.filter;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    positionPill(false);
  }

  function applyTheme() {
    html.setAttribute('data-theme', state.theme);
    const isDark = state.theme === 'dark';
    themeIcon.textContent = isDark ? '🌙' : '☀️';
    themeText.textContent = isDark ? 'Light' : 'Dark';
    themeToggle.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} mode`);
  }

  function setDateLabel() {
    const d = new Date();
    dateDisplay.textContent = d.toLocaleDateString(undefined, {
      weekday: 'long', month: 'short', day: 'numeric'
    }).toUpperCase();
    dateDisplay.setAttribute('datetime', d.toISOString().split('T')[0]);
  }

  function updateCharCount() {
    const len = (taskInput.value || '').length;
    charCount.textContent = len ? `${len}/${MAX_LEN}` : '';
    charCount.classList.toggle('visible', len > 0);
    charCount.classList.toggle('warn', len >= WARN_AT);
  }

  function getEmptyMsg() {
    if (state.search) return `No tasks match "${state.search}".`;
    const msgs = {
      all:       'No tasks yet. Add your first task! ✨',
      active:    'No active tasks. All done! 🎉',
      completed: 'Nothing completed yet.',
    };
    return msgs[state.filter] || msgs.all;
  }

  function shake() {
    inputWrap.classList.remove('shake');
    void inputWrap.offsetWidth;
    inputWrap.classList.add('shake');
    inputWrap.addEventListener('animationend', () => inputWrap.classList.remove('shake'), { once: true });
  }

  /* ══════════════════════════════════════
     EXPORT / IMPORT
     ══════════════════════════════════════ */

  function exportTasks() {
    const data = JSON.stringify({ version: 1, tasks: state.tasks }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `glassy-todo-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importTasks(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        const incoming = Array.isArray(parsed) ? parsed
                       : (parsed && Array.isArray(parsed.tasks)) ? parsed.tasks
                       : null;

        if (!incoming) throw new Error('Invalid format');

        /* Validate each task */
        const valid = incoming.filter(t =>
          t && typeof t.id === 'number' &&
               typeof t.text === 'string' &&
               typeof t.completed === 'boolean' &&
               t.text.trim().length > 0
        ).map(t => ({
          id:        t.id || Date.now() + Math.random(),
          text:      String(t.text).trim().slice(0, MAX_LEN),
          completed: Boolean(t.completed),
          priority:  ['low','medium','high'].includes(t.priority) ? t.priority : 'low',
          createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now(),
        }));

        /* Merge — avoid duplicates by id */
        const existingIds = new Set(state.tasks.map(t => t.id));
        const merged      = [...state.tasks, ...valid.filter(t => !existingIds.has(t.id))];

        /* Sort by createdAt descending */
        merged.sort((a, b) => b.createdAt - a.createdAt);
        state.tasks = merged;

        saveTasks();
        render();
      } catch (err) {
        alert(`Import failed: ${err.message}`);
      }
    };
    reader.readAsText(file);
    importInput.value = '';  // reset so same file can be re-imported
  }

  /* ══════════════════════════════════════
     UTILITIES
     ══════════════════════════════════════ */

  /**
   * formatTimestamp(ts) → "Added Jun 5 · 14:32"
   */
  function formatTimestamp(ts) {
    const d   = new Date(ts);
    const mon = d.toLocaleDateString(undefined, { month: 'short' });
    const day = d.getDate();
    const hh  = String(d.getHours()).padStart(2, '0');
    const mm  = String(d.getMinutes()).padStart(2, '0');
    return `${mon} ${day} · ${hh}:${mm}`;
  }

  function debounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  }

  /* ══════════════════════════════════════
     EVENT WIRING
     ══════════════════════════════════════ */

  addBtn.addEventListener('click', addTask);

  taskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); addTask(); }
    if (e.key === 'Escape') { taskInput.value = ''; updateCharCount(); taskInput.blur(); }
  });

  taskInput.addEventListener('input', updateCharCount);

  priorityBtns.forEach(btn => {
    btn.addEventListener('click', () => setPriority(btn.dataset.priority));
  });

  searchInput.addEventListener('input', debounce(() => {
    state.search = searchInput.value.trim();
    render();
  }, 200));

  filterTrack.addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (tab) filterTasks(tab.dataset.filter);
  });

  clearBtn.addEventListener('click', clearCompleted);
  themeToggle.addEventListener('click', toggleTheme);
  exportBtn.addEventListener('click', exportTasks);

  importInput.addEventListener('change', (e) => {
    importTasks(e.target.files[0]);
  });

  window.addEventListener('resize', debounce(() => positionPill(false), 120));

  /* ══════════════════════════════════════
     BOOT
     ══════════════════════════════════════ */
  (function boot() {
    applyTheme();
    setDateLabel();
    positionPill(true);
    render();
    taskInput.focus();
  })();

})();

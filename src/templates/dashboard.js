// ── State ────────────────────────────────────────────────────────────────────
let todos = [];
let editingId = null;
let currentCategory = 'todo';
let selectedDate = todayISO();
let suggestions = [];
let currentUser = localStorage.getItem('currentUser') || 'ashni';

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateLabel(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return {
    iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
    dayNum: d.getDate(),
  };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

// ── Profile Switcher ──────────────────────────────────────────────────────────
function setProfile(userId) {
  currentUser = userId;
  localStorage.setItem('currentUser', userId);
  document.querySelectorAll('.profile-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.user === userId);
  });
  fetchSuggestions();
  fetchTodos();
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Set initial active profile pill
  document.querySelectorAll('.profile-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.user === currentUser);
  });
  renderDateStrip();
  fetchSuggestions();
  fetchTodos();

  const input = document.getElementById('add-input');
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTask();
  });

  const timeInput = document.getElementById('time-input');
  timeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTask();
  });
});

// ── Date Strip ────────────────────────────────────────────────────────────────
function renderDateStrip() {
  const strip = document.getElementById('date-strip');
  const today = todayISO();
  const chips = [];

  for (let i = 0; i < 7; i++) {
    const { iso, dayName, dayNum } = dateLabel(i);
    const isToday = iso === today;
    const isSelected = iso === selectedDate;

    const cls = ['date-chip', isToday ? 'today' : '', isSelected ? 'selected' : ''].filter(Boolean).join(' ');

    chips.push(`
      <button class="${cls}" onclick="selectDate('${iso}')">
        <span class="day-name">${escapeHtml(dayName)}</span>
        <span class="day-num">${dayNum}</span>
      </button>
    `);
  }

  strip.innerHTML = chips.join('');
}

function selectDate(iso) {
  selectedDate = iso;
  renderDateStrip();
  fetchTodos();
  updateTasksHeader();
}

function updateTasksHeader() {
  const header = document.getElementById('tasks-header');
  const today = todayISO();
  let label;
  if (selectedDate === today) {
    label = 'Today';
  } else {
    const d = new Date(selectedDate + 'T00:00:00');
    label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }
  const catLabel = currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1);
  header.textContent = `${catLabel} · ${label}`;
}

// ── Category Tabs ─────────────────────────────────────────────────────────────
function switchCategory(category) {
  currentCategory = category;
  const isTodo   = category === 'todo';
  const isCars   = category === 'cars';
  const isPeriod = category === 'period';
  const isTv     = category === 'tv';

  document.querySelectorAll('.list-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === category);
  });

  document.getElementById('cars-view').style.display    = isCars   ? 'block' : 'none';
  document.getElementById('period-view').style.display  = isPeriod ? 'flex'  : 'none';
  document.getElementById('tv-view').style.display      = isTv     ? 'flex'  : 'none';
  document.querySelector('.content').style.display      = isTodo   ? 'flex'  : 'none';
  document.querySelector('.date-strip').style.display   = isTodo   ? 'flex'  : 'none';
  document.getElementById('print-btn').style.display    = isTodo   ? ''      : 'none';

  const titleEl  = document.querySelector('.topbar-title');
  const eyebrowEl = document.getElementById('topbar-date');
  if (isCars)      titleEl.textContent = 'CARS SCORES';
  else if (isPeriod) titleEl.textContent = 'CYCLE TRACKER';
  else if (isTv)   titleEl.textContent = 'THE LIST';
  else             titleEl.textContent = 'TO-DO LIST';

  // Restore date eyebrow when leaving period tab
  if (!isPeriod) {
    const _d = new Date();
    eyebrowEl.textContent =
      _d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() + ' · ' +
      _d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  }

  if (isCars) {
    fetchCarsData();
    renderSubjectCircles();
  } else if (isPeriod) {
    fetchPeriodLogs();
  } else {
    fetchSuggestions();
    fetchTodos();
    updateTasksHeader();
  }
}

// ── CARS View ─────────────────────────────────────────────────────────────────
const CARS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/17P30_NWjBy2Nm9keI-w5qxdKkNzFtaJbKvIfzsS0Hks/gviz/tq?tqx=out:csv';

async function fetchCarsData() {
  const grid = document.getElementById('cars-grid');
  grid.innerHTML = '<div class="cars-loading">Loading...</div>';

  try {
    const res = await fetch(CARS_SHEET_URL);
    const text = await res.text();
    const rows = text.trim().split('\n').slice(1);
    const entries = rows
      .map(row => {
        const parts = row.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        return { date: parts[0], score: parts[1] };
      })
      .filter(e => e.date && e.score);
    renderCarsGrid(entries);
  } catch (err) {
    grid.innerHTML = `<div class="error">Failed to load CARS data: ${escapeHtml(err.message)}</div>`;
  }
}

function scoreColor(score) {
  const [num, denom] = score.split('/').map(Number);
  if (isNaN(num) || isNaN(denom)) return '';
  const diff = denom - num;
  if (diff === 0) return 'green';
  if (diff <= 2) return 'yellow';
  return 'red';
}

function renderCarsGrid(entries) {
  const grid = document.getElementById('cars-grid');
  if (entries.length === 0) {
    grid.innerHTML = '<div class="cars-loading">No data yet.</div>';
    return;
  }

  const weeks = [];
  for (let i = 0; i < entries.length; i += 7) {
    weeks.push(entries.slice(i, i + 7));
  }

  grid.innerHTML = `<div class="cars-weeks">${
    weeks.map(week => `
      <div class="cars-week">
        ${week.map(({ date, score }) => `
          <div class="cars-day">
            <div class="cars-circle ${scoreColor(score)}">${escapeHtml(score)}</div>
            <div class="cars-date">${escapeHtml(date)}</div>
          </div>
        `).join('')}
      </div>
    `).join('')
  }</div>`;
}

// ── Subject Progress ──────────────────────────────────────────────────────────
const SUBJECT_TOTALS = {
  biochem: { label: 'Biochem',  total: 922  },
  bio:     { label: 'Bio',      total: 1230 },
  chem:    { label: 'Gen Chem', total: 524  },
  ps:      { label: 'P/S',      total: 2431 },
  orgo:    { label: 'Orgo',     total: 558  },
  physics: { label: 'Physics',  total: 667  },
};

let editingSubject = null;

function loadSubjectProgress() {
  try { return JSON.parse(localStorage.getItem('subjectProgress') || '{}'); }
  catch { return {}; }
}

function persistSubjectProgress(progress) {
  localStorage.setItem('subjectProgress', JSON.stringify(progress));
}

function renderSubjectCircles() {
  const grid = document.getElementById('subjects-grid');
  if (!grid) return;

  const progress = loadSubjectProgress();
  const R = 48;
  const CIRCUM = +(2 * Math.PI * R).toFixed(2);

  grid.innerHTML = Object.entries(SUBJECT_TOTALS).map(([key, { label, total }]) => {
    const done = progress[key] || 0;
    const pct  = Math.min(done / total, 1);
    const offset = +(CIRCUM * (1 - pct)).toFixed(2);
    const isEditing = editingSubject === key;

    return `
      <div class="subject-circle-wrap" id="subject-wrap-${key}">
        <div class="subject-svg-container" onclick="startSubjectEdit('${key}')">
          <svg width="110" height="110" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--border)" stroke-width="7"/>
            <circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--red)" stroke-width="7"
              stroke-dasharray="${CIRCUM}" stroke-dashoffset="${offset}"
              stroke-linecap="round" transform="rotate(-90 60 60)"
              style="transition: stroke-dashoffset 0.4s ease"/>
            <text x="60" y="58" text-anchor="middle"
              font-family="Courier Prime, monospace" font-size="15" font-weight="700"
              fill="var(--dark)">${done}</text>
            <text x="60" y="72" text-anchor="middle"
              font-family="Space Grotesk, sans-serif" font-size="9"
              fill="var(--muted)">/ ${total}</text>
          </svg>
        </div>
        ${isEditing ? `
          <div class="subject-edit-row">
            <input type="number" class="subject-edit-input" id="subject-input-${key}"
              value="${done}" min="0" max="${total}"
              onkeydown="handleSubjectKeydown(event, '${key}')"/>
            <button class="subject-save-btn"   onclick="saveSubjectEdit('${key}')">✓</button>
            <button class="subject-cancel-btn" onclick="cancelSubjectEdit()">✕</button>
          </div>
        ` : `<div class="subject-pct">${Math.round(pct * 100)}%</div>`}
        <div class="subject-label">${label}</div>
      </div>
    `;
  }).join('');

  if (editingSubject) {
    const inp = document.getElementById(`subject-input-${editingSubject}`);
    if (inp) { inp.focus(); inp.select(); }
  }
}

function startSubjectEdit(key) {
  editingSubject = key;
  renderSubjectCircles();
}

function cancelSubjectEdit() {
  editingSubject = null;
  renderSubjectCircles();
}

function saveSubjectEdit(key) {
  const inp = document.getElementById(`subject-input-${key}`);
  if (!inp) return;
  const val = parseInt(inp.value, 10);
  if (isNaN(val) || val < 0) return;
  const progress = loadSubjectProgress();
  progress[key] = val;
  persistSubjectProgress(progress);
  editingSubject = null;
  renderSubjectCircles();
}

function handleSubjectKeydown(event, key) {
  if (event.key === 'Enter') saveSubjectEdit(key);
  else if (event.key === 'Escape') cancelSubjectEdit();
}

// ── Fetch Todos ───────────────────────────────────────────────────────────────
async function fetchTodos() {
  try {
    const params = new URLSearchParams({ category: currentCategory, date: selectedDate, user: currentUser });
    const response = await fetch(`/api/todos?${params}`);
    const data = await response.json();
    todos = data.todos;
    renderTodos();
    hideError();
  } catch (error) {
    showError('Failed to load tasks: ' + error.message);
  }
}

// ── Fetch Suggestions ─────────────────────────────────────────────────────────
async function fetchSuggestions() {
  try {
    const response = await fetch(`/api/suggestions?category=${encodeURIComponent(currentCategory)}&user=${encodeURIComponent(currentUser)}`);
    const data = await response.json();
    suggestions = data.suggestions || [];
    renderSuggestionChips();
    updateDatalist();
  } catch (_) {
    suggestions = [];
  }
}

function renderSuggestionChips() {
  const container = document.getElementById('suggestion-chips');
  if (suggestions.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = suggestions
    .map(s => `<button class="suggestion-chip" onclick="fillInput(${JSON.stringify(escapeHtml(s))})">${escapeHtml(s)}</button>`)
    .join('');
}

function updateDatalist() {
  const dl = document.getElementById('suggestions-list');
  dl.innerHTML = suggestions.map(s => `<option value="${escapeHtml(s)}">`).join('');
}

function fillInput(text) {
  const input = document.getElementById('add-input');
  input.value = text;
  input.focus();
}

// ── Render Todos ──────────────────────────────────────────────────────────────
function renderTodos() {
  updateTasksHeader();
  const container = document.getElementById('tasks-list');

  if (todos.length === 0) {
    container.innerHTML = '<div class="empty-state">No tasks here. Add one above!</div>';
    return;
  }

  container.innerHTML = todos
    .map((todo) => {
      if (editingId === todo.id) {
        return `
          <div class="task-item" data-id="${todo.id}">
            <span class="drag-handle">⋮⋮</span>
            <input type="checkbox" class="task-checkbox" ${todo.completed ? 'checked' : ''} onchange="toggleComplete(${todo.id})" />
            <input
              type="text"
              class="edit-input"
              id="edit-input-${todo.id}"
              value="${escapeHtml(todo.title)}"
              maxlength="200"
              onkeydown="handleEditKeydown(event, ${todo.id})"
            />
            <button class="task-save-btn" onclick="saveEdit(${todo.id})">Save</button>
            <button class="task-cancel-btn" onclick="cancelEdit()">Cancel</button>
          </div>
        `;
      }

      const isRecurring = todo.category === 'Recurring';
      return `
        <div class="task-item ${todo.completed ? 'task-completed' : ''} ${isRecurring ? 'task-recurring' : ''}"
             data-id="${todo.id}"
             draggable="true"
             ondragstart="handleDragStart(event)"
             ondragover="handleDragOver(event)"
             ondrop="handleDrop(event)"
             ondragend="handleDragEnd(event)"
             ondragenter="handleDragEnter(event)"
             ondragleave="handleDragLeave(event)">
          <span class="drag-handle">⋮⋮</span>
          <input type="checkbox" class="task-checkbox" ${todo.completed ? 'checked' : ''} onchange="toggleComplete(${todo.id})" />
          <div class="task-title" onclick="startEdit(${todo.id})">${escapeHtml(todo.title)}</div>
          ${isRecurring ? `<span class="task-recurring-badge">↻</span>` : ''}
          ${todo.time_estimate ? `<span class="task-time">${escapeHtml(todo.time_estimate)}</span>` : ''}
          <button class="task-delete" onclick="deleteTodo(${todo.id})" title="Delete">✕</button>
        </div>
      `;
    })
    .join('');

  if (editingId !== null) {
    const input = document.getElementById(`edit-input-${editingId}`);
    if (input) { input.focus(); input.select(); }
  }
}

// ── Add Task ──────────────────────────────────────────────────────────────────
async function addTask() {
  const input = document.getElementById('add-input');
  const timeInput = document.getElementById('time-input');
  const title = input.value.trim();
  if (!title) return;

  try {
    const response = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        category: currentCategory,
        scheduled_date: selectedDate,
        time_estimate: timeInput.value.trim(),
        user: currentUser,
      }),
    });

    if (!response.ok) throw new Error('Failed to create task');

    input.value = '';
    timeInput.value = '';
    await fetchTodos();
    await fetchSuggestions();
    hideError();
  } catch (error) {
    showError('Failed to add task: ' + error.message);
  }
}

// ── Toggle Complete ────────────────────────────────────────────────────────────
async function toggleComplete(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;

  try {
    const response = await fetch(`/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !todo.completed }),
    });

    if (!response.ok) throw new Error('Failed to update task');

    const data = await response.json();
    const index = todos.findIndex(t => t.id === id);
    todos[index] = data.todo;
    renderTodos();
    hideError();
  } catch (error) {
    showError('Failed to update task: ' + error.message);
    fetchTodos();
  }
}

// ── Edit ──────────────────────────────────────────────────────────────────────
function startEdit(id) {
  if (editingId === id) return;
  editingId = id;
  renderTodos();
}

function cancelEdit() {
  editingId = null;
  renderTodos();
}

async function saveEdit(id) {
  const input = document.getElementById(`edit-input-${id}`);
  const title = input.value.trim();
  if (!title) { showError('Task title cannot be empty'); return; }

  try {
    const response = await fetch(`/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) throw new Error('Failed to update task');

    const data = await response.json();
    const index = todos.findIndex(t => t.id === id);
    todos[index] = data.todo;
    editingId = null;
    renderTodos();
    hideError();
  } catch (error) {
    showError('Failed to update task: ' + error.message);
  }
}

function handleEditKeydown(event, id) {
  if (event.key === 'Enter') saveEdit(id);
  else if (event.key === 'Escape') cancelEdit();
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function deleteTodo(id) {
  if (!confirm('Delete this task?')) return;

  try {
    const response = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete task');
    todos = todos.filter(t => t.id !== id);
    renderTodos();
    hideError();
  } catch (error) {
    showError('Failed to delete task: ' + error.message);
  }
}

// ── Print ─────────────────────────────────────────────────────────────────────
async function printReceipt() {
  const btn = document.getElementById('print-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Printing...';

  try {
    const response = await fetch('/api/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: currentUser, date: selectedDate }),
    });
    if (!response.ok) throw new Error('Failed to print receipt');
    btn.textContent = 'Queued!';
    setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2000);
    hideError();
  } catch (error) {
    showError('Failed to print receipt: ' + error.message);
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ── Error / helpers ───────────────────────────────────────────────────────────
function showError(message) {
  document.getElementById('error-container').innerHTML =
    `<div class="error">${escapeHtml(message)}</div>`;
}

function hideError() {
  document.getElementById('error-container').innerHTML = '';
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────
let draggedElement = null;

function handleDragStart(event) {
  draggedElement = event.currentTarget;
  event.currentTarget.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(event) {
  if (event.currentTarget !== draggedElement) {
    event.currentTarget.classList.add('drag-over');
  }
}

function handleDragLeave(event) {
  event.currentTarget.classList.remove('drag-over');
}

function handleDrop(event) {
  event.stopPropagation();
  event.currentTarget.classList.remove('drag-over');

  if (draggedElement !== event.currentTarget) {
    const allItems = Array.from(document.querySelectorAll('.task-item'));
    const draggedIndex = allItems.indexOf(draggedElement);
    const targetIndex = allItems.indexOf(event.currentTarget);

    const [movedItem] = todos.splice(draggedIndex, 1);
    todos.splice(targetIndex, 0, movedItem);

    renderTodos();

    const orderedIds = todos.map(t => t.id);
    fetch('/api/todos/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    }).catch(err => {
      console.error('Failed to save order:', err);
      showError('Failed to save task order');
    });
  }

  return false;
}

function handleDragEnd(event) {
  event.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

// ── Period Tracker ─────────────────────────────────────────────────────────────
let periodLogs = [];
let periodViewYear = new Date().getFullYear();
let selectedPeriodDate = null;
let selectedFlow = null;
let selectedSymptoms = [];
let cycleStats = null;

async function fetchPeriodLogs() {
  try {
    const res = await fetch(`/api/period?user=${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    periodLogs = data.logs || [];
    cycleStats = computeCycleStats(periodLogs);
    updatePeriodEyebrow();
    renderPeriodYearGrid();
    renderPeriodHistory();
  } catch (err) {
    showError('Failed to load period data: ' + err.message);
  }
}

function computeCycleStats(logs) {
  const flowDates = logs
    .filter(l => l.flow && l.flow !== 'none')
    .map(l => l.date)
    .sort();

  if (flowDates.length === 0) return null;

  // Group consecutive days into period runs (gap ≤ 2 days = same period)
  const runs = [];
  let run = [flowDates[0]];
  for (let i = 1; i < flowDates.length; i++) {
    const prev = new Date(flowDates[i - 1] + 'T00:00:00');
    const curr = new Date(flowDates[i]     + 'T00:00:00');
    if ((curr - prev) / 86400000 <= 2) {
      run.push(flowDates[i]);
    } else {
      runs.push(run);
      run = [flowDates[i]];
    }
  }
  runs.push(run);

  const periodStarts    = runs.map(r => r[0]);
  const periodEnds      = runs.map(r => r[r.length - 1]);
  const periodDurations = runs.map(r => {
    const s = new Date(r[0]             + 'T00:00:00');
    const e = new Date(r[r.length - 1]  + 'T00:00:00');
    return Math.round((e - s) / 86400000) + 1;
  });

  const avgPeriodLength = Math.round(periodDurations.reduce((a, b) => a + b, 0) / periodDurations.length);

  let avgCycleLength = 28;
  if (periodStarts.length >= 2) {
    const gaps = [];
    for (let i = 1; i < periodStarts.length; i++) {
      const a = new Date(periodStarts[i - 1] + 'T00:00:00');
      const b = new Date(periodStarts[i]     + 'T00:00:00');
      gaps.push(Math.round((b - a) / 86400000));
    }
    avgCycleLength = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastStart = new Date(periodStarts[periodStarts.length - 1] + 'T00:00:00');
  const cycleDay  = Math.round((today - lastStart) / 86400000) + 1;

  const nextPeriod = new Date(lastStart);
  nextPeriod.setDate(nextPeriod.getDate() + avgCycleLength);

  const ovCenter = new Date(nextPeriod);
  ovCenter.setDate(ovCenter.getDate() - 14);

  const predictedDates = new Set();
  for (let i = 0; i < avgPeriodLength + 1; i++) {
    const d = new Date(nextPeriod);
    d.setDate(d.getDate() + i);
    predictedDates.add(d.toISOString().slice(0, 10));
  }

  const ovulationDates = new Set();
  for (let i = -3; i <= 3; i++) {
    const d = new Date(ovCenter);
    d.setDate(d.getDate() + i);
    ovulationDates.add(d.toISOString().slice(0, 10));
  }

  return {
    cycleDay,
    lastPeriodStart: periodStarts[periodStarts.length - 1],
    lastPeriodEnd:   periodEnds[periodEnds.length - 1],
    avgCycleLength,
    avgPeriodLength,
    nextPeriodDate:  nextPeriod.toISOString().slice(0, 10),
    daysUntilNext:   Math.round((nextPeriod - today) / 86400000),
    predictedDates,
    ovulationDates,
    runs,
    periodStarts,
    periodEnds,
    periodDurations,
  };
}

function updatePeriodEyebrow() {
  if (currentCategory !== 'period') return;
  const eyebrow = document.getElementById('topbar-date');
  if (!cycleStats) {
    eyebrow.textContent = 'LOG YOUR FIRST PERIOD BELOW';
    return;
  }
  const { cycleDay, nextPeriodDate, daysUntilNext } = cycleStats;
  const nextLabel = daysUntilNext > 0
    ? `IN ${daysUntilNext}D`
    : daysUntilNext === 0 ? 'TODAY' : `${Math.abs(daysUntilNext)}D LATE`;
  const nextDateFmt = new Date(nextPeriodDate + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  eyebrow.textContent = `CYCLE DAY ${cycleDay} · NEXT PERIOD ${nextDateFmt} (${nextLabel})`;
}

function renderPeriodYearGrid() {
  const year = periodViewYear;
  document.getElementById('period-year-label').textContent = year;

  const today  = todayISO();
  const logMap = new Map(periodLogs.map(l => [l.date, l]));
  const MONTHS   = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
  const WEEKDAYS = ['S','M','T','W','T','F','S'];

  const monthBlocks = MONTHS.map((name, m) => {
    const daysInM  = new Date(year, m + 1, 0).getDate();
    const firstDow = new Date(year, m, 1).getDay();

    const wdRow = WEEKDAYS.map(d =>
      `<span class="period-weekday-label">${d}</span>`
    ).join('');

    const circles = [];
    for (let i = 0; i < firstDow; i++) circles.push(`<div class="period-day-circle empty"></div>`);

    for (let d = 1; d <= daysInM; d++) {
      const iso = `${year}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const log = logMap.get(iso);
      const isPeriodDay = log && log.flow && log.flow !== 'none';
      const isPredicted = !isPeriodDay && cycleStats?.predictedDates?.has(iso);
      const isOvulation = !isPeriodDay && !isPredicted && cycleStats?.ovulationDates?.has(iso);
      const cls = ['period-day-circle'];
      if (isPeriodDay) cls.push('period-day');
      if (isPredicted) cls.push('predicted');
      if (isOvulation) cls.push('ovulation');
      if (iso === today)              cls.push('today');
      if (iso === selectedPeriodDate) cls.push('selected');
      circles.push(`<div class="${cls.join(' ')}" onclick="selectPeriodDate('${iso}')">${d}</div>`);
    }

    const rows = [];
    for (let i = 0; i < circles.length; i += 7) {
      rows.push(`<div class="period-cal-row">${circles.slice(i, i + 7).join('')}</div>`);
    }

    return `<div class="period-month-block">
      <div class="period-month-name">${name}</div>
      <div class="period-cal-row">${wdRow}</div>
      ${rows.join('')}
    </div>`;
  });

  document.getElementById('period-year-grid').innerHTML = monthBlocks.join('');
}

function renderPeriodHistory() {
  const list   = document.getElementById('period-history-list');
  const header = document.getElementById('period-history-header');

  if (!cycleStats || cycleStats.runs.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:40px 32px">
      <div class="empty-text">No logs yet</div>
      <div class="empty-sub">tap any day above to start logging</div>
    </div>`;
    header.textContent = 'Period History';
    return;
  }

  const { runs, periodStarts, periodEnds, periodDurations, avgCycleLength, avgPeriodLength } = cycleStats;

  header.textContent = `Period History · avg ${avgCycleLength}d cycle · ${avgPeriodLength}d period`;

  // Collect all symptoms across each run
  const logMap = new Map(periodLogs.map(l => [l.date, l]));

  const rows = [...runs].reverse().map((run, i) => {
    const idx      = runs.length - 1 - i;
    const start    = new Date(periodStarts[idx] + 'T00:00:00');
    const end      = new Date(periodEnds[idx]   + 'T00:00:00');
    const duration = periodDurations[idx];
    const allSymptoms = [...new Set(
      run.flatMap(d => logMap.get(d)?.symptoms || [])
    )];

    const startFmt = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endFmt   = end.toLocaleDateString('en-US',   { month: 'short', day: 'numeric' });
    const dateRange = start.toDateString() === end.toDateString()
      ? startFmt
      : `${startFmt} – ${endFmt}`;

    const symptomsHtml = allSymptoms.length
      ? `<div class="period-run-symptoms">${escapeHtml(allSymptoms.join(' · '))}</div>`
      : '';

    return `<div class="period-run-item">
      <div class="period-run-date">${escapeHtml(dateRange)}</div>
      <span class="task-time">${duration}d</span>
      ${symptomsHtml}
    </div>`;
  });

  list.innerHTML = rows.join('');
}

function shiftPeriodYear(delta) {
  periodViewYear += delta;
  renderPeriodYearGrid();
}

async function selectPeriodDate(dateStr) {
  const log = periodLogs.find(l => l.date === dateStr);
  const isLogged = log && log.flow && log.flow !== 'none';

  if (!isLogged) {
    // Quick tap on empty day: immediately mark as medium, no panel needed
    try {
      await fetch('/api/period', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, flow: 'medium', symptoms: [], notes: '', user: currentUser }),
      });
      await fetchPeriodLogs();
    } catch (err) {
      showError('Failed to log day: ' + err.message);
    }
    return;
  }

  // Tap on already-logged day: open panel to edit / clear
  selectedPeriodDate = dateStr;
  selectedFlow     = log.flow || null;
  selectedSymptoms = log.symptoms ? [...log.symptoms] : [];

  const panel = document.getElementById('period-log-panel');
  panel.style.display = 'block';

  const d = new Date(dateStr + 'T00:00:00');
  document.getElementById('log-panel-date').textContent =
    d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();

  syncFlowPills();
  syncSymptomChips();
  renderPeriodYearGrid();
}

function closePeriodLogPanel() {
  selectedPeriodDate = null;
  document.getElementById('period-log-panel').style.display = 'none';
  renderPeriodYearGrid();
}

function selectFlow(flow) {
  selectedFlow = flow;
  syncFlowPills();
}

function toggleSymptom(symptom) {
  const idx = selectedSymptoms.indexOf(symptom);
  if (idx >= 0) selectedSymptoms.splice(idx, 1);
  else           selectedSymptoms.push(symptom);
  syncSymptomChips();
}

function syncFlowPills() {
  document.querySelectorAll('.flow-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.flow === (selectedFlow || 'none'));
  });
}

function syncSymptomChips() {
  document.querySelectorAll('.symptom-chip').forEach(btn => {
    btn.classList.toggle('active', selectedSymptoms.includes(btn.dataset.symptom));
  });
}

async function savePeriodEntry() {
  if (!selectedPeriodDate) return;
  try {
    const res = await fetch('/api/period', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: selectedPeriodDate,
        flow: selectedFlow,
        symptoms: selectedSymptoms,
        notes: '',
        user: currentUser,
      }),
    });
    if (!res.ok) throw new Error('Save failed');
    await fetchPeriodLogs();
    selectPeriodDate(selectedPeriodDate);
  } catch (err) {
    showError('Failed to save: ' + err.message);
  }
}

async function clearPeriodEntry() {
  if (!selectedPeriodDate) return;
  try {
    const res = await fetch(`/api/period/${selectedPeriodDate}?user=${encodeURIComponent(currentUser)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Clear failed');
    closePeriodLogPanel();
    await fetchPeriodLogs();
  } catch (err) {
    showError('Failed to clear: ' + err.message);
  }
}

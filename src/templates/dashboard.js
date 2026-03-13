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

  document.querySelectorAll('.list-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === category);
  });

  document.getElementById('cars-view').style.display    = isCars   ? 'block' : 'none';
  document.getElementById('period-view').style.display  = isPeriod ? 'flex'  : 'none';
  document.querySelector('.content').style.display      = isTodo   ? 'flex'  : 'none';
  document.querySelector('.date-strip').style.display   = isTodo   ? 'flex'  : 'none';
  document.getElementById('print-btn').style.display    = isTodo   ? ''      : 'none';

  const titleEl = document.querySelector('.topbar-title');
  if (isCars)        titleEl.textContent = 'CARS SCORES';
  else if (isPeriod) titleEl.textContent = 'CYCLE TRACKER';
  else               titleEl.textContent = 'TO-DO LIST';

  if (isCars) {
    fetchCarsData();
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

      return `
        <div class="task-item ${todo.completed ? 'task-completed' : ''}"
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
let periodViewMonth = new Date();
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
    renderPeriodStats();
    renderPeriodCalendar();
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
    const diffDays = (curr - prev) / 86400000;
    if (diffDays <= 2) {
      run.push(flowDates[i]);
    } else {
      runs.push(run);
      run = [flowDates[i]];
    }
  }
  runs.push(run);

  const periodStarts = runs.map(r => r[0]);
  const periodEnds   = runs.map(r => r[r.length - 1]);
  const periodDurations = runs.map(r => {
    const s = new Date(r[0]              + 'T00:00:00');
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
  const lastEnd   = new Date(periodEnds[periodEnds.length - 1]     + 'T00:00:00');
  const cycleDay  = Math.round((today - lastStart) / 86400000) + 1;

  const nextPeriod = new Date(lastStart);
  nextPeriod.setDate(nextPeriod.getDate() + avgCycleLength);

  const ovCenter = new Date(nextPeriod);
  ovCenter.setDate(ovCenter.getDate() - 14);

  // Predicted period dates
  const predictedDates = new Set();
  for (let i = 0; i < avgPeriodLength + 1; i++) {
    const d = new Date(nextPeriod);
    d.setDate(d.getDate() + i);
    predictedDates.add(d.toISOString().slice(0, 10));
  }

  // Ovulation window ±3 days around center
  const ovulationDates = new Set();
  for (let i = -3; i <= 3; i++) {
    const d = new Date(ovCenter);
    d.setDate(d.getDate() + i);
    ovulationDates.add(d.toISOString().slice(0, 10));
  }

  const daysUntilNext = Math.round((nextPeriod - today) / 86400000);

  // Determine phase label
  const isInPeriod = flowDates.includes(todayISO());
  let phase;
  if (isInPeriod) {
    phase = 'menstrual';
  } else if (ovulationDates.has(todayISO())) {
    phase = 'fertile window';
  } else if (daysUntilNext >= 0 && daysUntilNext <= 5) {
    phase = 'late luteal';
  } else if (cycleDay <= 13) {
    phase = 'follicular';
  } else {
    phase = 'luteal';
  }

  return {
    cycleDay,
    phase,
    lastPeriodStart: periodStarts[periodStarts.length - 1],
    lastPeriodEnd:   periodEnds[periodEnds.length - 1],
    avgCycleLength,
    avgPeriodLength,
    nextPeriodDate: nextPeriod.toISOString().slice(0, 10),
    daysUntilNext,
    predictedDates,
    ovulationDates,
    runs,
  };
}

function renderPeriodStats() {
  if (!cycleStats) {
    document.getElementById('stat-cycle-day').textContent    = '—';
    document.getElementById('stat-phase').textContent        = 'log your first period';
    document.getElementById('stat-last-period').textContent  = '—';
    document.getElementById('stat-last-duration').textContent = '';
    document.getElementById('stat-next-period').textContent  = '—';
    document.getElementById('stat-next-in').textContent      = '';
    document.getElementById('stat-avg-cycle').textContent    = '—';
    document.getElementById('stat-avg-period').textContent   = '';
    return;
  }

  const { cycleDay, phase, lastPeriodStart, avgCycleLength, avgPeriodLength, nextPeriodDate, daysUntilNext } = cycleStats;

  document.getElementById('stat-cycle-day').textContent   = `Day ${cycleDay}`;
  document.getElementById('stat-phase').textContent       = phase;

  const lastDate = new Date(lastPeriodStart + 'T00:00:00');
  document.getElementById('stat-last-period').textContent  = lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  document.getElementById('stat-last-duration').textContent = `${avgPeriodLength} day period`;

  const nextDate = new Date(nextPeriodDate + 'T00:00:00');
  document.getElementById('stat-next-period').textContent = nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (daysUntilNext > 0) {
    document.getElementById('stat-next-in').textContent = `in ${daysUntilNext} day${daysUntilNext !== 1 ? 's' : ''}`;
  } else if (daysUntilNext === 0) {
    document.getElementById('stat-next-in').textContent = 'today';
  } else {
    document.getElementById('stat-next-in').textContent = `${Math.abs(daysUntilNext)}d late`;
  }

  document.getElementById('stat-avg-cycle').textContent  = `${avgCycleLength}d`;
  document.getElementById('stat-avg-period').textContent = `${avgPeriodLength} day period`;
}

function renderPeriodCalendar() {
  const year  = periodViewMonth.getFullYear();
  const month = periodViewMonth.getMonth();
  const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

  document.getElementById('cal-month-title').textContent = `${MONTHS[month]} ${year}`;

  const today    = todayISO();
  const logMap   = new Map(periodLogs.map(l => [l.date, l]));
  const firstDow = new Date(year, month, 1).getDay();
  const daysInM  = new Date(year, month + 1, 0).getDate();
  const prevLastD = new Date(year, month, 0).getDate();

  const cells = [];

  // Previous-month filler
  for (let i = firstDow - 1; i >= 0; i--) {
    const d    = prevLastD - i;
    const pm   = month === 0 ? 11 : month - 1;
    const py   = month === 0 ? year - 1 : year;
    const iso  = `${py}-${String(pm + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push(buildCalCell(iso, d, true, logMap, today));
  }

  // Current month
  for (let d = 1; d <= daysInM; d++) {
    const iso = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push(buildCalCell(iso, d, false, logMap, today));
  }

  // Next-month filler to complete the last row
  const total = Math.ceil(cells.length / 7) * 7;
  let nd = 1;
  const nm = month === 11 ? 0  : month + 1;
  const ny = month === 11 ? year + 1 : year;
  while (cells.length < total) {
    const iso = `${ny}-${String(nm + 1).padStart(2,'0')}-${String(nd).padStart(2,'0')}`;
    cells.push(buildCalCell(iso, nd, true, logMap, today));
    nd++;
  }

  document.getElementById('cal-grid').innerHTML = cells.join('');
}

function buildCalCell(dateStr, dayNum, isOtherMonth, logMap, today) {
  const log         = logMap.get(dateStr);
  const isPeriodDay = log && log.flow && log.flow !== 'none';
  const isPredicted = !isPeriodDay && cycleStats?.predictedDates?.has(dateStr);
  const isOvulation = !isPeriodDay && !isPredicted && cycleStats?.ovulationDates?.has(dateStr);
  const isToday     = dateStr === today;
  const isSelected  = dateStr === selectedPeriodDate;

  const cls = ['cal-cell'];
  if (isOtherMonth) cls.push('other-month');
  if (isPeriodDay)  { cls.push('period-day'); if (log.flow) cls.push(`flow-${log.flow}`); }
  if (isPredicted)  cls.push('predicted-period');
  if (isToday)      cls.push('today');
  if (isSelected)   cls.push('selected');

  let indicator = '';
  if (isPeriodDay) {
    indicator = `<span class="cal-flow-dot"></span>`;
  } else if (isOvulation) {
    indicator = `<span class="cal-ov-dot"></span>`;
  }

  return `<div class="${cls.join(' ')}" onclick="selectPeriodDate('${dateStr}')">
    <span class="cal-cell-num">${dayNum}</span>${indicator}
  </div>`;
}

function shiftPeriodMonth(delta) {
  periodViewMonth = new Date(periodViewMonth.getFullYear(), periodViewMonth.getMonth() + delta, 1);
  renderPeriodCalendar();
}

function selectPeriodDate(dateStr) {
  selectedPeriodDate = dateStr;

  const log = periodLogs.find(l => l.date === dateStr);
  selectedFlow     = log?.flow || null;
  selectedSymptoms = log?.symptoms ? [...log.symptoms] : [];

  const panel = document.getElementById('period-log-panel');
  panel.classList.add('visible');

  const d = new Date(dateStr + 'T00:00:00');
  document.getElementById('log-panel-date').textContent =
    d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();

  syncFlowPills();
  syncSymptomChips();
  renderPeriodCalendar();
}

function closePeriodLogPanel() {
  selectedPeriodDate = null;
  document.getElementById('period-log-panel').classList.remove('visible');
  renderPeriodCalendar();
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
    selectPeriodDate(selectedPeriodDate); // re-open panel on same date
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

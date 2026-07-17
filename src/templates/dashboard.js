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
// ── Brain Dump Toggle ─────────────────────────────────────────────────────────
function toggleBrainDump(on) {
  localStorage.setItem('brainDump', on ? '1' : '0');
  document.querySelector('.sidebar').classList.toggle('brain-dump-on', on);
  // If a brain-dump tab is currently active and we're hiding them, go back to todo
  if (!on && (currentCategory === 'grocery' || currentCategory === 'travel' || currentCategory === 'tv')) {
    switchCategory('todo');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Restore brain dump toggle state
  const brainOn = localStorage.getItem('brainDump') === '1';
  document.getElementById('brain-dump-toggle').checked = brainOn;
  document.querySelector('.sidebar').classList.toggle('brain-dump-on', brainOn);

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

  const groceryInput = document.getElementById('grocery-input');
  groceryInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addGroceryItem();
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
  const isTodo        = category === 'todo';
  const isPeriod      = category === 'period';
  const isTv          = category === 'tv';
  const isGrocery     = category === 'grocery';
  const isTravel      = category === 'travel';
  const isInvestments = category === 'investments';
  const isRejection   = category === 'rejection';

  document.querySelectorAll('.list-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === category);
  });

  document.getElementById('period-view').style.display      = isPeriod      ? 'flex'  : 'none';
  document.getElementById('tv-view').style.display          = isTv          ? 'flex'  : 'none';
  document.getElementById('grocery-view').style.display     = isGrocery     ? 'flex'  : 'none';
  document.getElementById('travel-view').style.display      = isTravel      ? 'flex'  : 'none';
  document.querySelector('.content').style.display          = isTodo        ? 'flex'  : 'none';
  document.querySelector('.date-strip').style.display       = isTodo        ? 'flex'  : 'none';
  document.getElementById('inv-section').style.display      = isInvestments ? 'flex'  : 'none';
  document.getElementById('rejection-section').style.display = isRejection  ? 'flex'  : 'none';

  // Hide topbar when a full-bleed world (Trading Floor / The No) is active
  document.querySelector('.topbar').style.display = (isInvestments || isRejection) ? 'none' : '';

  const printBtnWrap = document.getElementById('print-btn').parentElement;
  printBtnWrap.style.display = (isTodo || isGrocery) ? 'flex' : 'none';

  // Auto-switch theme to match the active tab
  const themeSelect = document.getElementById('theme-select');
  if (isGrocery) themeSelect.value = 'grocery';
  else if (isTodo) themeSelect.value = 'ops';

  const titleEl   = document.querySelector('.topbar-title');
  const eyebrowEl = document.getElementById('topbar-date');
  if (isPeriod)            titleEl.textContent = 'CYCLE TRACKER';
  else if (isTv)           titleEl.textContent = 'TV GUIDE';
  else if (isGrocery)      titleEl.textContent = 'MARKET RUN';
  else if (isTravel)       titleEl.textContent = 'TRAVEL';
  else                     titleEl.textContent = 'TO-DO LIST';

  // Restore date eyebrow when leaving period tab
  if (!isPeriod) {
    const _d = new Date();
    eyebrowEl.textContent =
      _d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() + ' · ' +
      _d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  }

  if (isPeriod) {
    fetchPeriodLogs();
  } else if (isGrocery) {
    fetchGroceryItems();
  } else if (isTravel) {
    renderTravelView();
  } else if (isInvestments) {
    Investments.init();
  } else if (isRejection) {
    Rejection.init();
  } else {
    fetchSuggestions();
    fetchTodos();
    updateTasksHeader();
  }
}

// ── Grocery List ──────────────────────────────────────────────────────────────
let groceryItems = [];

async function fetchGroceryItems() {
  try {
    const res = await fetch(`/api/todos?category=Grocery&user=${currentUser}`);
    const data = await res.json();
    groceryItems = data.todos || [];
    renderGroceryList();
  } catch (e) {
    console.error('Failed to fetch grocery items', e);
  }
}

function renderGroceryList() {
  const list = document.getElementById('grocery-list');
  const countEl = document.getElementById('grocery-count');
  const clearBtn = document.getElementById('grocery-clear-btn');

  if (groceryItems.length === 0) {
    list.innerHTML = '<div class="grocery-empty">Your list is empty. Add something above.</div>';
    countEl.textContent = '';
    clearBtn.style.display = 'none';
    return;
  }

  const checkedCount = groceryItems.filter(i => i.completed).length;
  countEl.textContent = `${groceryItems.length - checkedCount} remaining · ${checkedCount} checked`;
  clearBtn.style.display = checkedCount > 0 ? '' : 'none';

  list.innerHTML = groceryItems.map(item => `
    <div class="grocery-item${item.completed ? ' done' : ''}" data-id="${item.id}">
      <button class="grocery-check" onclick="toggleGroceryItem(${item.id})" title="${item.completed ? 'Uncheck' : 'Check'}">
        ${item.completed ? '✓' : ''}
      </button>
      <span class="grocery-item-title">${escapeHtml(item.title)}</span>
      <button class="grocery-delete" onclick="deleteGroceryItem(${item.id})" title="Delete">×</button>
    </div>
  `).join('');
}

async function addGroceryItem() {
  const input = document.getElementById('grocery-input');
  const title = input.value.trim();
  if (!title) return;

  try {
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, category: 'Grocery', user: currentUser }),
    });
    const data = await res.json();
    groceryItems.push(data.todo);
    input.value = '';
    renderGroceryList();
    input.focus();
  } catch (e) {
    console.error('Failed to add grocery item', e);
  }
}

async function toggleGroceryItem(id) {
  const item = groceryItems.find(i => i.id === id);
  if (!item) return;
  try {
    await fetch(`/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !item.completed }),
    });
    item.completed = !item.completed;
    renderGroceryList();
  } catch (e) {
    console.error('Failed to toggle grocery item', e);
  }
}

async function deleteGroceryItem(id) {
  try {
    await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    groceryItems = groceryItems.filter(i => i.id !== id);
    renderGroceryList();
  } catch (e) {
    console.error('Failed to delete grocery item', e);
  }
}

async function clearCheckedGrocery() {
  const checked = groceryItems.filter(i => i.completed);
  try {
    await Promise.all(checked.map(i => fetch(`/api/todos/${i.id}`, { method: 'DELETE' })));
    groceryItems = groceryItems.filter(i => !i.completed);
    renderGroceryList();
  } catch (e) {
    console.error('Failed to clear checked grocery items', e);
  }
}

// ── Travel View ───────────────────────────────────────────────────────────────
const TRAVEL_DATA = {
  upcoming: [
    {
      id: 'mediterranean',
      num: 1,
      name: 'Mediterranean',
      note: 'Would probably have to break it up into smaller trips — this looks like a whole summer. Greece could be yacht week. Turkey can be a family trip much later. Jordan is dangerous rn so who knows. Egypt + Spain could be done together with a small flight in the middle.',
      destinations: [
        { name: 'Greece', places: 'Athens · Ios · Crete · Corfu · Mykonos · Santorini' },
        { name: 'Turkey', places: 'Istanbul · Cappadocia' },
        { name: 'Jordan', places: null },
        { name: 'Croatia', places: 'Split · Hvar', aside: 'Bosnia + Herzegovina has very medieval vibe + really good wine country' },
        { name: 'Egypt + Morocco', places: 'Cairo · iron ore train' },
        { name: 'Spain', places: 'Barcelona · Valencia · Seville · Ibiza · Mallorca' },
      ],
    },
    {
      id: 'vietnam-thailand',
      num: 2,
      name: 'Vietnam + Thailand',
      note: null,
      destinations: [
        { name: 'Hanoi', places: 'Train Street' },
        { name: 'Ha Giang Loop', aside: 'Easy Ride Bikers · or Ha Giang Motorventures (more lowk, nicer homestays)' },
        { name: 'Sapa', places: 'rice terraces · small local villages' },
        { name: 'Phong Nha', places: null },
        { name: 'Hong Nha', aside: 'The Duck Stop — be a duck leader for $4' },
        { name: 'Saigon', places: null },
        { name: 'Phu Quoc', places: null, aside: "Rory's Beach Bar · def party scene" },
        { name: 'Thailand', places: 'Bangkok · Chiang Mai · Phuket · Koh Samui', aside: 'Elephant sanctuary · Bamboo island · Damnoen Saduak Market · Maeklong Railway Market · Angkor Wat · zip line through jungle · Wattamwua meditation retreat' },
      ],
    },
    {
      id: 'australia',
      num: 3,
      name: 'Australia',
      note: 'Flight is normally $1500–2000.',
      destinations: [
        { name: 'Melbourne', places: null },
        { name: 'Sydney + Bondi Beach', places: null },
        { name: 'Brisbane', places: null },
        { name: 'Fraser Island', aside: 'camping under stars · 4WD tours' },
        { name: 'Cairns', places: 'Great Barrier Reef scuba diving' },
        { name: 'Uluru', places: 'Outback', aside: 'hostels do 3-day tours' },
      ],
    },
    {
      id: 'south-america',
      num: 4,
      name: 'South America',
      note: 'Can split into ~3 trips: one for adventure, one for hiking, one for party.',
      destinations: [
        { name: 'Guatemala', aside: 'Zephyr Lodge has hammocks · Greengos has very social party atmosphere' },
        { name: 'Antigua', places: 'hobbit village' },
        { name: 'Nicaragua', aside: 'Carro Negro — sand boarding down an active volcano → Bigfoot Hostel' },
        { name: 'Cusco · Sacred Valley · Machu Picchu', places: null },
        { name: 'Bolivia', places: 'Uyuni Salt Flats · Death Road · Sarganarga St, La Paz' },
        { name: 'Colombia', places: 'party scene' },
        { name: 'Cuba', places: 'Havana' },
      ],
    },
    {
      id: 'india',
      num: 5,
      name: 'India',
      note: null,
      destinations: [
        { name: 'Goa', places: null },
        { name: 'Ladakh', places: null },
        { name: 'Agra', places: null },
        { name: 'Mumbai', places: null },
        { name: 'New Delhi', places: null },
        { name: 'Jaipur', places: null },
        { name: 'Lucknow', places: null },
        { name: 'South India', places: null },
        { name: 'Assam', places: null },
        { name: 'Manali + Shimla', places: null },
      ],
    },
  ],
  completed: [
    { id: 'eastern-europe', name: 'Eastern Europe', year: '2023', places: ['Amsterdam', 'Brussels', 'Berlin', 'Prague', 'Budapest', 'Vienna', 'Zagreb', 'Venice', 'Naples', 'Nice', 'Marseille', 'Paris', 'London'] },
    { id: 'italy', name: 'Italy', year: '2024', places: ['Sorrento', 'Rome', 'Florence', 'Venice'] },
    { id: 'gujarat', name: 'Gujarat', year: '2025', places: ['Kutch', 'Manekchowk', 'Old City', 'Rani ki Vav', 'Modhera', 'Mahudi', 'Law Garden', 'Waterfront', 'Gandhinagar', 'Nadiad', 'Mankwa', 'Kheda'] },
    { id: 'iceland-denmark', name: 'Iceland + Denmark', year: '2026', places: ['Copenhagen', 'Reykjavik', 'Blue Lagoon', 'Hvolsvöllur', 'Skógafoss', 'Sólheimajökull', 'Vik', 'Reynisfjara', 'Seljalandsfoss', 'Kerid Crater', 'Fridheimar', 'Geysir', 'Gullfoss', 'Þingvellir', 'Sky Lagoon'] },
  ],
  collect: [
    'Tea kettle — next time in London',
    'Rug from Turkey',
    'Chai cups from a side street tea stall in India',
    'Mt Fuji stamp stick (mountain stalls closed off-season)',
    'Truffles + balsamic glaze from Italy',
  ],
};

function renderTravelView() {
  renderDreamTrips();
  renderStamps();
  renderCollectList();
}

function renderDreamTrips() {
  const container = document.getElementById('dream-trips-list');
  container.innerHTML = TRAVEL_DATA.upcoming.map(trip => {
    const num = String(trip.num).padStart(2, '0');
    const noteCol = trip.note
      ? `<div class="t-note-col"><div class="t-note-text">${escapeHtml(trip.note)}</div></div>`
      : '';
    const destList = trip.destinations.map(d => `
      <div class="t-dest-item">
        <div class="t-dest-name">${escapeHtml(d.name)}</div>
        ${d.places ? `<div class="t-dest-places">${escapeHtml(d.places)}</div>` : ''}
        ${d.aside ? `<div class="t-dest-aside">${escapeHtml(d.aside)}</div>` : ''}
      </div>
    `).join('');
    return `
      <div class="t-board-row" id="trow-${trip.id}" onclick="toggleDreamTrip('${trip.id}')">
        <span class="t-row-num">${num}</span>
        <span class="t-row-name">${escapeHtml(trip.name)}</span>
        <span class="t-row-status">Dreaming</span>
        <span class="t-row-stops">${trip.destinations.length} stops</span>
        <span class="t-row-arrow">›</span>
      </div>
      <div class="t-detail" id="tdetail-${trip.id}">
        <div class="t-detail-inner">
          <div class="t-dest-list">${destList}</div>
          ${noteCol}
        </div>
      </div>
    `;
  }).join('');
}

function toggleDreamTrip(id) {
  const row = document.getElementById(`trow-${id}`);
  const detail = document.getElementById(`tdetail-${id}`);
  const isOpen = row.classList.contains('open');
  // Close all others first
  TRAVEL_DATA.upcoming.forEach(t => {
    if (t.id !== id) {
      document.getElementById(`trow-${t.id}`)?.classList.remove('open');
      const d = document.getElementById(`tdetail-${t.id}`);
      if (d) d.style.maxHeight = '0';
    }
  });
  if (isOpen) {
    row.classList.remove('open');
    detail.style.maxHeight = '0';
  } else {
    row.classList.add('open');
    detail.style.maxHeight = detail.scrollHeight + 'px';
    detail.addEventListener('transitionend', () => {
      if (row.classList.contains('open')) detail.style.maxHeight = 'none';
    }, { once: true });
  }
}

function renderStamps() {
  const container = document.getElementById('stamps-row');
  const rotations = [-4, 3, -2, 5];
  container.innerHTML = TRAVEL_DATA.completed.map((trip, i) => `
    <div class="t-stamp-wrap">
      <div class="t-stamp" id="tstamp-${trip.id}" onclick="toggleStamp('${trip.id}')" style="transform:rotate(${rotations[i] || 0}deg)">
        <span class="t-stamp-name">${escapeHtml(trip.name)}</span>
        <span class="t-stamp-year">${trip.year}</span>
      </div>
      <div class="t-stamp-detail" id="tsdetal-${trip.id}">
        <div class="t-stamp-detail-inner">
          ${trip.places.map(p => `<span class="t-stamp-place">${escapeHtml(p)}</span>`).join('<span class="t-stamp-place">·</span>')}
        </div>
      </div>
    </div>
  `).join('');
}

function toggleStamp(id) {
  const stamp = document.getElementById(`tstamp-${id}`);
  const detail = document.getElementById(`tsdetal-${id}`);
  const isOpen = stamp.classList.contains('open');
  if (isOpen) {
    stamp.classList.remove('open');
    detail.style.maxHeight = '0';
  } else {
    stamp.classList.add('open');
    detail.style.maxHeight = detail.scrollHeight + 'px';
  }
}

function renderCollectList() {
  const got = JSON.parse(localStorage.getItem('travel-collect') || '[]');
  const container = document.getElementById('collect-list');
  container.innerHTML = TRAVEL_DATA.collect.map((item, i) => `
    <div class="t-collect-item${got.includes(i) ? ' got' : ''}" onclick="toggleCollect(${i})">
      <div class="t-collect-check">${got.includes(i) ? '✓' : ''}</div>
      <span class="t-collect-text">${escapeHtml(item)}</span>
    </div>
  `).join('');
}

function toggleCollect(idx) {
  const got = JSON.parse(localStorage.getItem('travel-collect') || '[]');
  const i = got.indexOf(idx);
  if (i === -1) got.push(idx);
  else got.splice(i, 1);
  localStorage.setItem('travel-collect', JSON.stringify(got));
  renderCollectList();
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
    const theme = document.getElementById('theme-select')?.value ?? 'ops';
    const isGrocery = currentCategory === 'grocery';
    const payload = {
      user: currentUser,
      theme,
      ...(isGrocery ? { category: 'Grocery' } : { date: selectedDate }),
    };
    const response = await fetch('/api/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

// ── Wishlist / Cork Board ─────────────────────────────────────────────────────

// Deterministic per-item random (sin hash) — same item always lands in same spot
function itemRand(id, offset) {
  const x = Math.sin(id * 127.1 + offset * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
// ══════════════════════════════════════════════════════════════════════════════
// THE FLOOR — Investment Tracker
// ══════════════════════════════════════════════════════════════════════════════

// ── The No · Rejection Therapy ──────────────────────────────────────────────
const Rejection = {
  GOAL: 300,
  challenges: [],
  editingId: null,
  listenersAttached: false,

  async init() {
    if (!this.listenersAttached) {
      this.attachListeners();
      this.listenersAttached = true;
    }
    await this.load();
  },

  attachListeners() {
    const input = document.getElementById('rej-input');
    if (input) {
      input.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.add(); });
    }
  },

  async load() {
    try {
      const data = await fetch('/api/rejections').then(r => r.json());
      this.challenges = data.challenges || [];
      this.render();
    } catch (e) {
      console.error('Failed to load rejection challenges', e);
    }
  },

  render() {
    const total = this.challenges.length;
    const done  = this.challenges.filter(c => c.done).length;
    const nos   = this.challenges.filter(c => c.outcome === 'no').length;
    const yeses = this.challenges.filter(c => c.outcome === 'yes').length;
    const pct   = Math.min(100, Math.round((done / this.GOAL) * 100));

    document.getElementById('rej-hero-num').textContent   = done;
    document.getElementById('rej-progress-label').textContent = `${done} of ${this.GOAL} asks done`;
    document.getElementById('rej-progress-pct').textContent   = pct + '%';
    document.getElementById('rej-progress-fill').style.width  = pct + '%';
    document.getElementById('rej-stat-total').textContent = total;
    document.getElementById('rej-stat-done').textContent  = done;
    document.getElementById('rej-stat-no').textContent    = nos;
    document.getElementById('rej-stat-yes').textContent   = yeses;

    this.renderList();
  },

  renderList() {
    const listEl = document.getElementById('rej-list');
    // One list, everything in creation order — crossed-off asks stay in place.
    const items = this.challenges.map((c, i) => ({ ...c, _n: i + 1 }));
    if (!items.length) {
      listEl.innerHTML = `<div class="rej-empty">The list is empty. File your first ask below.</div>`;
      return;
    }
    listEl.innerHTML = items.map(c => this.slipHtml(c)).join('');
  },

  slipHtml(c) {
    const id = c.id;
    const num = String(c._n).padStart(3, '0');

    if (this.editingId === id) {
      return `
        <div class="rej-slip" data-id="${id}">
          <div class="rej-slip-body">
            <input class="rej-slip-editing" id="rej-edit-${id}" value="${escapeHtml(c.title)}" maxlength="240" />
          </div>
        </div>`;
    }

    // Transient "did they say yes or no?" — appears only right after crossing off,
    // and disappears the moment an answer is recorded.
    const ask = (c.done && !c.outcome) ? `
      <div class="rej-ask">
        <span class="rej-ask-q">did they say…</span>
        <button class="rej-ask-btn no"  onclick="Rejection.setOutcome(${id},'no')">No</button>
        <button class="rej-ask-btn yes" onclick="Rejection.setOutcome(${id},'yes')">Yes</button>
      </div>` : '';

    // Hover-only reveal of the recorded outcome (kept off the resting view for a clean list).
    const badge = (c.done && c.outcome)
      ? `<span class="rej-badge ${c.outcome}">${c.outcome === 'no' ? 'No' : 'Yes'}</span>`
      : '';

    return `
      <div class="rej-slip ${c.done ? 'done' : ''}" data-id="${id}">
        <button class="rej-check" onclick="Rejection.toggle(${id})" title="${c.done ? 'Un-cross this' : 'I did it — cross it off'}">${c.done ? '✓' : ''}</button>
        <div class="rej-slip-body">
          <div class="rej-slip-index">No. ${num}</div>
          <div class="rej-slip-title" ondblclick="Rejection.edit(${id})">${escapeHtml(c.title)}</div>
          ${ask}
        </div>
        <div class="rej-slip-actions">
          ${badge}
          <button class="rej-icon-btn" onclick="Rejection.edit(${id})" title="Edit">✎</button>
          <button class="rej-icon-btn" onclick="Rejection.remove(${id})" title="Delete">✕</button>
        </div>
      </div>`;
  },

  async add() {
    const input = document.getElementById('rej-input');
    const title = (input.value || '').trim();
    if (!title) return;
    input.value = '';
    try {
      const data = await fetch('/api/rejections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }).then(r => r.json());
      if (data.challenge) {
        this.challenges.push(data.challenge);
        this.render();
      }
    } catch (e) {
      console.error('Failed to add ask', e);
      input.value = title;
    }
  },

  async toggle(id) {
    const c = this.challenges.find(x => x.id === id);
    if (!c) return;
    const newDone = !c.done;
    try {
      const data = await fetch(`/api/rejections/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: newDone }),
      }).then(r => r.json());
      if (data.challenge) {
        Object.assign(c, data.challenge);
        this.render();
      }
    } catch (e) { console.error('Failed to toggle', e); }
  },

  async setOutcome(id, outcome) {
    const c = this.challenges.find(x => x.id === id);
    if (!c) return;
    const next = c.outcome === outcome ? null : outcome; // toggle off if same
    try {
      const data = await fetch(`/api/rejections/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: next }),
      }).then(r => r.json());
      if (data.challenge) {
        Object.assign(c, data.challenge);
        this.render();
      }
    } catch (e) { console.error('Failed to set outcome', e); }
  },

  edit(id) {
    this.editingId = id;
    this.renderList();
    const el = document.getElementById(`rej-edit-${id}`);
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      const save = () => this.saveEdit(id, el.value);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { this.editingId = null; this.renderList(); }
      });
      el.addEventListener('blur', save);
    }
  },

  async saveEdit(id, value) {
    if (this.editingId !== id) return; // already handled
    const title = (value || '').trim();
    this.editingId = null;
    const c = this.challenges.find(x => x.id === id);
    if (!title || !c || title === c.title) { this.render(); return; }
    try {
      const data = await fetch(`/api/rejections/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }).then(r => r.json());
      if (data.challenge) Object.assign(c, data.challenge);
    } catch (e) { console.error('Failed to save edit', e); }
    this.render();
  },

  async remove(id) {
    if (!confirm('Delete this ask?')) return;
    try {
      await fetch(`/api/rejections/${id}`, { method: 'DELETE' });
      this.challenges = this.challenges.filter(x => x.id !== id);
      this.render();
    } catch (e) { console.error('Failed to delete', e); }
  },

  surpriseMe() {
    const open = this.challenges.filter(c => !c.done);
    const callout = document.getElementById('rej-callout');
    if (!open.length) {
      callout.style.display = 'flex';
      document.getElementById('rej-callout-text').textContent = "You've done everything on the list. Add a new one!";
      return;
    }
    const pick = open[Math.floor(Math.random() * open.length)];
    callout.style.display = 'flex';
    document.getElementById('rej-callout-text').textContent = pick.title;
    callout.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },
};

const Investments = {
  currentAccount: 'all',
  currentFilter: 'unannotated',
  currentInnerTab: 'trades',
  transactions: [],
  patterns: null,
  charts: {},
  cachedAnalysis: null,
  listenersAttached: false,

  async init() {
    if (!this.listenersAttached) {
      this.attachListeners();
      this.listenersAttached = true;
    }
    await Promise.all([this.loadPatterns(), this.loadTransactions(), this.loadCachedAnalysis()]);
  },

  async loadCachedAnalysis() {
    try {
      const data = await fetch('/api/investments/analyze').then(r => r.json());
      if (data.analysis) {
        this.cachedAnalysis = data;
        if (this.currentInnerTab === 'analysis') this.renderAnalysis(data);
      }
    } catch (e) { console.error('Failed to load cached analysis', e); }
  },

  showAnalysisState(state) {
    document.getElementById('inv-analysis-placeholder').style.display = state === 'placeholder' ? 'flex' : 'none';
    document.getElementById('inv-analysis-loading').style.display     = state === 'loading'     ? 'block' : 'none';
    document.getElementById('inv-analysis-results').style.display    = state === 'results'     ? 'block' : 'none';
  },

  async runAnalysis() {
    this.showAnalysisState('loading');
    try {
      const data = await fetch('/api/investments/analyze', { method: 'POST' }).then(r => r.json());
      if (data.error) throw new Error(data.error);
      this.cachedAnalysis = data;
      this.renderAnalysis(data);
    } catch (e) {
      console.error('Analysis failed', e);
      this.showAnalysisState('placeholder');
      alert('Analysis failed: ' + (e.message || 'Unknown error. Check that ANTHROPIC_API_KEY is set.'));
    }
  },

  renderAnalysis(data) {
    const { analysis, cached_at } = data;
    document.getElementById('inv-archetype-name').textContent  = analysis.archetype || '—';
    document.getElementById('inv-archetype-tagline').textContent = analysis.tagline || '';
    document.getElementById('inv-exit-style').textContent = analysis.exit_style || '';

    // Structural metric strip
    const metricsEl = document.getElementById('inv-metrics-strip');
    if (metricsEl) {
      const metrics = analysis.metrics || [];
      metricsEl.innerHTML = metrics.map(m => `
        <div class="inv-metric inv-metric-${m.tone || 'neutral'}">
          <div class="inv-metric-value">${invEscape(m.value)}</div>
          <div class="inv-metric-label">${invEscape(m.label)}</div>
          <div class="inv-metric-sub">${invEscape(m.sub || '')}</div>
        </div>
      `).join('');
      metricsEl.style.display = metrics.length ? 'grid' : 'none';
    }

    const patternList = document.getElementById('inv-pattern-list');
    patternList.innerHTML = (analysis.patterns || []).map(p => `
      <div class="inv-pattern-item">
        <div class="inv-pattern-name">${invEscape(p.name)}</div>
        <div class="inv-pattern-desc">${invEscape(p.description)}</div>
        ${p.evidence?.length ? `<div class="inv-pattern-evidence">${p.evidence.map(e => `<span class="inv-evidence-tag">${invEscape(e)}</span>`).join('')}</div>` : ''}
      </div>
    `).join('');

    document.getElementById('inv-buy-triggers').innerHTML = (analysis.buy_triggers || []).map(t =>
      `<div class="inv-tag-item"><div class="inv-tag-bullet"></div><span>${invEscape(t)}</span></div>`
    ).join('');

    document.getElementById('inv-blind-spots').innerHTML = (analysis.blind_spots || []).map(b =>
      `<div class="inv-tag-item"><div class="inv-tag-bullet"></div><span>${invEscape(b)}</span></div>`
    ).join('');

    // Emerging themes — vocabulary in your reasons that no trait captures yet
    const emergeCard = document.getElementById('inv-emerging-card');
    const emergeList = document.getElementById('inv-emerging-list');
    if (emergeCard && emergeList) {
      const themes = analysis.emerging_themes || [];
      if (themes.length) {
        emergeList.innerHTML = themes.map(t => `
          <div class="inv-emerging-item">
            <div class="inv-emerging-term">
              <span class="inv-emerging-word">${invEscape(t.term)}</span>
              <span class="inv-emerging-count">${t.count}×</span>
            </div>
            <div class="inv-emerging-examples">${(t.examples || []).map(e => invEscape(e)).join(' · ')}</div>
            <button class="inv-emerging-add" data-term="${invEscape(t.term)}">+ Track as trait</button>
          </div>
        `).join('');
        emergeList.querySelectorAll('.inv-emerging-add').forEach(btn => {
          btn.addEventListener('click', () => Investments.trackEmergingTrait(btn.dataset.term));
        });
        emergeCard.style.display = 'block';
      } else {
        emergeCard.style.display = 'none';
      }
    }

    const meta = document.getElementById('inv-results-meta');
    if (cached_at) {
      const d = new Date(cached_at);
      const engine = analysis.engine === 'ai' ? 'Claude' : 'on-device engine';
      const basis = analysis.annotated_count > 0
        ? `${analysis.trade_count || '?'} trades · ${analysis.annotated_count} annotated`
        : `${analysis.trade_count || '?'} trades (structural read — add reasons to deepen it)`;
      meta.textContent = `${basis} · decoded by ${engine} ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    this.showAnalysisState('results');
  },

  async trackEmergingTrait(term) {
    if (!term) return;
    const label = term.charAt(0).toUpperCase() + term.slice(1);
    await fetch('/api/investments/traits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: term, label, keywords: [term], side: 'any', kind: 'thesis' }),
    });
    // Re-run so the new trait participates immediately
    this.showAnalysisState('loading');
    this.runAnalysis();
  },

  async loadPatterns() {
    try {
      const data = await fetch('/api/investments/patterns').then(r => r.json());
      this.patterns = data;
      this.renderStats();
      if (this.currentInnerTab === 'patterns') this.renderCharts();
    } catch (e) { console.error('Failed to load investment patterns', e); }
  },

  async loadTransactions() {
    try {
      const params = new URLSearchParams();
      if (this.currentAccount !== 'all') params.set('account', this.currentAccount);
      const data = await fetch(`/api/investments?${params}`).then(r => r.json());
      this.transactions = data.transactions || [];
      this.renderTable();
    } catch (e) { console.error('Failed to load investments', e); }
  },

  renderStats() {
    if (!this.patterns) return;
    const { totalStats: s, annotationProgress: a } = this.patterns;
    const totalEl    = document.getElementById('inv-total');
    const buysEl     = document.getElementById('inv-buys');
    const sellsEl    = document.getElementById('inv-sells');
    const decodedEl  = document.getElementById('inv-decoded');
    const fillEl     = document.getElementById('inv-progress-fill');
    const textEl     = document.getElementById('inv-progress-text');
    if (totalEl)   totalEl.textContent   = s.total;
    if (buysEl)    buysEl.textContent    = s.buys;
    if (sellsEl)   sellsEl.textContent   = s.sells;
    const pct = a.total > 0 ? Math.round((a.annotated / a.total) * 100) : 0;
    if (decodedEl) decodedEl.textContent = pct + '%';
    if (fillEl)    fillEl.style.width    = pct + '%';
    if (textEl)    textEl.textContent    = (a.annotated ?? 0) + ' / ' + (a.total ?? 0) + ' decoded';

    // Sync analysis panel progress
    const pfill      = document.getElementById('inv-analysis-pfill');
    const ptext      = document.getElementById('inv-analysis-ptext');
    const analyzeBtn = document.getElementById('inv-analyze-btn');
    const analyzeHint = document.getElementById('inv-analyze-hint');
    if (pfill)  pfill.style.width  = pct + '%';
    if (ptext)  ptext.textContent  = (a.annotated ?? 0) + ' / ' + (a.total ?? 0) + ' decoded';
    // Structural analysis only needs enough trades — annotations deepen it but
    // aren't required to unlock it.
    const unlocked = (s.total ?? 0) >= 12;
    if (analyzeBtn)  analyzeBtn.disabled = !unlocked;
    if (analyzeHint) analyzeHint.textContent = !unlocked
      ? `Import ${Math.max(0, 12 - (s.total ?? 0))} more trades to unlock`
      : a.annotated > 0
        ? `Ready — reading ${s.total} trades, ${a.annotated} with your notes`
        : `Ready — ${s.total} trades. Add reasons in the Trades tab to go deeper`;
  },

  switchInnerTab(tab) {
    this.currentInnerTab = tab;
    document.querySelectorAll('.inv-inner-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.invTab === tab);
    });
    document.getElementById('inv-trades-panel').style.display   = tab === 'trades'   ? 'block' : 'none';
    document.getElementById('inv-patterns-panel').style.display = tab === 'patterns' ? 'block' : 'none';
    document.getElementById('inv-analysis-panel').style.display = tab === 'analysis' ? 'block' : 'none';
    if (tab === 'patterns' && this.patterns) this.renderCharts();
    if (tab === 'analysis') {
      if (this.cachedAnalysis) this.renderAnalysis(this.cachedAnalysis);
      else this.showAnalysisState('placeholder');
    }
  },

  renderCharts() {
    if (!this.patterns || typeof Chart === 'undefined') return;
    this.renderMonthlyChart();
    this.renderTickerChart();
  },

  renderMonthlyChart() {
    const ctx = document.getElementById('inv-monthly-chart');
    if (!ctx) return;
    if (this.charts.monthly) { this.charts.monthly.destroy(); this.charts.monthly = null; }
    const { monthlyActivity: data } = this.patterns;
    if (!data || !data.length) return;

    this.charts.monthly = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: data.map(m => {
          const [y, mo] = m.month.split('-');
          return new Date(+y, +mo - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        }),
        datasets: [
          { label: 'Buys',  data: data.map(m => m.buys),  backgroundColor: '#FF5C35', borderRadius: 3 },
          { label: 'Sells', data: data.map(m => m.sells), backgroundColor: '#F5C842', borderRadius: 3 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#141410', font: { family: 'DM Mono, monospace', size: 10 }, boxWidth: 10 } },
          tooltip: {
            backgroundColor: '#141410', titleColor: '#F5C842', bodyColor: '#F9F5EE',
            titleFont: { family: 'Syne, sans-serif', size: 13 },
            bodyFont: { family: 'DM Mono, monospace', size: 11 },
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#9A8F7E', font: { family: 'DM Mono, monospace', size: 9 }, maxRotation: 45 }, border: { color: '#E0D8C8' } },
          y: { beginAtZero: true, grid: { color: 'rgba(20,20,16,0.055)' }, ticks: { color: '#9A8F7E', font: { family: 'DM Mono, monospace', size: 9 }, stepSize: 1 }, border: { color: '#E0D8C8' } }
        }
      }
    });
  },

  renderTickerChart() {
    const ctx = document.getElementById('inv-ticker-chart');
    if (!ctx) return;
    if (this.charts.ticker) { this.charts.ticker.destroy(); this.charts.ticker = null; }
    const { tickerFrequency: data } = this.patterns;
    if (!data || !data.length) return;
    const top = data.slice(0, 12);

    this.charts.ticker = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: top.map(t => t.symbol),
        datasets: [
          { label: 'Buys',  data: top.map(t => t.buys),  backgroundColor: '#FF5C35', borderRadius: 2 },
          { label: 'Sells', data: top.map(t => t.sells), backgroundColor: '#F5C842', borderRadius: 2 },
        ]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#141410', font: { family: 'DM Mono, monospace', size: 10 }, boxWidth: 10 } },
          tooltip: {
            backgroundColor: '#141410', titleColor: '#F5C842', bodyColor: '#F9F5EE',
            titleFont: { family: 'Syne, sans-serif', size: 13 },
            bodyFont: { family: 'DM Mono, monospace', size: 11 },
          }
        },
        scales: {
          x: { stacked: true, grid: { color: 'rgba(20,20,16,0.055)' }, ticks: { color: '#9A8F7E', font: { family: 'DM Mono, monospace', size: 9 }, stepSize: 1 }, border: { color: '#E0D8C8' } },
          y: { stacked: true, grid: { display: false }, ticks: { color: '#141410', font: { family: 'DM Mono, monospace', weight: '500', size: 10 } }, border: { color: '#E0D8C8' } }
        }
      }
    });
  },

  renderTable() {
    const tbody = document.getElementById('inv-tbody');
    if (!tbody) return;

    let rows = [...this.transactions];
    if (this.currentFilter === 'unannotated') rows = rows.filter(t => !t.reason);
    else if (this.currentFilter === 'annotated') rows = rows.filter(t => !!t.reason);

    const q = (document.getElementById('inv-search')?.value || '').toLowerCase();
    if (q) rows = rows.filter(t =>
      t.symbol.toLowerCase().includes(q) ||
      (t.reason || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    );

    if (!rows.length) {
      const total = this.transactions.length;
      const msg = total === 0
        ? 'No trades yet. Import a Fidelity CSV to get started.'
        : this.currentFilter === 'unannotated'
          ? 'All trades decoded. Switch to "All" to see everything.'
          : 'No trades match this filter.';
      tbody.innerHTML = `<tr><td colspan="9" class="inv-empty-row">${msg}</td></tr>`;
      return;
    }

    let lastYear = null;
    tbody.innerHTML = rows.map(t => {
      const year    = t.run_date.slice(-4);
      const yearRow = year !== lastYear
        ? `<tr class="inv-year-divider"><td colspan="9">${year}</td></tr>`
        : '';
      lastYear = year;

      const amt      = t.amount   ? '$' + Math.abs(t.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
      const price    = t.price    ? '$' + parseFloat(t.price).toFixed(2) : '—';
      const qty      = t.quantity ? (+t.quantity).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—';
      const badgeCls = 'inv-action-' + t.action_type.toLowerCase();
      const acct     = t.account === 'Joint WROS' ? 'JOINT' : 'ROTH';
      return yearRow + `
        <tr class="inv-row" data-id="${t.id}">
          <td class="inv-cell-date">${invFmtDate(t.run_date)}</td>
          <td class="inv-cell-acct">${acct}</td>
          <td><span class="inv-action-badge ${badgeCls}">${invActionLabel(t)}</span></td>
          <td class="inv-cell-ticker">${t.symbol}</td>
          <td class="inv-cell-num">${qty}</td>
          <td class="inv-cell-num">${price}</td>
          <td class="inv-cell-num inv-cell-amount">${amt}</td>
          <td class="inv-cell-reason" data-id="${t.id}" data-field="reason">
            ${t.reason
              ? `<span class="inv-annotation-text">${invEscape(t.reason)}</span>`
              : `<span class="inv-annotation-placeholder">+ add reason</span>`}
          </td>
          <td class="inv-cell-goal" data-id="${t.id}" data-field="future_goal">
            ${t.future_goal
              ? `<span class="inv-annotation-text">${invEscape(t.future_goal)}</span>`
              : `<span class="inv-annotation-placeholder">+ add goal</span>`}
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.inv-cell-reason, .inv-cell-goal').forEach(cell => {
      cell.addEventListener('click', () => Investments.openEdit(cell));
    });
  },

  openEdit(cell) {
    const id    = cell.dataset.id;
    const field = cell.dataset.field;
    const cur   = cell.querySelector('.inv-annotation-text')?.textContent?.trim() || '';
    const ph    = field === 'reason' ? 'Why did you make this trade?' : "What's your goal for this position?";
    cell.innerHTML = `
      <div class="inv-edit-wrap">
        <textarea class="inv-edit-textarea" rows="2" placeholder="${ph}">${invEscape(cur)}</textarea>
        <div class="inv-edit-actions">
          <button class="inv-edit-save">Save</button>
          <button class="inv-edit-cancel">Cancel</button>
        </div>
      </div>`;
    const ta = cell.querySelector('.inv-edit-textarea');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    cell.querySelector('.inv-edit-save').addEventListener('click', async () => {
      const val = ta.value.trim();
      await fetch(`/api/investments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: val || null }),
      });
      // Switch to "all" so the just-annotated row stays visible
      if (val && Investments.currentFilter === 'unannotated') {
        Investments.currentFilter = 'all';
        document.querySelectorAll('.inv-filter-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.filter === 'all');
        });
      }
      await Investments.loadPatterns();
      await Investments.loadTransactions();
    });
    cell.querySelector('.inv-edit-cancel').addEventListener('click', () => Investments.renderTable());
    ta.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); Investments.renderTable(); }
    });
  },

  attachListeners() {
    // Inner tabs (Trades / Patterns / Analysis)
    document.querySelectorAll('.inv-inner-tab').forEach(btn => {
      btn.addEventListener('click', () => Investments.switchInnerTab(btn.dataset.invTab));
    });

    // Analyze button
    document.getElementById('inv-analyze-btn')?.addEventListener('click', () => Investments.runAnalysis());

    // Re-run button (clears cache and re-runs)
    document.getElementById('inv-rerun-btn')?.addEventListener('click', async () => {
      await fetch('/api/investments/analyze/clear', { method: 'DELETE' });
      Investments.cachedAnalysis = null;
      Investments.showAnalysisState('placeholder');
      Investments.runAnalysis();
    });

    // Account tabs — also switch to Trades view so table is immediately visible
    document.querySelectorAll('.inv-acct-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.inv-acct-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Investments.currentAccount = btn.dataset.acct;
        Investments.switchInnerTab('trades');
        Investments.loadTransactions();
      });
    });

    // Filter buttons
    document.querySelectorAll('.inv-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.inv-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Investments.currentFilter = btn.dataset.filter;
        Investments.renderTable();
      });
    });

    // Search
    document.getElementById('inv-search')?.addEventListener('input', () => Investments.renderTable());

    // Import modal open/close
    document.getElementById('inv-import-open')?.addEventListener('click', () => {
      document.getElementById('inv-modal').style.display = 'flex';
    });
    document.getElementById('inv-modal-close')?.addEventListener('click', () => invCloseModal());
    document.getElementById('inv-modal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('inv-modal')) invCloseModal();
    });

    // Drop zone
    const dropZone  = document.getElementById('inv-drop-zone');
    const fileInput = document.getElementById('inv-file-input');
    dropZone?.addEventListener('click', () => fileInput.click());
    dropZone?.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone?.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) Investments.handleFile(e.dataTransfer.files[0]);
    });
    fileInput?.addEventListener('change', e => {
      if (e.target.files[0]) Investments.handleFile(e.target.files[0]);
    });

    document.getElementById('inv-confirm-import')?.addEventListener('click', () => Investments.confirmImport());
    document.getElementById('inv-cancel-import')?.addEventListener('click',  () => invResetModal());

    document.getElementById('inv-clear-all')?.addEventListener('click', async () => {
      if (!confirm('Delete all trades? This cannot be undone.')) return;
      await fetch('/api/investments/clear', { method: 'DELETE' });
      invCloseModal();
      await Investments.loadPatterns();
      await Investments.loadTransactions();
    });
  },

  pendingTransactions: [],

  handleFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const txns = invParseCSV(e.target.result);
      this.pendingTransactions = txns;
      this.showPreview(txns);
    };
    reader.readAsText(file);
  },

  showPreview(txns) {
    document.getElementById('inv-drop-zone').style.display = 'none';
    const preview = document.getElementById('inv-preview');
    preview.style.display = 'block';

    const buys  = txns.filter(t => t.action_type === 'BUY' || t.action_type === 'OPTIONS_BUY').length;
    const sells = txns.length - buys;
    document.getElementById('inv-preview-stats').innerHTML =
      `<span class="inv-preview-count">${txns.length} transactions found</span>` +
      `<span class="inv-preview-detail">${buys} buys · ${sells} sells/expireds</span>`;

    const slice = txns.slice(0, 6);
    document.getElementById('inv-preview-table').innerHTML = `
      <thead><tr><th>Date</th><th>Account</th><th>Action</th><th>Ticker</th><th>Amount</th></tr></thead>
      <tbody>
        ${slice.map(t => `<tr>
          <td>${t.run_date}</td><td>${t.account}</td>
          <td><span class="inv-action-badge inv-action-${t.action_type.toLowerCase()}">${t.action_type}</span></td>
          <td>${t.symbol}</td>
          <td>${t.amount ? '$' + Math.abs(t.amount).toFixed(2) : '—'}</td>
        </tr>`).join('')}
        ${txns.length > 6 ? `<tr><td colspan="5" class="inv-preview-more">… and ${txns.length - 6} more</td></tr>` : ''}
      </tbody>`;
  },

  async confirmImport() {
    const btn = document.getElementById('inv-confirm-import');
    btn.textContent = 'Importing…';
    btn.disabled = true;
    try {
      const res  = await fetch('/api/investments/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: this.pendingTransactions }),
      });
      const data = await res.json();
      const details = [
        data.duplicates > 0 ? `${data.duplicates} duplicates skipped` : '',
        data.consolidated > 0 ? `${data.consolidated} split trades merged` : '',
      ].filter(Boolean).join(' · ');
      document.getElementById('inv-preview-stats').innerHTML =
        `<span class="inv-preview-count inv-import-success">✓ ${data.imported} new transactions imported</span>` +
        (details ? `<span class="inv-preview-detail">${details}</span>` : '');
      document.getElementById('inv-confirm-import').style.display = 'none';
      await this.loadPatterns();
      await this.loadTransactions();
      setTimeout(() => invCloseModal(), 2200);
    } catch (err) {
      btn.textContent = 'Import Transactions';
      btn.disabled = false;
    }
  }
};

function invCloseModal() {
  document.getElementById('inv-modal').style.display = 'none';
  invResetModal();
}

function invResetModal() {
  document.getElementById('inv-preview').style.display    = 'none';
  document.getElementById('inv-drop-zone').style.display  = 'flex';
  document.getElementById('inv-confirm-import').style.display = '';
  document.getElementById('inv-confirm-import').disabled  = false;
  document.getElementById('inv-confirm-import').textContent = 'Import Transactions';
  document.getElementById('inv-file-input').value         = '';
}

function invParseCSV(text) {
  const lines = text.split('\n');
  const headerIdx = lines.findIndex(l => l.startsWith('Run Date,'));
  if (headerIdx === -1) return [];
  const results = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = invParseCSVLine(line);
    if (cols.length < 13) continue;
    const [runDate, account, accountNum, action, symbol, description, , price, quantity, , , , amount] = cols;
    const actionUp = action.toUpperCase();
    if (!actionUp.includes('YOU BOUGHT') && !actionUp.includes('YOU SOLD') && !actionUp.includes('EXPIRED')) continue;
    const isOpt = actionUp.includes('OPENING TRANSACTION') || actionUp.includes('CLOSING TRANSACTION') ||
                  (actionUp.includes('EXPIRED') && (actionUp.includes('CALL') || actionUp.includes('PUT')));
    let actionType, optType = null, optAction = null;
    if (actionUp.includes('EXPIRED')) {
      actionType = 'EXPIRED';
      optType    = actionUp.includes('CALL') ? 'CALL' : actionUp.includes('PUT') ? 'PUT' : null;
      optAction  = 'EXPIRED';
    } else if (actionUp.includes('YOU BOUGHT')) {
      if (isOpt) { actionType = 'OPTIONS_BUY';  optType = actionUp.includes('CALL') ? 'CALL' : 'PUT'; optAction = 'OPENING'; }
      else         actionType = 'BUY';
    } else {
      if (isOpt) { actionType = 'OPTIONS_SELL'; optType = actionUp.includes('CALL') ? 'CALL' : 'PUT'; optAction = 'CLOSING'; }
      else         actionType = 'SELL';
    }
    const priceN  = price    ? parseFloat(price)    || null : null;
    const qtyN    = quantity ? parseFloat(quantity) || null : null;
    const amountN = amount   ? parseFloat(amount)   || null : null;
    const fKey    = `${runDate}|${accountNum}|${symbol}|${price}|${quantity}|${amount}`;
    results.push({
      account: account.trim(), run_date: runDate.trim(), action_type: actionType,
      symbol: symbol.trim(), description: description.trim(),
      price: priceN, quantity: qtyN, amount: amountN,
      is_option: isOpt, option_type: optType, option_action: optAction,
      raw_action: action.trim(), fidelity_key: fKey,
    });
  }
  return results;
}

function invParseCSVLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function invFmtDate(s) {
  if (!s) return '—';
  const [m, d, y] = s.split('/');
  if (!m) return s;
  return new Date(+y, +m - 1, +d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function invActionLabel(t) {
  if (t.action_type === 'BUY')          return 'BUY';
  if (t.action_type === 'SELL')         return 'SELL';
  if (t.action_type === 'OPTIONS_BUY')  return (t.option_type || '') + ' BUY';
  if (t.action_type === 'OPTIONS_SELL') return (t.option_type || '') + ' SELL';
  if (t.action_type === 'EXPIRED')      return (t.option_type || '') + ' EXP';
  return t.action_type;
}

function invEscape(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

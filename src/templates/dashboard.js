// ── State ────────────────────────────────────────────────────────────────────
let todos = [];
let editingId = null;
let currentCategory = 'todo';
let selectedDate = todayISO();
let suggestions = [];
let currentUser = localStorage.getItem('currentUser') || 'ashni';

// Wishlist state
let wishlistType = 'make';
let wishlistItems = [];
let wishlistDragState = null;
let wishlistMaxZ = 10;
let modalEditingId = null;
let modalImageFilename = null;
let modalImageDataUrl = null;

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
  if (!on && (currentCategory === 'grocery' || currentCategory === 'travel' || currentCategory === 'tv' || currentCategory === 'make' || currentCategory === 'buy')) {
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

  initWishlistDropzone();
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
  const isTodo     = category === 'todo';
  const isCars     = category === 'cars';
  const isPeriod   = category === 'period';
  const isTv       = category === 'tv';
  const isGrocery  = category === 'grocery';
  const isTravel   = category === 'travel';
  const isWishlist = (category === 'make' || category === 'buy');

  document.querySelectorAll('.list-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === category);
  });

  document.getElementById('cars-view').style.display     = isCars    ? 'block' : 'none';
  document.getElementById('period-view').style.display   = isPeriod  ? 'flex'  : 'none';
  document.getElementById('tv-view').style.display       = isTv      ? 'flex'  : 'none';
  document.getElementById('grocery-view').style.display  = isGrocery ? 'flex'  : 'none';
  document.getElementById('travel-view').style.display   = isTravel  ? 'flex'  : 'none';
  document.getElementById('make-view').style.display     = (category === 'make') ? 'flex' : 'none';
  document.getElementById('buy-view').style.display      = (category === 'buy')  ? 'flex' : 'none';
  document.querySelector('.content').style.display       = isTodo    ? 'flex'  : 'none';
  document.querySelector('.date-strip').style.display    = isTodo    ? 'flex'  : 'none';

  const dropzone = document.getElementById('wishlist-dropzone');
  if (dropzone) dropzone.classList.toggle('active', isWishlist);

  const printBtnWrap = document.getElementById('print-btn').parentElement;
  printBtnWrap.style.display = (isTodo || isGrocery) ? 'flex' : 'none';

  // Auto-switch theme to match the active tab
  const themeSelect = document.getElementById('theme-select');
  if (isGrocery) themeSelect.value = 'grocery';
  else if (isTodo) themeSelect.value = 'ops';

  const titleEl   = document.querySelector('.topbar-title');
  const eyebrowEl = document.getElementById('topbar-date');
  if (isCars)              titleEl.textContent = 'CARS SCORES';
  else if (isPeriod)       titleEl.textContent = 'CYCLE TRACKER';
  else if (isTv)           titleEl.textContent = 'THE LIST';
  else if (isGrocery)      titleEl.textContent = 'MARKET RUN';
  else if (isTravel)       titleEl.textContent = 'TRAVEL';
  else if (category === 'make') titleEl.textContent = 'WANNA MAKE';
  else if (category === 'buy')  titleEl.textContent = 'WANNA BUY';
  else                     titleEl.textContent = 'TO-DO LIST';

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
  } else if (isGrocery) {
    fetchGroceryItems();
  } else if (isTravel) {
    renderTravelView();
  } else if (isWishlist) {
    fetchWishlist(category);
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
  physics: { label: 'Physics',  total: 376  },
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
        ` : ``}
        <div class="subject-label">${label}</div>
        ${isEditing ? `` : `<div class="subject-pct">${Math.round(pct * 100)}%</div>`}
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

async function fetchWishlist(type) {
  wishlistType = type;
  const res = await fetch(`/api/wishlist?type=${type}&user=${currentUser}`);
  const { items } = await res.json();
  wishlistItems = items;
  renderWishlist(type, items);
}

function renderWishlist(type, items) {
  const boardId = type === 'make' ? 'make-board' : 'buy-board';
  const board = document.getElementById(boardId);
  board.innerHTML = '';
  wishlistMaxZ = 10;
  items.forEach(item => {
    wishlistMaxZ = Math.max(wishlistMaxZ, item.z_index || 1);
    board.appendChild(createPolaroidEl(item, board));
  });
}

function createPolaroidEl(item, board) {
  const el = document.createElement('div');
  el.className = 'polaroid';
  el.dataset.id = item.id;
  el.style.transform = `rotate(${item.rotation}deg)`;
  el.style.zIndex = item.z_index || 1;
  el.style.left = item.pos_x + '%';
  el.style.top  = item.pos_y + '%';

  // Pushpin
  const pin = document.createElement('div');
  pin.className = 'pushpin';
  el.appendChild(pin);

  // Image or placeholder
  if (item.image_filename) {
    const img = document.createElement('img');
    img.className = 'polaroid-img';
    img.src = `/api/images/${item.image_filename}`;
    img.draggable = false;
    el.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'polaroid-img-placeholder';
    ph.textContent = '?';
    el.appendChild(ph);
  }

  // Caption
  const cap = document.createElement('div');
  const hasTitle = item.title && item.title.trim();
  const hasUrl = item.source_url && item.source_url.trim();
  cap.className = 'polaroid-caption' + (!hasTitle && hasUrl ? ' is-url' : '');

  let captionText = '';
  if (hasTitle) {
    captionText = item.title;
  } else if (hasUrl) {
    try { captionText = new URL(item.source_url).hostname; }
    catch { captionText = item.source_url.slice(0, 30); }
  }

  if (captionText && hasUrl) {
    const a = document.createElement('a');
    a.href = item.source_url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = captionText;
    a.addEventListener('pointerdown', e => e.stopPropagation());
    cap.appendChild(a);
  } else {
    cap.textContent = captionText;
  }
  el.appendChild(cap);

  // Delete button
  const del = document.createElement('button');
  del.className = 'polaroid-delete';
  del.textContent = '×';
  del.title = 'delete';
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('Remove this?')) return;
    await fetch(`/api/wishlist/${item.id}`, { method: 'DELETE' });
    el.remove();
  });
  el.appendChild(del);

  // Drag / click logic
  let startX, startY, moved;
  el.addEventListener('pointerdown', (e) => {
    if (e.target === del) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    startX = e.clientX; startY = e.clientY; moved = false;
    el.style.zIndex = ++wishlistMaxZ;
    const boardRect = board.getBoundingClientRect();
    const scroller = board.parentElement; // wishlist-view
    const offsetX = e.clientX - boardRect.left + scroller.scrollLeft - el.offsetLeft;
    const offsetY = e.clientY - boardRect.top + scroller.scrollTop - el.offsetTop;
    wishlistDragState = { el, id: item.id, board, boardRect, scroller, offsetX, offsetY };
  });

  el.addEventListener('pointermove', (e) => {
    if (!wishlistDragState || wishlistDragState.id !== item.id) return;
    if (!moved && (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5)) {
      moved = true;
      el.classList.add('dragging');
    }
    if (!moved) return;
    const { boardRect, scroller, offsetX, offsetY } = wishlistDragState;
    const newLeft = e.clientX - boardRect.left + scroller.scrollLeft - offsetX;
    const newTop = e.clientY - boardRect.top + scroller.scrollTop - offsetY;
    el.style.left = newLeft + 'px';
    el.style.top = newTop + 'px';
  });

  el.addEventListener('pointerup', async (e) => {
    if (!wishlistDragState || wishlistDragState.id !== item.id) return;
    el.classList.remove('dragging');
    const wasMoved = moved;
    wishlistDragState = null;

    if (!wasMoved) {
      // Click — open edit modal
      openWishlistModal(item);
      return;
    }

    // Save new position as percentage
    const pos_x = (el.offsetLeft / board.offsetWidth) * 100;
    const pos_y = (el.offsetTop / board.offsetHeight) * 100;
    item.pos_x = pos_x; item.pos_y = pos_y;
    item.z_index = parseInt(el.style.zIndex) || 1;

    await fetch(`/api/wishlist/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pos_x, pos_y, z_index: item.z_index })
    });
  });

  return el;
}

// ── Drop zone ──────────────────────────────────────────────────────────────────
function initWishlistDropzone() {
  const zone = document.getElementById('wishlist-dropzone');
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files && files.length > 0 && files[0].type.startsWith('image/')) {
      // Image file dropped
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        openWishlistModal(null, ev.target.result, null);
      };
      reader.readAsDataURL(file);
      return;
    }

    // URL dropped
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '';
    if (url) {
      openWishlistModal(null, null, url);
    } else {
      openWishlistModal(null, null, null);
    }
  });

  // Also allow clicking the dropzone to open the modal
  zone.addEventListener('click', () => openWishlistModal(null, null, null));
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openWishlistModal(existingItem, imageDataUrl, prefillUrl) {
  modalEditingId = existingItem ? existingItem.id : null;
  modalImageFilename = existingItem ? existingItem.image_filename : null;
  modalImageDataUrl = imageDataUrl || null;

  // Reset fields
  document.getElementById('modal-url').value = existingItem?.source_url || prefillUrl || '';
  document.getElementById('modal-heading').value = existingItem?.title || '';
  document.getElementById('modal-fetch-status').textContent = '';

  // Image preview
  const preview = document.getElementById('modal-img-preview');
  preview.innerHTML = '';
  if (modalImageDataUrl) {
    const img = document.createElement('img');
    img.src = modalImageDataUrl;
    preview.appendChild(img);
  } else if (modalImageFilename) {
    const img = document.createElement('img');
    img.src = `/api/images/${modalImageFilename}`;
    preview.appendChild(img);
  } else {
    preview.innerHTML = '<div class="no-img-hint">click to attach image<br>or fetch from url below</div>';
  }

  // Show/hide delete button
  document.getElementById('modal-delete-btn').style.display = existingItem ? 'flex' : 'none';

  // If URL pre-filled and no image yet, auto-fetch
  if (prefillUrl && !modalImageDataUrl && !modalImageFilename) {
    fetchOgFromModal();
  }

  document.getElementById('wishlist-modal').style.display = 'flex';
}

function closeWishlistModal() {
  document.getElementById('wishlist-modal').style.display = 'none';
  modalEditingId = null;
  modalImageFilename = null;
  modalImageDataUrl = null;
}

function onModalFileSelected(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    modalImageDataUrl = e.target.result;
    modalImageFilename = null;
    const preview = document.getElementById('modal-img-preview');
    preview.innerHTML = '';
    const img = document.createElement('img');
    img.src = modalImageDataUrl;
    preview.appendChild(img);
  };
  reader.readAsDataURL(file);
}

async function fetchOgFromModal() {
  const url = document.getElementById('modal-url').value.trim();
  if (!url) return;
  const status = document.getElementById('modal-fetch-status');
  status.textContent = 'fetching...';
  try {
    const res = await fetch('/api/wishlist/fetch-og', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (data.success && data.filename) {
      modalImageFilename = data.filename;
      modalImageDataUrl = null;
      const preview = document.getElementById('modal-img-preview');
      preview.innerHTML = '';
      const img = document.createElement('img');
      img.src = `/api/images/${data.filename}`;
      preview.appendChild(img);
      status.textContent = 'got it!';
    } else {
      status.textContent = 'no image found — attach one manually';
    }
  } catch {
    status.textContent = 'fetch failed — attach one manually';
  }
}

async function saveWishlistItem() {
  const title = document.getElementById('modal-heading').value.trim();
  const sourceUrl = document.getElementById('modal-url').value.trim();

  if (modalEditingId) {
    // Update existing (title + url only; image not changeable after creation for now)
    await fetch(`/api/wishlist/${modalEditingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, source_url: sourceUrl })
    });
    closeWishlistModal();
    await fetchWishlist(wishlistType);
    return;
  }

  // Create new
  const body = {
    listType: wishlistType,
    title,
    sourceUrl,
    user: currentUser,
  };
  if (modalImageDataUrl) {
    body.imageData = modalImageDataUrl;
  } else if (modalImageFilename) {
    body.imageFilename = modalImageFilename;
  }

  const res = await fetch('/api/wishlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const { item } = await res.json();
  closeWishlistModal();

  // Add to board without full re-render
  const boardId = wishlistType === 'make' ? 'make-board' : 'buy-board';
  const board = document.getElementById(boardId);
  board.appendChild(createPolaroidEl(item, board));
}

async function deleteWishlistItem() {
  if (!modalEditingId) return;
  if (!confirm('Remove this?')) return;
  await fetch(`/api/wishlist/${modalEditingId}`, { method: 'DELETE' });
  closeWishlistModal();
  await fetchWishlist(wishlistType);
}

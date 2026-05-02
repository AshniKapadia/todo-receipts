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
  const isTodo        = category === 'todo';
  const isCars        = category === 'cars';
  const isPeriod      = category === 'period';
  const isTv          = category === 'tv';
  const isGrocery     = category === 'grocery';
  const isTravel      = category === 'travel';
  const isWishlist    = (category === 'make' || category === 'buy');
  const isInvestments = category === 'investments';

  document.querySelectorAll('.list-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === category);
  });

  document.getElementById('cars-view').style.display        = isCars        ? 'block' : 'none';
  document.getElementById('period-view').style.display      = isPeriod      ? 'flex'  : 'none';
  document.getElementById('tv-view').style.display          = isTv          ? 'flex'  : 'none';
  document.getElementById('grocery-view').style.display     = isGrocery     ? 'flex'  : 'none';
  document.getElementById('travel-view').style.display      = isTravel      ? 'flex'  : 'none';
  document.getElementById('make-view').style.display        = (category === 'make') ? 'flex' : 'none';
  document.getElementById('buy-view').style.display         = (category === 'buy')  ? 'flex' : 'none';
  document.querySelector('.content').style.display          = isTodo        ? 'flex'  : 'none';
  document.querySelector('.date-strip').style.display       = isTodo        ? 'flex'  : 'none';
  document.getElementById('inv-section').style.display      = isInvestments ? 'flex'  : 'none';

  // Hide topbar when investments is active (has its own hero)
  document.querySelector('.topbar').style.display = isInvestments ? 'none' : '';

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
  document.getElementById('cars-sheet-link').style.display = isCars ? 'inline-block' : 'none';
  if (isCars)              titleEl.textContent = 'Scores';
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
    fetchSectionScores();
    renderDrawingsTable();
  } else if (isPeriod) {
    fetchPeriodLogs();
  } else if (isGrocery) {
    fetchGroceryItems();
  } else if (isTravel) {
    renderTravelView();
  } else if (isWishlist) {
    fetchWishlist(category);
  } else if (isInvestments) {
    Investments.init();
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
  if ((denom === 7 && num === 6) || (denom === 6 && num === 5)) return 'green';
  if (diff <= 2) return 'yellow';
  return 'red';
}

function renderCarsGrid(entries) {
  const grid = document.getElementById('cars-grid');
  if (entries.length === 0) {
    grid.innerHTML = '<div class="cars-loading">No data yet.</div>';
    return;
  }

  grid.innerHTML = `<div class="cars-weeks">${
    entries.map(({ date, score }) => `
      <div class="cars-day">
        <div class="cars-circle ${scoreColor(score)}">${escapeHtml(score)}</div>
        <div class="cars-date">${escapeHtml(date)}</div>
      </div>
    `).join('')
  }</div>`;
}

// ── Subject Progress ──────────────────────────────────────────────────────────
const SECTION_SCORES_URL = 'https://docs.google.com/spreadsheets/d/17P30_NWjBy2Nm9keI-w5qxdKkNzFtaJbKvIfzsS0Hks/gviz/tq?tqx=out:csv&gid=277032242';

async function fetchSectionScores() {
  const grid = document.getElementById('subjects-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="cars-loading">Loading...</div>';

  try {
    const res = await fetch(SECTION_SCORES_URL);
    const text = await res.text();
    const rows = text.trim().split('\n').slice(1);
    const entries = rows
      .map(row => {
        const parts = row.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        return { label: parts[0], done: parseInt(parts[1], 10) || 0, total: parseInt(parts[2], 10) || 0 };
      })
      .filter(e => e.label && e.total > 0);
    renderSubjectCircles(entries);
  } catch (err) {
    grid.innerHTML = `<div class="error">Failed to load section scores: ${escapeHtml(err.message)}</div>`;
  }
}

function renderSubjectCircles(entries) {
  const grid = document.getElementById('subjects-grid');
  if (!grid) return;

  const R = 48;
  const CIRCUM = +(2 * Math.PI * R).toFixed(2);

  grid.innerHTML = entries.map(({ label, done, total }) => {
    const pct    = Math.min(done / total, 1);
    const offset = +(CIRCUM * (1 - pct)).toFixed(2);

    return `
      <div class="subject-circle-wrap">
        <div class="subject-svg-container">
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
        <div class="subject-label">${escapeHtml(label)}</div>
        <div class="subject-pct">${Math.round(pct * 100)}%</div>
      </div>
    `;
  }).join('');
}

// ── Daily Drawings ────────────────────────────────────────────────────────────
const DRAWINGS = [
  'Amino Acids', 'Physics Eq.', 'Oogenesis', 'Basal Body',
  'CAC', 'Glycolysis', 'Gluconeo.', 'PPP', 'ETC'
];

function loadDrawingsLog() {
  try { return JSON.parse(localStorage.getItem('drawings-log') || '{}'); }
  catch { return {}; }
}

function toggleDrawingCell(dateStr, name) {
  const log = loadDrawingsLog();
  if (!log[dateStr]) log[dateStr] = [];
  const i = log[dateStr].indexOf(name);
  if (i === -1) log[dateStr].push(name);
  else log[dateStr].splice(i, 1);
  localStorage.setItem('drawings-log', JSON.stringify(log));
  renderDrawingsTable();
}

function renderDrawingsTable() {
  const thead = document.getElementById('drawings-thead');
  const tbody = document.getElementById('drawings-tbody');
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr>
    <th class="drawings-th drawings-th-date">DATE</th>
    ${DRAWINGS.map(n => `<th class="drawings-th">${escapeHtml(n)}</th>`).join('')}
  </tr>`;

  const log = loadDrawingsLog();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = [];

  const start = new Date(2026, 3, 9);  // Apr 9
  const end   = new Date(2026, 4, 15); // May 15

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
    const checked = log[iso] || [];
    const isToday = d.getTime() === today.getTime();

    rows.push(`<tr class="drawings-row${isToday ? ' today' : ''}">
      <td class="drawings-date-cell">${label}</td>
      ${DRAWINGS.map(name => `<td class="drawings-check-cell${checked.includes(name) ? ' checked' : ''}"
        onclick="toggleDrawingCell('${iso}','${name}')">${checked.includes(name) ? '✓' : ''}</td>`).join('')}
    </tr>`);
  }
  tbody.innerHTML = rows.join('');
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

// ══════════════════════════════════════════════════════════════════════════════
// THE FLOOR — Investment Tracker
// ══════════════════════════════════════════════════════════════════════════════

const Investments = {
  currentAccount: 'all',
  currentFilter: 'unannotated',
  currentInnerTab: 'trades',
  transactions: [],
  patterns: null,
  charts: {},
  listenersAttached: false,

  async init() {
    if (!this.listenersAttached) {
      this.attachListeners();
      this.listenersAttached = true;
    }
    await Promise.all([this.loadPatterns(), this.loadTransactions()]);
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
    if (textEl)    textEl.textContent    = a.annotated + ' / ' + a.total + ' decoded';

    // Sync analysis panel progress
    const pfill      = document.getElementById('inv-analysis-pfill');
    const ptext      = document.getElementById('inv-analysis-ptext');
    const analyzeBtn = document.getElementById('inv-analyze-btn');
    const analyzeHint = document.getElementById('inv-analyze-hint');
    if (pfill)  pfill.style.width  = pct + '%';
    if (ptext)  ptext.textContent  = a.annotated + ' / ' + a.total + ' decoded';
    const unlocked = a.annotated >= 50;
    if (analyzeBtn)  analyzeBtn.disabled = !unlocked;
    if (analyzeHint) analyzeHint.textContent = unlocked
      ? 'Analysis ready — powered by Claude API'
      : `Decode ${Math.max(0, 50 - a.annotated)} more trades to unlock`;
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
      const msg = this.currentFilter === 'unannotated'
        ? '🎉 All trades decoded! Switch to "All" to see everything.'
        : 'No trades found.';
      tbody.innerHTML = `<tr><td colspan="9" class="inv-empty-row">${msg}</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(t => {
      const isBuy = t.action_type === 'BUY' || t.action_type === 'OPTIONS_BUY';
      const amt   = t.amount ? '$' + Math.abs(t.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
      const price = t.price  ? '$' + parseFloat(t.price).toFixed(2)  : '—';
      const qty   = t.quantity ? (+t.quantity).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—';
      const badgeCls = 'inv-action-' + t.action_type.toLowerCase();
      const acct  = t.account === 'Joint WROS' ? 'JOINT' : 'ROTH';
      return `
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
    document.getElementById('inv-analyze-btn')?.addEventListener('click', () => {
      alert('Behavior analysis is coming soon.\n\nOnce connected to the Claude API, this will analyze your annotated trade reasons and surface patterns in your decision-making.');
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
      document.getElementById('inv-preview-stats').innerHTML =
        `<span class="inv-preview-count inv-import-success">✓ ${data.imported} new transactions imported</span>` +
        (data.duplicates > 0 ? `<span class="inv-preview-detail">${data.duplicates} duplicates skipped</span>` : '');
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

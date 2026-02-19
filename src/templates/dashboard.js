// State
let todos = [];
let editingId = null;

// API base URL
const API_BASE = '';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  fetchTodos();

  // Enter key to add task
  const input = document.getElementById('add-input');
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addTask();
    }
  });
});

// Fetch todos from API
async function fetchTodos() {
  try {
    const response = await fetch(`${API_BASE}/api/todos`);
    const data = await response.json();
    todos = data.todos;
    renderTodos();
    updateStats();
    hideError();
  } catch (error) {
    showError('Failed to load tasks: ' + error.message);
  }
}

// Render todos to DOM
function renderTodos() {
  const container = document.getElementById('tasks-list');

  if (todos.length === 0) {
    container.innerHTML = '<div class="empty-state">No tasks yet! Add one above.</div>';
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
              onkeypress="handleEditKeypress(event, ${todo.id})"
            />
            <div class="task-actions">
              <button class="task-btn" onclick="saveEdit(${todo.id})">Save</button>
              <button class="task-btn" onclick="cancelEdit()">Cancel</button>
            </div>
          </div>
        `;
      }

      const timeInfo = todo.time_estimate ? `<div style="font-size: 11px; color: #999; margin-top: 4px;">${escapeHtml(todo.time_estimate)}</div>` : '';

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
          <div class="task-title" onclick="startEdit(${todo.id})" style="flex: 1;">
            <div>${escapeHtml(todo.title)}</div>
            ${timeInfo}
          </div>
          <div class="task-actions">
            <button class="task-btn" onclick="startEdit(${todo.id})">Edit</button>
            <button class="task-btn delete" onclick="deleteTodo(${todo.id})">Delete</button>
          </div>
        </div>
      `;
    })
    .join('');

  // Focus edit input if editing
  if (editingId !== null) {
    const input = document.getElementById(`edit-input-${editingId}`);
    if (input) {
      input.focus();
      input.select();
    }
  }
}

// Update stats
function updateStats() {
  const total = todos.length;
  const completed = todos.filter((t) => t.completed).length;
  const pending = total - completed;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-completed').textContent = completed;
  document.getElementById('stat-pending').textContent = pending;
}

// Add new task
async function addTask() {
  const input = document.getElementById('add-input');
  const time = document.getElementById('add-time');

  const title = input.value.trim();
  if (!title) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        time_estimate: time.value.trim(),
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create task');
    }

    const data = await response.json();
    todos.unshift(data.todo);
    input.value = '';
    time.value = '';
    // Keep category and priority selected
    renderTodos();
    updateStats();
    hideError();
  } catch (error) {
    showError('Failed to add task: ' + error.message);
  }
}

// Toggle completion status
async function toggleComplete(id) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;

  try {
    const response = await fetch(`${API_BASE}/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !todo.completed }),
    });

    if (!response.ok) {
      throw new Error('Failed to update task');
    }

    const data = await response.json();
    const index = todos.findIndex((t) => t.id === id);
    todos[index] = data.todo;
    renderTodos();
    updateStats();
    hideError();
  } catch (error) {
    showError('Failed to update task: ' + error.message);
    // Revert checkbox
    fetchTodos();
  }
}

// Start editing
function startEdit(id) {
  if (editingId === id) return;
  editingId = id;
  renderTodos();
}

// Cancel editing
function cancelEdit() {
  editingId = null;
  renderTodos();
}

// Save edit
async function saveEdit(id) {
  const input = document.getElementById(`edit-input-${id}`);
  const title = input.value.trim();

  if (!title) {
    showError('Task title cannot be empty');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      throw new Error('Failed to update task');
    }

    const data = await response.json();
    const index = todos.findIndex((t) => t.id === id);
    todos[index] = data.todo;
    editingId = null;
    renderTodos();
    hideError();
  } catch (error) {
    showError('Failed to update task: ' + error.message);
  }
}

// Handle keypress in edit input
function handleEditKeypress(event, id) {
  if (event.key === 'Enter') {
    saveEdit(id);
  } else if (event.key === 'Escape') {
    cancelEdit();
  }
}

// Delete task
async function deleteTodo(id) {
  if (!confirm('Delete this task?')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/todos/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to delete task');
    }

    todos = todos.filter((t) => t.id !== id);
    renderTodos();
    updateStats();
    hideError();
  } catch (error) {
    showError('Failed to delete task: ' + error.message);
  }
}

// Print receipt
async function printReceipt() {
  const btn = event.target;
  const originalText = btn.textContent;

  btn.disabled = true;
  btn.textContent = 'Printing...';

  try {
    const response = await fetch(`${API_BASE}/api/print`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to print receipt');
    }

    const data = await response.json();

    // Open receipt in new tab
    const fullUrl = `file://${data.filePath}`;
    window.open(fullUrl, '_blank');

    btn.textContent = 'Printed!';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);

    hideError();
  } catch (error) {
    showError('Failed to print receipt: ' + error.message);
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// Show error
function showError(message) {
  const container = document.getElementById('error-container');
  container.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

// Hide error
function hideError() {
  const container = document.getElementById('error-container');
  container.innerHTML = '';
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Drag and drop
let draggedElement = null;

function handleDragStart(event) {
  draggedElement = event.currentTarget;
  event.currentTarget.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/html', event.currentTarget.innerHTML);
}

function handleDragOver(event) {
  if (event.preventDefault) {
    event.preventDefault();
  }
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
  if (event.stopPropagation) {
    event.stopPropagation();
  }

  event.currentTarget.classList.remove('drag-over');

  if (draggedElement !== event.currentTarget) {
    // Get all task items
    const allItems = Array.from(document.querySelectorAll('.task-item'));
    const draggedIndex = allItems.indexOf(draggedElement);
    const targetIndex = allItems.indexOf(event.currentTarget);

    // Reorder in our local array
    const [movedItem] = todos.splice(draggedIndex, 1);
    todos.splice(targetIndex, 0, movedItem);

    // Re-render immediately for visual feedback
    renderTodos();
    updateStats();

    // Save new order to server
    const orderedIds = todos.map(t => t.id);
    fetch(`${API_BASE}/api/todos/reorder`, {
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
  // Remove all drag-over classes
  document.querySelectorAll('.drag-over').forEach(el => {
    el.classList.remove('drag-over');
  });
}

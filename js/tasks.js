// ============================================================
// NeverMiss CRM — Daily Tasks
// ============================================================
import { supabase } from './client.js';
import { showToast } from './app.js';

export async function renderTasks() {
  const today = new Date().toISOString().split('T')[0];
  const pane = document.getElementById('pane-tasks');

  pane.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">Daily Tasks</div>
        <div class="section-sub">${new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}</div>
      </div>
    </div>
    <div class="table-wrap" style="max-width:640px">
      <div style="padding:16px;border-bottom:1px solid var(--border);display:flex;gap:8px">
        <input type="text" class="form-input" id="newTaskInput" placeholder="Add a task for today…" style="flex:1">
        <button class="btn btn-primary" id="addTaskBtn">Add</button>
      </div>
      <div id="taskList">
        <div style="text-align:center;padding:30px"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  document.getElementById('addTaskBtn').onclick = addTask;
  document.getElementById('newTaskInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTask();
  });

  await loadTasks(today);
}

async function loadTasks(today) {
  const { data, error } = await supabase
    .from('daily_tasks')
    .select('*')
    .eq('task_date', today)
    .order('created_at', { ascending: true });

  if (error) { showToast('Failed to load tasks', true); return; }

  const list = document.getElementById('taskList');
  if (!list) return;

  const tasks = data || [];

  if (!tasks.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-title">No tasks for today</div><div class="empty-state-sub">Add your first task above</div></div>`;
    return;
  }

  const done = tasks.filter(t => t.completed).length;
  list.innerHTML = `
    <div style="padding:10px 16px 6px;font-size:12px;color:var(--text-muted);font-weight:500">
      ${done}/${tasks.length} completed
    </div>
    ${tasks.map(t => `
      <div class="task-item" data-id="${t.id}">
        <input type="checkbox" class="task-cb" data-id="${t.id}" ${t.completed ? 'checked' : ''}>
        <span class="task-text ${t.completed ? 'done' : ''}">${esc(t.content)}</span>
        <button class="task-delete" data-id="${t.id}" title="Delete">×</button>
      </div>
    `).join('')}
  `;

  list.querySelectorAll('.task-cb').forEach(cb => {
    cb.addEventListener('change', async () => {
      const row = cb.closest('.task-item');
      const text = row.querySelector('.task-text');
      text.classList.toggle('done', cb.checked);
      await supabase.from('daily_tasks').update({ completed: cb.checked }).eq('id', cb.dataset.id);
    });
  });

  list.querySelectorAll('.task-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await supabase.from('daily_tasks').delete().eq('id', btn.dataset.id);
      if (!error) btn.closest('.task-item').remove();
    });
  });
}

async function addTask() {
  const input = document.getElementById('newTaskInput');
  const content = input?.value.trim();
  if (!content) return;

  const today = new Date().toISOString().split('T')[0];
  const { error } = await supabase.from('daily_tasks').insert({ content, task_date: today });
  if (error) { showToast('Failed to add task', true); return; }

  input.value = '';
  await loadTasks(today);
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

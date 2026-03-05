// ============================================================
// NeverMiss CRM — Follow-up Calendar
// ============================================================
import { supabase } from './client.js';
import { openLead, showToast } from './app.js';

let calFilter = 'today';

export async function renderCalendar() {
  const pane = document.getElementById('pane-calendar');
  pane.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">Follow-up Calendar</div>
        <div class="section-sub">Leads with scheduled follow-up actions</div>
      </div>
    </div>

    <div class="filter-tabs mb-16">
      <button class="filter-tab active" data-filter="today">Today</button>
      <button class="filter-tab" data-filter="week">This Week</button>
      <button class="filter-tab" data-filter="overdue">Overdue</button>
      <button class="filter-tab" data-filter="all">All Upcoming</button>
    </div>

    <div class="table-wrap">
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>Business</th>
              <th>Contact</th>
              <th>Phone</th>
              <th>Action Type</th>
              <th>Date</th>
              <th>Stage</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="calBody">
            <tr class="loading-row"><td colspan="7"><div class="spinner"></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      calFilter = tab.dataset.filter;
      loadCalData();
    });
  });

  await loadCalData();
}

async function loadCalData() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  const weekStr = endOfWeek.toISOString().split('T')[0];

  let query = supabase
    .from('leads')
    .select('id, business_name, contact_name, phone, email, next_action_type, next_action_date, pipeline_stage')
    .not('next_action_date', 'is', null)
    .order('next_action_date', { ascending: true });

  if (calFilter === 'today') {
    query = query.eq('next_action_date', todayStr);
  } else if (calFilter === 'week') {
    query = query.gte('next_action_date', todayStr).lte('next_action_date', weekStr);
  } else if (calFilter === 'overdue') {
    query = query.lt('next_action_date', todayStr);
  } else {
    query = query.gte('next_action_date', todayStr);
  }

  const { data, error } = await query;
  if (error) { showToast('Failed to load calendar', true); return; }

  const leads = data || [];
  const tbody = document.getElementById('calBody');
  if (!tbody) return;

  if (!leads.length) {
    const msgs = {
      today: "Nothing due today — you're all caught up!",
      week: "No follow-ups this week",
      overdue: "No overdue follow-ups — nice work!",
      all: "No upcoming follow-ups scheduled"
    };
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-state-title">${msgs[calFilter]}</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = leads.map(l => {
    const date = new Date(l.next_action_date + 'T12:00:00');
    const dateStr = date.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
    const isOverdue = l.next_action_date < todayStr;
    const stageClass = l.pipeline_stage.replace(/ /g,'');

    return `
      <tr class="${isOverdue ? 'overdue-row' : ''}">
        <td class="td-name"><a href="#" class="open-lead" data-id="${l.id}">${esc(l.business_name)}</a></td>
        <td>${esc(l.contact_name || '—')}</td>
        <td>${l.phone ? `<a href="tel:${esc(l.phone)}" style="color:var(--text-secondary)">${esc(l.phone)}</a>` : '—'}</td>
        <td><span style="color:var(--accent);font-weight:600;font-size:12.5px">${esc(l.next_action_type || 'Follow up')}</span></td>
        <td style="font-weight:${isOverdue ? '700' : '400'};color:${isOverdue ? '#dc2626' : 'inherit'}">${dateStr}${isOverdue ? ' ⚠️' : ''}</td>
        <td><span class="badge badge-${stageClass}">${l.pipeline_stage}</span></td>
        <td>
          <div class="td-actions">
            ${l.phone ? `<a href="tel:${esc(l.phone)}" class="btn btn-secondary btn-sm">📞 Call</a>` : ''}
            ${l.email ? `<a href="mailto:${esc(l.email)}" class="btn btn-secondary btn-sm">✉ Email</a>` : ''}
            <button class="btn btn-ghost btn-sm mark-done" data-id="${l.id}">✓ Done</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.open-lead').forEach(el =>
    el.addEventListener('click', (e) => { e.preventDefault(); openLead(el.dataset.id); })
  );

  tbody.querySelectorAll('.mark-done').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await supabase
        .from('leads')
        .update({ next_action_date: null, next_action_type: null })
        .eq('id', btn.dataset.id);
      if (!error) { showToast('Action marked complete'); await loadCalData(); }
    });
  });
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ============================================================
// NeverMiss CRM — Leads Table
// ============================================================
import { supabase } from './client.js';
import { openLead, showToast } from './app.js';

let allLeads = [];
let sortCol = 'created_at';
let sortDir = 'desc';
let searchQuery = '';
let selectedIds = new Set();

export async function renderLeads() {
  const pane = document.getElementById('pane-leads');
  pane.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">Leads</div>
        <div class="section-sub" id="leadsCount">Loading…</div>
      </div>
      <div class="flex gap-8">
        <button class="btn btn-secondary btn-sm" id="btnImportCsv">↑ Import CSV</button>
        <button class="btn btn-secondary btn-sm" id="btnExportCsv">↓ Export CSV</button>
        <button class="btn btn-danger btn-sm" id="btnBulkDelete" style="display:none">Delete Selected</button>
        <button class="btn btn-primary" id="addLeadBtnTable">+ Add Lead</button>
      </div>
    </div>
    <div class="table-wrap">
      <div class="table-toolbar">
        <input type="search" class="search-input" id="leadsSearch" placeholder="Search leads…">
        <select class="form-select" style="width:auto;padding:6px 10px;font-size:13px" id="stageFilter">
          <option value="">All Stages</option>
          <option>New Leads</option>
          <option>Contacted</option>
          <option>Called</option>
          <option>Demo Scheduled</option>
          <option>Demo Done</option>
          <option>Closed Won</option>
          <option>Closed Lost</option>
          <option>DQ</option>
        </select>
        <select class="form-select" style="width:auto;padding:6px 10px;font-size:13px" id="priorityFilter">
          <option value="">All Priority</option>
          <option>A</option>
          <option>B</option>
          <option>C</option>
        </select>
      </div>
      <div style="overflow-x:auto">
        <table id="leadsTable">
          <thead>
            <tr>
              <th class="cb-col"><input type="checkbox" id="selectAll"></th>
              <th data-col="business_name">Business</th>
              <th data-col="contact_name">Contact</th>
              <th data-col="phone">Phone</th>
              <th data-col="industry">Industry</th>
              <th data-col="city">City</th>
              <th data-col="pipeline_stage">Stage</th>
              <th data-col="priority">Pri</th>
              <th data-col="next_action_date">Next Action</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="leadsBody">
            <tr class="loading-row"><td colspan="10"><div class="spinner"></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <input type="file" id="csvFileInput" accept=".csv" style="display:none">
  `;

  // Events
  document.getElementById('addLeadBtnTable').onclick = () =>
    document.getElementById('addLeadModal').classList.add('visible');

  document.getElementById('leadsSearch').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderRows();
  });

  document.getElementById('stageFilter').addEventListener('change', renderRows);
  document.getElementById('priorityFilter').addEventListener('change', renderRows);

  document.getElementById('selectAll').addEventListener('change', (e) => {
    const checked = e.target.checked;
    document.querySelectorAll('.row-cb').forEach(cb => {
      cb.checked = checked;
      if (checked) selectedIds.add(cb.dataset.id);
      else selectedIds.delete(cb.dataset.id);
    });
    updateBulkUI();
  });

  document.getElementById('btnBulkDelete').onclick = bulkDelete;

  document.getElementById('btnImportCsv').onclick = () =>
    document.getElementById('csvFileInput').click();

  document.getElementById('csvFileInput').addEventListener('change', handleCsvImport);

  document.getElementById('btnExportCsv').onclick = exportCsv;

  document.querySelectorAll('#leadsTable thead th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      if (sortCol === th.dataset.col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortCol = th.dataset.col; sortDir = 'asc'; }
      renderRows();
      document.querySelectorAll('#leadsTable thead th').forEach(t => t.classList.remove('sort-asc','sort-desc'));
      th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    });
  });

  await loadLeads();
}

async function loadLeads() {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { showToast('Failed to load leads', true); return; }
  allLeads = data || [];
  renderRows();
}

function renderRows() {
  const stageFilter = document.getElementById('stageFilter')?.value;
  const priorityFilter = document.getElementById('priorityFilter')?.value;

  let filtered = allLeads.filter(l => {
    const matchSearch = !searchQuery || [
      l.business_name, l.contact_name, l.email, l.phone, l.industry, l.city
    ].some(v => v && v.toLowerCase().includes(searchQuery));

    const matchStage = !stageFilter || l.pipeline_stage === stageFilter;
    const matchPriority = !priorityFilter || l.priority === priorityFilter;
    return matchSearch && matchStage && matchPriority;
  });

  // Sort
  filtered.sort((a, b) => {
    const va = a[sortCol] || '';
    const vb = b[sortCol] || '';
    const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const count = document.getElementById('leadsCount');
  if (count) count.textContent = `${filtered.length} lead${filtered.length !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('leadsBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">No leads found</div><div class="empty-state-sub">Try adjusting your filters or add a new lead</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(l => {
    const dateStr = l.next_action_date
      ? new Date(l.next_action_date + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' })
      : '—';

    const stageClass = l.pipeline_stage.replace(/ /g,'');

    return `
      <tr>
        <td class="cb-col"><input type="checkbox" class="row-cb" data-id="${l.id}" ${selectedIds.has(l.id) ? 'checked' : ''}></td>
        <td class="td-name">
          <a href="#" class="open-lead" data-id="${l.id}">${esc(l.business_name)}</a>
          <span class="smykm-dot${l.personalization_notes ? ' smykm-dot--yes' : ''}"
                title="${l.personalization_notes ? 'SMYKM research ready' : 'No SMYKM research'}"></span>
          <span class="smykm-dot${l.emails_drafted ? ' smykm-dot--yes' : ''}"
                title="${l.emails_drafted ? 'Emails drafted' : 'Emails not drafted'}"></span>
        </td>
        <td>${esc(l.contact_name || '—')}</td>
        <td>${l.phone ? `<a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>` : '—'}</td>
        <td class="td-muted">${esc(l.industry || '—')}</td>
        <td class="td-muted">${esc(l.city || '—')}</td>
        <td>
          <select class="stage-select" data-id="${l.id}">
            ${['New Leads','Contacted','Called','Demo Scheduled','Demo Done','Closed Won','Closed Lost','DQ'].map(s =>
              `<option ${l.pipeline_stage===s?'selected':''}>${s}</option>`
            ).join('')}
          </select>
        </td>
        <td><span class="badge badge-${l.priority||'C'}">${l.priority||'C'}</span></td>
        <td class="td-muted">${dateStr}</td>
        <td>
          <div class="td-actions">
            <button class="btn btn-ghost btn-sm open-lead" data-id="${l.id}">View</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Bind events
  tbody.querySelectorAll('.open-lead').forEach(el =>
    el.addEventListener('click', (e) => { e.preventDefault(); openLead(el.dataset.id); })
  );

  tbody.querySelectorAll('.stage-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const { error } = await supabase
        .from('leads')
        .update({ pipeline_stage: sel.value })
        .eq('id', sel.dataset.id);
      if (!error) showToast('Stage updated');
    });
  });

  tbody.querySelectorAll('.row-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) selectedIds.add(cb.dataset.id);
      else selectedIds.delete(cb.dataset.id);
      updateBulkUI();
    });
  });
}

function updateBulkUI() {
  const btn = document.getElementById('btnBulkDelete');
  if (btn) btn.style.display = selectedIds.size > 0 ? 'inline-flex' : 'none';
}

async function bulkDelete() {
  if (!selectedIds.size) return;
  if (!confirm(`Delete ${selectedIds.size} lead(s)? This cannot be undone.`)) return;

  const ids = [...selectedIds];
  const { error } = await supabase.from('leads').delete().in('id', ids);
  if (error) { showToast('Delete failed', true); return; }

  allLeads = allLeads.filter(l => !ids.includes(l.id));
  selectedIds.clear();
  updateBulkUI();
  renderRows();
  showToast(`Deleted ${ids.length} lead(s)`);
}

async function handleCsvImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  const text = await file.text();
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) { showToast('CSV is empty or invalid', true); return; }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,'').toLowerCase());

  const colMap = {
    // get-leads.py format
    'business name':  'business_name',
    'contact name':   'contact_name',
    // get-leads.py camelCase headers (normalized to lowercase, no space)
    'businessname':           'business_name',
    'contactname':            'contact_name',
    'location':               'city',
    // old CRM format
    'business':       'business_name',
    'contact':        'contact_name',
    'pipeline stage': 'pipeline_stage',
    'priority':       'priority',
    // shared
    'phone':          'phone',
    'email':          'email',
    'website':        'website',
    'industry':       'industry',
    'city':           'city',
    'state':          'state',
    'source':         'source',
    'address':                'address',
    // SMYKM fields (from /get-leads CSV — headers normalized to lowercase, no spaces)
    'personalizationnotes':   'personalization_notes',
    'recentwin':              'recent_win',
    'smykmsubjectline1':      'smykm_subject_1',
    'smykmsubjectline2':      'smykm_subject_2',
    'smykmsubjectline3':      'smykm_subject_3',
    'specialty':              'specialty',
    'values':                 'values_notes',
    'years':                  'years_in_business',
  };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      const field = colMap[h];
      if (field && vals[idx]) row[field] = vals[idx].trim();
    });
  const VALID_STAGES = ['New Leads','Contacted','Called','Demo Scheduled','Demo Done','Closed Won','Closed Lost','DQ'];
  const STAGE_MAP = {
    'new': 'New Leads', 'new leads': 'New Leads',
    'contacted': 'Contacted', 'cold': 'New Leads',
    'interested': 'Contacted', 'called': 'Called',
    'demo sent': 'Demo Scheduled', 'demo scheduled': 'Demo Scheduled',
    'appointment set': 'Demo Scheduled', 'demo done': 'Demo Done',
    'closed': 'Closed Won', 'closed won': 'Closed Won',
    'closed lost': 'Closed Lost', 'not interested': 'Closed Lost',
    'dq': 'DQ',
  };
  const VALID_PRIORITIES = ['A','B','C'];

    if (row.business_name) {
      // Sanitize pipeline_stage
      if (row.pipeline_stage) {
        const normalized = row.pipeline_stage.trim();
        if (VALID_STAGES.includes(normalized)) {
          row.pipeline_stage = normalized;
        } else {
          row.pipeline_stage = STAGE_MAP[normalized.toLowerCase()] || 'New Leads';
        }
      }
      // Sanitize priority
      if (row.priority && !VALID_PRIORITIES.includes(row.priority.trim())) {
        delete row.priority;
      }
      rows.push(row);
    }
  }

  if (!rows.length) { showToast('No valid rows in CSV', true); return; }

  const { error } = await supabase.from('leads').insert(rows);
  if (error) { showToast('Import failed: ' + error.message, true); return; }

  showToast(`Imported ${rows.length} leads`);
  await loadLeads();
}

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

function exportCsv() {
  const headers = ['Business Name','Contact Name','Phone','Email','Website','Industry','City','State','Pipeline Stage','Priority','Source','Next Action Date'];
  const rows = allLeads.map(l => [
    l.business_name, l.contact_name, l.phone, l.email, l.website,
    l.industry, l.city, l.state, l.pipeline_stage, l.priority, l.source, l.next_action_date
  ].map(v => `"${(v || '').replace(/"/g,'""')}"`));

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nevermiss-leads-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export { loadLeads };

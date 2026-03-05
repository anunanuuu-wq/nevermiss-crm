// ============================================================
// NeverMiss CRM — Pipeline Kanban
// ============================================================
import { supabase } from './client.js';
import { openLead } from './app.js';
import { showToast } from './app.js';

const STAGES = ['New Leads', 'Contacted', 'Called', 'Demo Scheduled', 'Demo Done', 'Closed Won', 'Closed Lost', 'DQ'];
const STAGE_SHORT = { 'New Leads': 'New', 'Contacted': 'Emailed', 'Called': 'Called', 'Demo Scheduled': 'Demo Sched', 'Demo Done': 'Demo Done', 'Closed Won': 'Won', 'Closed Lost': 'Lost', 'DQ': 'DQ' };

export async function renderPipeline() {
  const pane = document.getElementById('pane-pipeline');
  pane.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">Pipeline</div>
        <div class="section-sub">Drag cards between stages to update status</div>
      </div>
      <button class="btn btn-primary" id="addLeadBtnPipeline">+ Add Lead</button>
    </div>
    <div class="kanban-board" id="kanbanBoard">
      ${STAGES.map(s => `
        <div class="kanban-col col-${s.replace(/ /g,'')}" data-stage="${s}" id="col-${s.replace(/ /g,'')}">
          <div class="kanban-col-header">
            <div class="kanban-col-title">${s}</div>
            <div class="kanban-count" id="count-${s.replace(/ /g,'')}">0</div>
          </div>
          <div class="kanban-cards" id="cards-${s.replace(/ /g,'')}">
            <div style="text-align:center;padding:20px"><div class="spinner"></div></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById('addLeadBtnPipeline').addEventListener('click', () => {
    document.getElementById('addLeadModal').classList.add('visible');
  });

  await loadKanban();
}

async function loadKanban() {
  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, business_name, contact_name, phone, industry, priority, next_action_date, pipeline_stage')
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return; }

  // Clear cards
  STAGES.forEach(s => {
    const key = s.replace(/ /g,'');
    const el = document.getElementById(`cards-${key}`);
    if (el) el.innerHTML = '';
    const cnt = document.getElementById(`count-${key}`);
    if (cnt) cnt.textContent = '0';
  });

  // Group
  const grouped = {};
  STAGES.forEach(s => grouped[s] = []);
  (leads || []).forEach(l => { if (grouped[l.pipeline_stage]) grouped[l.pipeline_stage].push(l); });

  // Render
  STAGES.forEach(s => {
    const key = s.replace(/ /g,'');
    const el = document.getElementById(`cards-${key}`);
    const cnt = document.getElementById(`count-${key}`);
    if (!el) return;

    cnt.textContent = grouped[s].length;

    if (grouped[s].length === 0) {
      el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-faint);font-size:12px">No leads</div>';
    } else {
      grouped[s].forEach(lead => {
        el.appendChild(makeCard(lead));
      });
    }

    // Drop zone
    setupDropZone(el, s);
  });
}

function makeCard(lead) {
  const card = document.createElement('div');
  card.className = 'kanban-card';
  card.draggable = true;
  card.dataset.id = lead.id;
  card.dataset.stage = lead.pipeline_stage;

  const dateStr = lead.next_action_date
    ? new Date(lead.next_action_date + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' })
    : '';

  card.innerHTML = `
    <div class="kanban-card-name">${esc(lead.business_name)}</div>
    <div class="kanban-card-contact">${esc(lead.contact_name || '')}${lead.industry ? ` · ${esc(lead.industry)}` : ''}</div>
    <div class="kanban-card-footer">
      <span class="badge badge-${lead.priority || 'C'}">${lead.priority || 'C'}</span>
      ${dateStr ? `<span class="kanban-card-date">${dateStr}</span>` : ''}
    </div>
  `;

  card.addEventListener('click', () => openLead(lead.id));

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('leadId', lead.id);
    e.dataTransfer.setData('fromStage', lead.pipeline_stage);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  return card;
}

function setupDropZone(el, stage) {
  const col = el.closest('.kanban-col');
  col.addEventListener('dragover', (e) => {
    e.preventDefault();
    col.classList.add('drag-over');
  });
  col.addEventListener('dragleave', (e) => {
    if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over');
  });
  col.addEventListener('drop', async (e) => {
    e.preventDefault();
    col.classList.remove('drag-over');
    const leadId = e.dataTransfer.getData('leadId');
    const fromStage = e.dataTransfer.getData('fromStage');
    if (!leadId || fromStage === stage) return;

    const { error } = await supabase
      .from('leads')
      .update({ pipeline_stage: stage })
      .eq('id', leadId);

    if (error) {
      showToast('Failed to update stage', true);
    } else {
      showToast(`Moved to ${stage}`);
      await loadKanban();
    }
  });
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export { loadKanban };
